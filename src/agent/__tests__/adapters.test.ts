import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AccountStore } from '../accounts';
import { AgentPublisher } from '../publisher';
import { CREDENTIAL_FIELDS, Platform } from '../schema';
import { shareToX } from '../../platforms/x';
import { shareToBlueSky } from '../../platforms/bluesky';
import { shareToLinkedIn } from '../../platforms/linkedin';
import { shareToTelegram } from '../../platforms/telegram';
import { shareToDiscord, validateDiscordWebhook } from '../../platforms/discord';
import { TokenManager } from '../../services/TokenManager';

jest.mock('axios');
jest.mock('@napi-rs/keyring', () => ({ Entry: jest.fn() }));
jest.mock('../../utils/Logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const http = jest.mocked(axios);
let home: string;
let image: string;
beforeEach(() => {
    jest.resetAllMocks();
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-adapter-test-'));
    image = path.join(home, 'a.png');
    fs.writeFileSync(image, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]));
    http.get.mockImplementation(async url => {
        if (String(url).includes('/api/v2/instance')) return { status: 200, data: { configuration: { statuses: { max_characters: 500, max_media_attachments: 4 } } } };
        if (String(url).includes('/userinfo')) return { data: { sub: 'person' } };
        return { status: 200, data: {} };
    });
    http.post.mockImplementation(async url => {
        const endpoint = String(url);
        if (endpoint.endsWith('createSession')) return { data: { accessJwt: 'private-session', refreshJwt: 'private-refresh', did: 'did:plc:person' } };
        if (endpoint.endsWith('uploadBlob')) return { data: { blob: { $type: 'blob', ref: { $link: 'blob' }, mimeType: 'image/png', size: 12 } } };
        if (endpoint.endsWith('createRecord')) return { data: { uri: 'at://did:plc:person/app.bsky.feed.post/post-1', cid: 'cid' } };
        if (endpoint.endsWith('/2/media/upload')) return { data: { data: { id: 'media-1' } } };
        if (endpoint.endsWith('/2/tweets')) return { data: { data: { id: 'tweet-1' } } };
        if (endpoint.endsWith('/api/v2/media')) return { status: 200, data: { id: 'media-1' } };
        if (endpoint.endsWith('/api/v1/statuses')) return { data: { id: 'status-1', url: 'https://social.example/@me/status-1' } };
        if (endpoint.includes('discord.com')) return { data: { id: 'message-1', channel_id: 'channel-1', guild_id: 'guild-1' } };
        if (endpoint.includes('api.telegram.org')) return { data: { ok: true, result: { message_id: 123 } } };
        if (endpoint.includes('registerUpload')) return { data: { value: { uploadMechanism: { 'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl: 'https://uploads.linkedin.com/image' } }, asset: 'urn:li:digitalmediaAsset:image' } } };
        if (endpoint.endsWith('/ugcPosts')) return { headers: { 'x-restli-id': 'urn:li:share:123' }, data: {} };
        if (endpoint.endsWith('dev.to/api/articles')) return { data: { id: 123, url: 'https://dev.to/me/article' } };
        throw new Error(`Unexpected request ${endpoint}`);
    });
    http.put.mockResolvedValue({ status: 200 });
});
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); jest.restoreAllMocks(); });

it('uses the real shared adapters for all seven platforms and returns real receipts', async () => {
    const values = new Map<string, string>();
    const accounts = new AccountStore(home, { get: key => values.get(key), set: (key, value) => { values.set(key, value); }, delete: key => { values.delete(key); } });
    const platforms: Platform[] = ['x', 'linkedin', 'bluesky', 'mastodon', 'telegram', 'discord', 'devto'];
    for (const platform of platforms) {
        const credentials = Object.fromEntries(CREDENTIAL_FIELDS[platform].map(field => [field, `private-${field}`]));
        if (platform === 'telegram') { credentials.botToken = '123:private_token'; credentials.chatId = '@example'; }
        if (platform === 'mastodon') credentials.instance = 'https://social.example';
        if (platform === 'discord') credentials.webhookUrl = 'https://discord.com/api/webhooks/123/private_webhook';
        accounts.add({ id: platform, name: platform, platform, credentials });
    }
    const p = new AgentPublisher(accounts, undefined, [home]);
    const result = await p.publish({
        requestId: 'all-platforms', accountIds: platforms, text: 'Hello from DotShare', media: [image],
        overrides: { devto: { media: ['https://cdn.example/image.png'] } }, article: { title: 'DotShare release', tags: ['opensource'] },
    });
    expect(result.operation.status).toBe('completed');
    expect(result.operation.results).toHaveLength(7);
    for (const target of result.operation.results) {
        expect(target.receipts).toHaveLength(1);
        expect(target.receipts[0].url).toMatch(/^https:\/\//);
    }
    expect(http.post.mock.calls.some(call => String(call[0]).includes('upload.twitter.com'))).toBe(false);
    const discord = http.post.mock.calls.find(call => String(call[0]).includes('discord.com'))!;
    expect(String(discord[0])).toContain('wait=true');
    expect(discord[1].constructor.name).toBe('FormData');
    const telegram = http.post.mock.calls.find(call => String(call[0]).includes('api.telegram.org'))!;
    expect(telegram[1].constructor.name).toBe('FormData');
});
it('aborts X before creating a post when an image upload fails and honors the supplied headless token', async () => {
    const tokenManager = jest.spyOn(TokenManager, 'getValidToken');
    http.post.mockRejectedValue(new Error('Upload failed'));
    await expect(shareToX('token', '', { text: 'Hello', media: [image] }, { tokenProvider: async () => 'headless-token' })).rejects.toThrow('media upload failed');
    expect(tokenManager).not.toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post.mock.calls[0][2]?.headers?.Authorization).toBe('Bearer headless-token');
});
it('aborts Bluesky before creating a post when a blob upload fails', async () => {
    http.post.mockImplementation(async url => {
        if (String(url).endsWith('createSession')) return { data: { accessJwt: 'token', refreshJwt: 'refresh', did: 'did:plc:me' } };
        throw new Error('Upload failed');
    });
    await expect(shareToBlueSky('me', 'secret', { text: 'Hello', media: [image] })).rejects.toThrow();
    expect(http.post.mock.calls.some(call => String(call[0]).endsWith('createRecord'))).toBe(false);
});
it('propagates LinkedIn upload failures rather than reporting publishing success', async () => {
    http.put.mockRejectedValue(new Error('Upload failed'));
    await expect(shareToLinkedIn({ text: 'Hello', media: [image] }, 'token')).rejects.toThrow('Upload failed');
    expect(http.post.mock.calls.some(call => String(call[0]).endsWith('ugcPosts'))).toBe(false);
});
it('rejects successful-looking responses that contain no publishing receipt', async () => {
    http.post.mockResolvedValue({ data: {}, headers: {} });
    await expect(shareToLinkedIn({ text: 'Hello' }, 'token')).rejects.toThrow('no post ID');
    http.post.mockResolvedValue({ data: { ok: true, result: {} } });
    await expect(shareToTelegram({ text: 'Hello' }, '123:token', '@example')).rejects.toThrow('no message ID');
});
it('sends Telegram text literally, with a usable message URL and observable receipt', async () => {
    const observer = jest.fn();
    const result = await shareToTelegram({ text: '<hello> & world' }, '123:token', '@example', undefined, undefined, observer);
    expect(result?.url).toBe('https://t.me/example/123');
    expect(http.post.mock.calls[0][1]).toEqual({ chat_id: '@example', text: '<hello> & world' });
    expect(observer).toHaveBeenCalledWith(result);
});
it('checks Discord credentials without posting a test message', async () => {
    expect(await validateDiscordWebhook('https://discord.com/api/webhooks/123/token')).toBe(true);
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.post).not.toHaveBeenCalled();
});
it('preserves Discord public-image URL support without downloading the image', async () => {
    await shareToDiscord('https://discord.com/api/webhooks/123/token', { text: 'Hello', media: ['https://cdn.example/image.png'] });
    expect(http.post.mock.calls[0][1]).toMatchObject({
        content: 'Hello', embeds: [{ image: { url: 'https://cdn.example/image.png' } }], allowed_mentions: { parse: [] },
    });
    expect(http.get).not.toHaveBeenCalled();
});
it('never drops a missing LinkedIn attachment before publishing', async () => {
    await expect(shareToLinkedIn({ text: 'Hello', media: [path.join(home, 'missing.png')] }, 'token')).rejects.toThrow('media file not found');
    expect(http.post.mock.calls.some(call => String(call[0]).endsWith('ugcPosts'))).toBe(false);
});
