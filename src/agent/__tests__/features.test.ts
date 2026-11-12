import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AccountStore } from '../accounts';
import { AgentPublisher, PublishAdapter } from '../publisher';
import { AgentDrafts } from '../drafts';
import { AgentCloud } from '../cloud';
import { AgentStats } from '../stats';
import { runSetup, readJsonClientConfig, Installation } from '../setup';
import { AGENT_TOOL_NAMES } from '../tool-names';
import { buildFacets, detectMentions } from '../../platforms/bluesky';

jest.mock('@napi-rs/keyring', () => ({ Entry: jest.fn() }));

let home: string;
let media: string;
let accounts: AccountStore;
let publisher: AgentPublisher;
let drafts: AgentDrafts;
const adapter: jest.MockedFunction<PublishAdapter> = jest.fn(async (target, _credentials, _input, report) => {
    target.posts.forEach((_post, i) => report({ id: `${target.accountId}-${i}`, url: `https://social.example/${target.accountId}/${i}` }));
});
beforeEach(() => {
    adapter.mockClear();
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-features-'));
    media = path.join(home, 'media'); fs.mkdirSync(media);
    const values = new Map<string, string>();
    accounts = new AccountStore(home, { get: key => values.get(key), set: (key, value) => { values.set(key, value); }, delete: key => { values.delete(key); } });
    accounts.add({ id: 'x', name: 'X', platform: 'x', credentials: { accessToken: 'x-token' } });
    accounts.add({ id: 'li', name: 'LinkedIn', platform: 'linkedin', credentials: { accessToken: 'li-token' } });
    accounts.add({ id: 'sky', name: 'Bluesky', platform: 'bluesky', credentials: { identifier: 'me.bsky.social', password: 'app-pass' } });
    accounts.add({ id: 'tg', name: 'Telegram', platform: 'telegram', credentials: { botToken: '1:abc', chatId: '42' } });
    accounts.add({ id: 'dev', name: 'Dev.to', platform: 'devto', credentials: { apiKey: 'dev-key' } });
    accounts.setCloudToken('ds_cloud_token');
    publisher = new AgentPublisher(accounts, adapter, [media]);
    drafts = new AgentDrafts(publisher);
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

const file = (name: string, header: number[] | string, size = 64) => {
    const bytes = Buffer.alloc(size); Buffer.from(header as never).copy(bytes);
    const target = path.join(media, name); fs.writeFileSync(target, bytes); return target;
};
const png = () => file('shot.png', [137, 80, 78, 71, 13, 10, 26, 10]);
const mp4 = (name = 'demo.mp4') => { const target = file(name, [0, 0, 0, 24]); const bytes = fs.readFileSync(target); bytes.write('ftyp', 4, 'ascii'); fs.writeFileSync(target, bytes); return target; };
const gif = () => file('loop.gif', 'GIF89a');

describe('video and GIF media', () => {
    it('accepts videos and GIFs where the platform supports them, by content not extension', async () => {
        const plan = await publisher.planner.preview({ accountIds: ['x', 'li', 'tg'], text: 'Demo', media: [mp4()] });
        expect(plan.errors).toEqual([]);
        expect((await publisher.planner.preview({ accountIds: ['x', 'tg'], text: 'Loop', media: [gif()] })).valid).toBe(true);
        fs.writeFileSync(path.join(media, 'fake.mp4'), 'not a video');
        expect((await publisher.planner.preview({ accountIds: ['x'], text: 'x', media: ['fake.mp4'] })).errors[0]).toContain('Unsupported file');
    });
    it('explains what each platform refuses', async () => {
        const sky = await publisher.planner.preview({ accountIds: ['sky'], text: 'Demo', media: [mp4()] });
        expect(sky.errors[0]).toContain('images only');
        const mixed = await publisher.planner.preview({ accountIds: ['x'], text: 'Demo', media: [mp4(), png()] });
        expect(mixed.errors[0]).toContain('one video or GIF');
        const linkedinGif = await publisher.planner.preview({ accountIds: ['li'], text: 'Loop', media: [gif()] });
        expect(linkedinGif.errors[0]).toContain("GIFs aren't supported");
        const big = mp4('big.mp4'); fs.truncateSync(big, 51 * 1024 * 1024);
        expect((await publisher.planner.preview({ accountIds: ['tg'], text: 'Big', media: [big] })).errors[0]).toContain('at most 50 MB');
    });
});

describe('schedule_draft', () => {
    const http = { get: jest.fn(), post: jest.fn(), delete: jest.fn() };
    let cloud: AgentCloud;
    const at = () => new Date(Date.now() + 3600_000).toISOString();
    beforeEach(() => {
        Object.values(http).forEach(fn => fn.mockReset());
        cloud = new AgentCloud(accounts);
        (cloud as unknown as { http: typeof http }).http = http;
        http.get.mockResolvedValue({ data: { connected_platforms: ['x', 'linkedin'] } });
        http.post.mockImplementation(async (url: string, body: { platforms?: string[] }) => url === '/v1/media/upload'
            ? { data: { media_url: 'https://media.dotsuite.dev/a.png' } } : { data: { post_id: `cloud-${body.platforms![0]}` } });
    });
    const previewed = async (content: Record<string, unknown>) => {
        const draft = drafts.create({ title: 'Launch', content: { accountIds: ['x', 'li'], text: 'Launch day', ...content } });
        return drafts.preview({ draftId: draft.id, expectedRevision: draft.revision });
    };
    const request = (draft: Awaited<ReturnType<typeof previewed>>, requestId = 'sched-1') => ({ draftId: draft.id, expectedRevision: draft.revision, previewId: draft.preview!.id, requestId, scheduledAt: at() });

    it('schedules one cloud post per platform with its own text and uploaded images', async () => {
        const image = png();
        const draft = await previewed({ media: [image], overrides: { li: { text: 'Launch day, the professional version' } } });
        const req = request(draft);
        const result = await drafts.schedule(req, cloud);
        expect(result.draft.status).toBe('Scheduled');
        const schedules = http.post.mock.calls.filter(([url]) => url === '/v1/posts/schedule').map(([, body]) => body);
        expect(schedules).toEqual([
            expect.objectContaining({ platforms: ['x'], text: 'Launch day', media_urls: ['https://media.dotsuite.dev/a.png'] }),
            expect.objectContaining({ platforms: ['linkedin'], text: 'Launch day, the professional version' }),
        ]);
        expect(http.post.mock.calls.filter(([url]) => url === '/v1/media/upload')).toHaveLength(1);
        expect(result.draft.publication?.deliveries?.map(d => [d.platform, d.status, d.receipts[0]?.id])).toEqual([['x', 'scheduled', 'cloud-x'], ['linkedin', 'scheduled', 'cloud-linkedin']]);
        expect(adapter).not.toHaveBeenCalled();
        await expect(drafts.publish({ draftId: draft.id, expectedRevision: draft.revision, previewId: draft.preview!.id, requestId: 'publish-too' })).rejects.toThrow('already has a publication request');
        expect((await drafts.schedule(req, cloud)).replayed).toBe(true);
        await expect(drafts.schedule({ ...req, scheduledAt: at() }, cloud)).rejects.toThrow('different content');
        expect(http.post.mock.calls.filter(([url]) => url === '/v1/posts/schedule')).toHaveLength(2);
    });
    it('refuses what the cloud scheduler cannot post, before uploading or scheduling', async () => {
        const thread = await previewed({ accountIds: ['x'], text: '', posts: [{ text: 'one' }, { text: 'two' }] });
        await expect(drafts.schedule(request(thread), cloud)).rejects.toThrow("can't be threads");
        const comment = await previewed({ accountIds: ['li'], firstComment: 'https://dev.to/post' });
        await expect(drafts.schedule(request(comment, 'sched-2'), cloud)).rejects.toThrow('first comment');
        const video = await previewed({ accountIds: ['x'], media: [mp4()] });
        await expect(drafts.schedule(request(video, 'sched-3'), cloud)).rejects.toThrow('not videos');
        expect(http.post).not.toHaveBeenCalled();
        expect(drafts.get(thread.id).status).toBe('Draft');
    });
    it('names the platforms still to connect in the dashboard', async () => {
        http.get.mockResolvedValue({ data: { connected_platforms: ['x'] } });
        const draft = await previewed({});
        await expect(drafts.schedule(request(draft), cloud)).rejects.toThrow('Connect linkedin in the DotSuite dashboard');
    });
    it('marks a platform for review instead of retrying when DotSuite fails mid-way', async () => {
        http.post.mockImplementation(async (_url: string, body: { platforms: string[] }) => {
            if (body.platforms[0] === 'linkedin') throw new Error('timeout');
            return { data: { post_id: 'cloud-x' } };
        });
        const result = await drafts.schedule(request(await previewed({})), cloud);
        expect(result.draft.status).toBe('NeedsReview');
        expect(result.draft.publication?.deliveries?.map(d => d.status)).toEqual(['scheduled', 'uncertain']);
    });
});

describe('get_post_stats', () => {
    it('reads engagement per platform and explains platforms without metrics', async () => {
        await publisher.publish({ requestId: 'pub-1', accountIds: ['x', 'sky', 'tg', 'li'], text: 'Shipped', firstComment: 'https://link' });
        const http = { get: jest.fn(async (url: string) => {
            if (url.startsWith('https://api.x.com/2/tweets')) return { data: { data: [{ id: 'x-0', public_metrics: { like_count: 7, retweet_count: 2, reply_count: 1, quote_count: 0, impression_count: 340 } }] } };
            if (url.includes('app.bsky.feed.getPosts')) return { data: { posts: [{ uri: 'sky-0', likeCount: 3, repostCount: 1, replyCount: 0, quoteCount: 0 }] } };
            if (url.includes('linkedin')) throw Object.assign(new Error('Request failed'), { isAxiosError: true, response: { status: 403 } });
            throw new Error(`unexpected ${url}`);
        }) };
        const stats = await new AgentStats(accounts, http as never).get({ requestId: 'pub-1' });
        const by = Object.fromEntries(stats.accounts.map(account => [account.accountId, account]));
        expect(by.x.posts[0].metrics).toEqual({ likes: 7, reposts: 2, replies: 1, quotes: 0, impressions: 340 });
        expect(by.sky.posts[0].metrics).toEqual({ likes: 3, reposts: 1, replies: 0, quotes: 0 });
        expect(by.tg.unavailable).toContain("can't read message metrics");
        expect(by.li.posts).toHaveLength(1);
        expect(by.li.unavailable).toContain('r_member_social');
        await expect(new AgentStats(accounts, http as never).get({})).rejects.toThrow();
    });
});

describe('Bluesky mentions', () => {
    it('links resolvable handles, leaves unknown ones and never overlaps links', async () => {
        const text = 'Thanks @alice.bsky.social and (@bob.dev)! cc @nobody.example, email me@x.com, see https://x.com/@carol.dev.';
        expect(detectMentions(text).map(m => m.handle)).toEqual(['alice.bsky.social', 'bob.dev', 'nobody.example']);
        const resolve = jest.fn(async (handle: string) => (handle === 'nobody.example' ? undefined : `did:plc:${handle.split('.')[0]}`));
        const facets = await buildFacets(`${text} again @alice.bsky.social`, resolve);
        const mentions = facets.filter(f => f.features[0].$type === 'app.bsky.richtext.facet#mention');
        expect(mentions.map(f => (f.features[0] as { did: string }).did)).toEqual(['did:plc:alice', 'did:plc:bob', 'did:plc:alice']);
        expect(resolve).toHaveBeenCalledTimes(3);
        const bytes = Buffer.from(`${text} again @alice.bsky.social`);
        expect(bytes.subarray(mentions[0].index.byteStart, mentions[0].index.byteEnd).toString()).toBe('@alice.bsky.social');
    });
});

describe('setup for Claude Code and Cursor', () => {
    let current: Installation;
    const probe = jest.fn(async () => ({ success: true, tools: [...AGENT_TOOL_NAMES], message: 'Verified' }));
    beforeEach(() => {
        const root = path.join(home, 'install'); fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
        fs.writeFileSync(path.join(root, 'bin/dotshare-mcp.js'), '');
        current = { root, node: process.execPath, server: path.join(root, 'bin/dotshare-mcp.js') };
    });
    const context = (run?: jest.Mock) => ({ installation: current, home: path.join(home, 'agent'), environment: {}, probe, ...(run && { run }) });

    it('merges into Cursor mcp.json, keeping other servers and a backup', async () => {
        const config = path.join(home, 'cursor', 'mcp.json');
        fs.mkdirSync(path.dirname(config)); fs.writeFileSync(config, JSON.stringify({ mcpServers: { other: { command: 'other' } }, theme: 'dark' }));
        const result = await runSetup({ client: 'cursor', config }, context());
        expect(result.changed).toBe(true); expect(result.backupPath).toBeTruthy();
        const written = readJsonClientConfig(config);
        expect(written.document.theme).toBe('dark');
        expect((written.document.mcpServers as Record<string, unknown>).other).toEqual({ command: 'other' });
        expect(written.entry).toEqual({ command: process.execPath, args: [current.server], env: expect.objectContaining({ DOTSHARE_HOME: path.join(home, 'agent') }) });
        expect((await runSetup({ client: 'cursor', config }, context())).changed).toBe(false);
        fs.writeFileSync(config, '{ broken');
        await expect(runSetup({ client: 'cursor', config }, context())).rejects.toThrow('invalid JSON');
    });
    it('adds DotShare to Claude Code through its CLI and replaces only on request', async () => {
        const run = jest.fn().mockResolvedValueOnce({ code: 0, output: '' });
        await runSetup({ client: 'claude' }, context(run));
        expect(run).toHaveBeenCalledWith('claude', ['mcp', 'add-json', '--scope', 'user', 'dotshare', expect.stringContaining(current.server)]);
        run.mockReset().mockResolvedValueOnce({ code: 1, output: 'MCP server dotshare already exists in user config' });
        await expect(runSetup({ client: 'claude' }, context(run))).rejects.toThrow('--replace');
        run.mockReset().mockResolvedValueOnce({ code: 1, output: 'already exists' }).mockResolvedValueOnce({ code: 0, output: '' }).mockResolvedValueOnce({ code: 0, output: '' });
        await runSetup({ client: 'claude', replace: true }, context(run));
        expect(run.mock.calls[1][1]).toEqual(['mcp', 'remove', '--scope', 'user', 'dotshare']);
        run.mockReset().mockResolvedValueOnce({ code: 127, output: '' });
        await expect(runSetup({ client: 'claude' }, context(run))).rejects.toThrow('claude command was not found');
        const dry = await runSetup({ client: 'claude', dryRun: true }, context(jest.fn()));
        expect(dry.snippet).toMatch(/^claude mcp add-json --scope user dotshare '/);
    });
});
