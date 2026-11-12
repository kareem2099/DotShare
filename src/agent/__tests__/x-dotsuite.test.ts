import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AccountStore } from '../accounts';
import { AgentCloud } from '../cloud';
import { AgentPublisher, publishTarget } from '../publisher';
import { PlannedTarget } from '../preview';

jest.mock('@napi-rs/keyring', () => ({ Entry: jest.fn() }));

const usage = { month: '2026-11', budget_micros: 5_000_000, spent_micros: 0, reserved_micros: 0, remaining_micros: 5_000_000, posts_today: 0, daily_post_limit: 50,
    prices: { post_micros: 15_000, post_with_link_micros: 200_000, media_micros: 5_000 } };

let home: string;
let accounts: AccountStore;
beforeEach(() => {
    jest.restoreAllMocks();
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-x-dotsuite-'));
    const values = new Map<string, string>();
    accounts = new AccountStore(home, { get: key => values.get(key), set: (key, value) => { values.set(key, value); }, delete: key => { values.delete(key); } });
    accounts.setCloudToken('ds_cloud_token');
    accounts.add({ id: 'x-cloud', name: 'X', platform: 'x', credentials: { via: 'dotsuite' } });
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

it('stores only via: dotsuite for an X account that posts through DotSuite', () => {
    expect(accounts.credentials('x-cloud')).toEqual({ via: 'dotsuite' });
    expect(accounts.xViaDotSuite('x-cloud')).toBe(true);
    expect(() => accounts.add({ id: 'bad', name: 'X', platform: 'x', credentials: { via: 'dotsuite', accessToken: 'leak' } })).toThrow('only via: dotsuite');
    expect(() => accounts.add({ id: 'bad', name: 'X', platform: 'x', credentials: { via: 'elsewhere' } })).toThrow();
    expect(() => accounts.add({ id: 'tg', name: 'T', platform: 'telegram', credentials: { via: 'dotsuite' } as never })).toThrow();
});

it('previews the exact X charge and remaining budget, and refuses what the budget cannot cover', async () => {
    const estimate = jest.spyOn(AgentCloud.prototype, 'xEstimate').mockResolvedValue({ estimated_micros: 215_000, affordable: true, usage,
        posts: [{ kind: 'post_url', estimated_micros: 200_000 }, { kind: 'post', estimated_micros: 15_000 }] });
    const planner = new AgentPublisher(accounts).planner;
    const plan = await planner.preview({ accountIds: ['x-cloud'], posts: [{ text: 'read https://dotsuite.dev', media: [] }, { text: 'more', media: [] }] });
    expect(plan.valid).toBe(true);
    expect(plan.warnings).toContain('x-cloud: X will charge $0.215 for 2 post(s), 1 with a link; $4.785 of this month\'s X budget will be left.');
    expect(estimate).toHaveBeenCalledWith([{ text: 'read https://dotsuite.dev', media_urls: [] }, { text: 'more', media_urls: [] }]);

    estimate.mockResolvedValue({ estimated_micros: 200_000, affordable: false, usage: { ...usage, remaining_micros: 100_000 }, posts: [{ kind: 'post_url', estimated_micros: 200_000 }] });
    const refused = await planner.preview({ accountIds: ['x-cloud'], text: 'https://dotsuite.dev' });
    expect(refused.errors[0]).toContain('costs $0.20 on X but only $0.10');
});

it('allows one X-through-DotSuite account per request, since DotSuite holds one X connection', async () => {
    accounts.add({ id: 'x-cloud-2', name: 'X2', platform: 'x', credentials: { via: 'dotsuite' } });
    jest.spyOn(AgentCloud.prototype, 'xEstimate').mockResolvedValue({ estimated_micros: 15_000, affordable: true, usage, posts: [{ kind: 'post', estimated_micros: 15_000 }] });
    const plan = await new AgentPublisher(accounts).planner.preview({ accountIds: ['x-cloud', 'x-cloud-2'], text: 'hi' });
    expect(plan.errors.join(' ')).toContain('Only one X account can post through DotSuite');
});

it('publishes through DotSuite with a stable request ID and reports each X post', async () => {
    const publish = jest.spyOn(AgentCloud.prototype, 'xPublish').mockResolvedValue({ status: 'published', charged_micros: 30_000, usage,
        posts: [{ status: 'published', x_post_id: '11', url: 'https://x.com/i/status/11', charged_micros: 15_000 }, { status: 'published', x_post_id: '12', url: 'https://x.com/i/status/12', charged_micros: 15_000 }] });
    const target: PlannedTarget = { accountId: 'x-cloud', platform: 'x', characterLimit: 280, maxMedia: 4,
        posts: [{ text: 'one', media: [], characters: 3 }, { text: 'two', media: [], characters: 3 }] };
    const receipts: unknown[] = [];
    const input = { requestId: 'launch-1', accountIds: ['x-cloud'], text: '', media: [], autoSplit: false, overrides: {} };
    await publishTarget(target, { via: 'dotsuite' }, input, receipt => { receipts.push(receipt); });
    await publishTarget(target, { via: 'dotsuite' }, input, () => undefined);
    expect(receipts).toEqual([{ id: '11', url: 'https://x.com/i/status/11' }, { id: '12', url: 'https://x.com/i/status/12' }]);
    expect(publish.mock.calls[0][0]).toMatch(/^mcp-[0-9a-f]{40}$/);
    expect(publish.mock.calls[1][0]).toBe(publish.mock.calls[0][0]);
    expect(publish.mock.calls[0][1]).toEqual([{ text: 'one', media_urls: [] }, { text: 'two', media_urls: [] }]);
});

it('reports X results DotSuite could not confirm instead of hiding them', async () => {
    jest.spyOn(AgentCloud.prototype, 'xPublish').mockResolvedValue({ status: 'needs_review', charged_micros: 15_000, usage,
        posts: [{ status: 'uncertain', error: 'No answer from X', charged_micros: 15_000 }] });
    const target: PlannedTarget = { accountId: 'x-cloud', platform: 'x', characterLimit: 280, maxMedia: 4, posts: [{ text: 'one', media: [], characters: 3 }] };
    await expect(publishTarget(target, { via: 'dotsuite' }, { requestId: 'r', accountIds: ['x-cloud'], text: '', media: [], autoSplit: false, overrides: {} }, () => undefined))
        .rejects.toThrow("X didn't confirm a post");
});
