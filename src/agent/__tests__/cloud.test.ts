import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AccountStore } from '../accounts';
import { AgentCloud } from '../cloud';

jest.mock('axios');
jest.mock('@napi-rs/keyring', () => ({ Entry: jest.fn() }));
let home: string;
let accounts: AccountStore;
let cloud: AgentCloud;
const http = { get: jest.fn(), post: jest.fn(), delete: jest.fn() };
const input = () => ({ requestId: 'schedule-1', text: 'Release shipped', platforms: ['x'], scheduledAt: new Date(Date.now() + 3600000).toISOString() });
beforeEach(() => {
    jest.resetAllMocks();
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-cloud-test-'));
    const values = new Map<string, string>();
    accounts = new AccountStore(home, { get: key => values.get(key), set: (key, value) => { values.set(key, value); }, delete: key => { values.delete(key); } });
    accounts.setCloudToken('ds_prod_super_private_cloud_token');
    jest.mocked(axios.create).mockReturnValue(http as unknown as ReturnType<typeof axios.create>);
    http.get.mockResolvedValue({ data: { connected_platforms: ['x', 'mastodon'] } });
    http.post.mockResolvedValue({ data: { id: 'scheduled-123' } });
    http.delete.mockResolvedValue({ status: 204 });
    cloud = new AgentCloud(accounts);
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

it('uses HTTPS, no redirects and a bounded timeout for cloud credentials', () => {
    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({ timeout: 30000, maxRedirects: 0 }));
    expect(() => new AgentCloud(accounts, 'http://example.com')).toThrow('HTTPS');
    expect(() => new AgentCloud(accounts, 'https://user:password@example.com')).toThrow('HTTPS');
});
it('schedules against existing cloud connections without syncing any local keys', async () => {
    const result = await cloud.schedule({ ...input(), mediaUrls: ['https://cdn.example/image.png'] });
    expect(result.operation.status).toBe('completed');
    expect(result.operation.scheduledPostId).toBe('scheduled-123');
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post.mock.calls[0][0]).toBe('/v1/posts/schedule');
    expect(http.post.mock.calls[0][1]).toMatchObject({ text: 'Release shipped', platforms: ['x'], media_urls: ['https://cdn.example/image.png'], has_video: false });
    expect(JSON.stringify(result)).not.toContain('super_private');
});
it('recovers schedules by requestId without creating a second post', async () => {
    const request = input();
    await cloud.schedule(request);
    expect((await new AgentCloud(accounts).schedule(request)).replayed).toBe(true);
    expect(http.post).toHaveBeenCalledTimes(1);
    await expect(cloud.schedule({ ...request, text: 'different' })).rejects.toThrow('different content');
});
it('never retries an uncertain scheduling response automatically', async () => {
    const request = input();
    http.post.mockRejectedValue(new Error('Timeout for ds_prod_super_private_cloud_token'));
    const first = await cloud.schedule(request);
    expect(first.operation.status).toBe('needs_review');
    expect(first.operation.error).toContain('[REDACTED]');
    expect((await cloud.schedule(request)).replayed).toBe(true);
    expect(http.post).toHaveBeenCalledTimes(1);
});
it('rejects missing timezone, past schedules, missing cloud connections and duplicate platforms before writes', async () => {
    await expect(cloud.schedule({ ...input(), scheduledAt: '2026-01-01T10:00:00' })).rejects.toThrow();
    await expect(cloud.schedule({ ...input(), scheduledAt: new Date(0).toISOString() })).rejects.toThrow('future');
    await expect(cloud.schedule({ ...input(), platforms: ['linkedin'] })).rejects.toThrow('Connect all');
    await expect(cloud.schedule({ ...input(), platforms: ['x', 'x'] })).rejects.toThrow('unique');
    expect(http.post).not.toHaveBeenCalled();
});
it('rejects account IDs, local media, credential-bearing image URLs, threads and oversized scheduled text', async () => {
    for (const extra of [
        { accountIds: ['personal'] }, { posts: [{ text: 'Thread' }] },
        { mediaUrls: ['/tmp/local.png'] }, { mediaUrls: ['https://user:pass@example.com/a.png'] },
        { text: 'a'.repeat(281) }, { platforms: ['discord'] },
    ]) await expect(cloud.schedule({ ...input(), ...extra })).rejects.toThrow();
    expect(http.post).not.toHaveBeenCalled();
});
it('lists both supported server response shapes and rejects malformed responses', async () => {
    http.get.mockResolvedValueOnce({ data: [{ id: 'a' }] }).mockResolvedValueOnce({ data: { posts: [{ id: 'b' }] } }).mockResolvedValueOnce({ data: {} });
    expect(await cloud.list()).toEqual([{ id: 'a' }]);
    expect(await cloud.list()).toEqual([{ id: 'b' }]);
    await expect(cloud.list()).rejects.toThrow('invalid');
});
it('cancels once, preserving the cancellation result across repeated calls', async () => {
    const first = await cloud.cancel('cancel-1', 'post-123');
    expect(first.operation.status).toBe('completed');
    expect((await cloud.cancel('cancel-1', 'post-123')).replayed).toBe(true);
    expect(http.delete).toHaveBeenCalledTimes(1);
    expect(http.delete.mock.calls[0][0]).toBe('/v1/posts/post-123');
    await expect(cloud.cancel('bad', '../escape')).rejects.toThrow('Invalid');
});
