import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setImmediate } from 'timers';
import { randomUUID } from 'crypto';
import { AgentDrafts } from '../drafts';
import { AgentPublisher, PublishAdapter } from '../publisher';
import { AccountStore } from '../accounts';
import { fetchInstanceLimits } from '../../platforms/mastodon';

jest.mock('../../platforms/mastodon', () => ({ ...jest.requireActual('../../platforms/mastodon'), fetchInstanceLimits: jest.fn().mockResolvedValue({ maxChars: 500, maxMedia: 4 }) }));
let home: string;
let images: string;
let accounts: AccountStore;
let secrets: Map<string, string>;
let publisher: AgentPublisher;
let drafts: AgentDrafts;
let adapter: jest.MockedFunction<PublishAdapter>;
beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-drafts-test-'));
    images = path.join(home, 'images'); fs.mkdirSync(images);
    secrets = new Map();
    accounts = new AccountStore(home, { get: key => secrets.get(key), set: (key, value) => { secrets.set(key, value); }, delete: key => { secrets.delete(key); } });
    accounts.add({ id: 'personal', name: 'Personal X', platform: 'x', credentials: { accessToken: 'private-personal-access-token' } });
    adapter = jest.fn(async (target, _credentials, _input, report) => {
        for (let i = 0; i < target.posts.length; i++) report({ id: `${target.accountId}-${i}`, url: `https://social.example/${target.accountId}/${i}` });
    });
    publisher = new AgentPublisher(accounts, adapter, [images]); drafts = new AgentDrafts(publisher);
    jest.mocked(fetchInstanceLimits).mockResolvedValue({ maxChars: 500, maxMedia: 4 });
});
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); jest.restoreAllMocks(); });
const create = (content: Record<string, unknown> = {}) => drafts.create({ title: 'Release draft', content: { accountIds: ['personal'], text: 'Hello from a saved draft', ...content } });
const preview = async (content: Record<string, unknown> = {}) => {
    const draft = create(content); return drafts.preview({ draftId: draft.id, expectedRevision: draft.revision });
};
const request = (draft, requestId = 'draft-release-1') => ({ draftId: draft.id, expectedRevision: draft.revision, previewId: draft.preview.id, requestId });
function image(): string {
    const file = path.join(images, 'launch.png'); fs.writeFileSync(file, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])); return file;
}

it('autosaves incomplete drafts privately and recovers them after restart without reading credentials', () => {
    const credentials = jest.spyOn(accounts, 'credentials');
    const draft = drafts.create({ content: { text: 'English and العربية' } });
    expect(draft.status).toBe('Draft'); expect(draft.published).toBe(false); expect(draft.revision).toBe(1);
    expect(new AgentDrafts(publisher).get(draft.id).content.text).toBe('English and العربية');
    expect(fs.statSync(path.join(home, 'drafts', `${draft.id}.json`)).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.join(home, 'drafts')).mode & 0o777).toBe(0o700);
    expect(credentials).not.toHaveBeenCalled(); expect(adapter).not.toHaveBeenCalled();
});
it('patches omitted fields safely, increments the revision and supports explicit clearing', () => {
    const file = image(); const draft = create({ media: [file], article: { title: 'Article' }, overrides: { personal: { text: 'Variant' } } });
    const updated = drafts.update({ draftId: draft.id, expectedRevision: 1, patch: { text: 'Updated text' } });
    expect(updated.revision).toBe(2); expect(updated.content.media).toEqual([file]); expect(updated.content.overrides.personal.text).toBe('Variant');
    const cleared = drafts.update({ draftId: draft.id, expectedRevision: 2, title: 'Renamed', patch: { article: null, overrides: null } });
    expect(cleared.title).toBe('Renamed'); expect(cleared.content.article).toBeUndefined(); expect(cleared.content.overrides).toEqual({});
    expect(() => drafts.update({ draftId: draft.id, expectedRevision: 2, patch: { text: 'Lost edit' } })).toThrow('revision changed');
    expect(drafts.get(draft.id).content.text).toBe('Updated text');
});
it('persists a real Preview with exact thread parts but does not publish', async () => {
    const draft = await preview({ text: 'thread text '.repeat(60), autoSplit: true, media: [image()] });
    expect(draft.status).toBe('Preview'); expect(draft.published).toBe(false); expect(draft.preview?.plan.valid).toBe(true);
    expect(draft.preview!.plan.targets[0].posts.length).toBeGreaterThan(1);
    expect(new AgentDrafts(publisher).get(draft.id).preview?.id).toBe(draft.preview?.id);
    expect(adapter).not.toHaveBeenCalled(); expect(publisher.journal.list()).toEqual([]);
    expect(JSON.stringify(draft)).not.toContain('private-personal-access-token');
    expect(fs.readFileSync(path.join(home, 'drafts', `${draft.id}.json`), 'utf8')).not.toContain('private-personal-access-token');
});
it('keeps invalid drafts in Draft and returns errors instead of a publishable preview', async () => {
    const empty = drafts.create({ content: {} });
    const result = await drafts.preview({ draftId: empty.id, expectedRevision: 1 });
    expect(result.status).toBe('Draft'); expect(result.preview).toBeUndefined(); expect(result.validation?.valid).toBe(false);
    expect(result.validation?.errors.length).toBeGreaterThan(0); expect(adapter).not.toHaveBeenCalled();
});
it('invalidates a saved preview on edit and blocks stale revisions or missing previews', async () => {
    const draft = await preview();
    const updated = drafts.update({ draftId: draft.id, expectedRevision: 1, patch: { text: 'Changed after preview' } });
    expect(updated.status).toBe('Draft'); expect(updated.preview).toBeUndefined();
    await expect(drafts.publish(request(draft))).rejects.toThrow('revision changed');
    await expect(drafts.publish({ ...request(draft), expectedRevision: 2 })).rejects.toThrow('saved preview');
    expect(adapter).not.toHaveBeenCalled();
});
it('rejects a superseded preview ID even when the content revision has not changed', async () => {
    const draft = await preview();
    const latest = await drafts.preview({ draftId: draft.id, expectedRevision: 1 });
    expect(latest.preview?.id).not.toBe(draft.preview?.id);
    await expect(drafts.publish(request(draft))).rejects.toThrow('saved preview');
    expect(adapter).not.toHaveBeenCalled();
});
it('publishes the exact saved thread plan and preserves receipts and published status', async () => {
    const draft = await preview({ text: 'release details '.repeat(60), autoSplit: true });
    const expected = draft.preview!.plan.targets[0].posts.map(post => post.text);
    const result = await drafts.publish(request(draft));
    expect(result.draft.status).toBe('Published'); expect(result.draft.published).toBe(true);
    expect(adapter.mock.calls[0][0].posts.map(post => post.text)).toEqual(expected);
    expect(result.draft.publication?.operation?.results[0].receipts).toHaveLength(expected.length);
    expect(result.draft.publication?.operation?.draft).toEqual({ draftId: draft.id, revision: 1, previewId: draft.preview!.id });
});
it('replays a completed publication after restart even if credentials and images are no longer available', async () => {
    const file = image(); const draft = await preview({ media: [file] });
    await drafts.publish(request(draft)); secrets.delete('agent:personal'); fs.unlinkSync(file);
    const replay = await new AgentDrafts(new AgentPublisher(accounts, adapter, [images])).publish(request(draft));
    expect(replay.replayed).toBe(true); expect(replay.draft.status).toBe('Published'); expect(adapter).toHaveBeenCalledTimes(1);
    await expect(drafts.publish(request(draft, 'new-id'))).rejects.toThrow('same requestId');
    expect(() => drafts.update({ draftId: draft.id, expectedRevision: 1, patch: { text: 'Edit live post' } })).toThrow('publication attempt');
});
it('blocks changed image bytes before claiming or publishing, then requires a new preview', async () => {
    const file = image(); const draft = await preview({ media: [file] });
    const changed = fs.readFileSync(file); changed[changed.length - 1] = 99; fs.writeFileSync(file, changed);
    await expect(drafts.publish(request(draft))).rejects.toThrow('image changed');
    expect(adapter).not.toHaveBeenCalled(); expect(publisher.journal.list()).toEqual([]);
    const current = drafts.get(draft.id); expect(current.status).toBe('Draft'); expect(current.preview).toBeUndefined();
});
it('pins local image bytes for all targets even if the source changes during publication, and removes temporary copies', async () => {
    accounts.add({ id: 'work', name: 'Work X', platform: 'x', credentials: { accessToken: 'private-work-token' } });
    const file = image(); const original = fs.readFileSync(file); const paths: string[] = [];
    adapter.mockImplementation(async (target, _credentials, _input, report) => {
        paths.push(target.posts[0].media[0]);
        expect(path.basename(paths[paths.length - 1])).toBe('launch.png');
        expect(fs.readFileSync(paths[paths.length - 1])).toEqual(original);
        fs.writeFileSync(file, 'source changed after publication started'); report({ id: target.accountId });
    });
    const draft = await preview({ accountIds: ['personal', 'work'], media: [file] });
    expect((await drafts.publish(request(draft))).draft.status).toBe('Published');
    expect(paths.every(file => !fs.existsSync(file))).toBe(true);
});
it('blocks account credential changes and revoked image-root access after preview', async () => {
    const draft = await preview();
    accounts.add({ id: 'personal', name: 'Personal X', platform: 'x', credentials: { accessToken: 'new-account-token' } });
    await expect(drafts.publish(request(draft))).rejects.toThrow('credentials changed'); expect(adapter).not.toHaveBeenCalled();
    const withImage = await preview({ media: [image()] });
    const restricted = new AgentDrafts(new AgentPublisher(accounts, adapter, []));
    await expect(restricted.publish(request(withImage, 'root-check'))).rejects.toThrow('Local images are disabled');
    expect(adapter).not.toHaveBeenCalled();
});
it('blocks a changed instance plan instead of regenerating a different thread at publish time', async () => {
    accounts.add({ id: 'mastodon', name: 'Mastodon', platform: 'mastodon', credentials: { instance: 'https://social.example', accessToken: 'private-mastodon-token' } });
    const draft = await preview({ accountIds: ['mastodon'], text: 'a'.repeat(700), autoSplit: true });
    jest.mocked(fetchInstanceLimits).mockResolvedValue({ maxChars: 1000, maxMedia: 4 });
    await expect(drafts.publish(request(draft))).rejects.toThrow('plan or limits changed'); expect(adapter).not.toHaveBeenCalled();
});
it('preserves partial receipts as NeedsReview and never resends them with a retry or new ID', async () => {
    adapter.mockImplementation(async (_target, _credentials, _input, report) => { report({ id: 'first-public-part' }); throw new Error('Network timeout'); });
    const draft = await preview({ text: 'a'.repeat(600), autoSplit: true });
    const result = await drafts.publish(request(draft));
    expect(result.draft.status).toBe('NeedsReview'); expect(result.draft.published).toBe(false);
    expect(result.draft.publication?.operation?.results[0].receipts[0].id).toBe('first-public-part');
    expect((await drafts.publish(request(draft))).replayed).toBe(true);
    await expect(drafts.publish(request(draft, 'bypass'))).rejects.toThrow('same requestId');
    await expect(drafts.preview({ draftId: draft.id, expectedRevision: 1 })).rejects.toThrow('publication attempt');
    expect(adapter).toHaveBeenCalledTimes(1);
});
it('claims a concurrent publication once and blocks edits while it is being prepared', async () => {
    let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
    adapter.mockImplementation(async (_target, _credentials, _input, report) => { await barrier; report({ id: 'once' }); });
    const draft = await preview();
    const first = drafts.publish(request(draft));
    await new Promise(resolve => setImmediate(resolve));
    expect(() => drafts.update({ draftId: draft.id, expectedRevision: 1, patch: { text: 'Too late' } })).toThrow('publication attempt');
    const second = await new AgentDrafts(publisher).publish(request(draft));
    expect(second.replayed).toBe(true); expect(second.draft.status).toBe('Publishing');
    release(); await first; expect(drafts.get(draft.id).status).toBe('Published'); expect(adapter).toHaveBeenCalledTimes(1);
});
it('does not overwrite a newer edit when an asynchronous preview finishes', async () => {
    const initial = create(); const original = publisher.planner.preview.bind(publisher.planner);
    let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
    jest.spyOn(publisher.planner, 'preview').mockImplementationOnce(async value => { await barrier; return original(value); });
    const pending = drafts.preview({ draftId: initial.id, expectedRevision: 1 });
    drafts.update({ draftId: initial.id, expectedRevision: 1, patch: { text: 'New content' } });
    release(); await expect(pending).rejects.toThrow('revision changed');
    expect(drafts.get(initial.id).content.text).toBe('New content'); expect(drafts.get(initial.id).status).toBe('Draft');
});
it('recovers completion from the operation journal if the process stopped before saving final draft status', async () => {
    const draft = await preview(); await drafts.publish(request(draft));
    const file = path.join(home, 'drafts', `${draft.id}.json`); const saved = JSON.parse(JSON.stringify(accounts.files.read(file)));
    saved.status = 'Publishing'; accounts.files.write(file, saved);
    expect(new AgentDrafts(publisher).get(draft.id).status).toBe('Published');
});
it('does not confuse a Dev.to remote draft with a public publication', async () => {
    accounts.add({ id: 'devto', name: 'Dev.to', platform: 'devto', credentials: { apiKey: 'private-devto-key' } });
    const remote = await preview({ accountIds: ['devto'], article: { title: 'Remote draft', published: false } });
    const result = await drafts.publish(request(remote));
    expect(result.draft.status).toBe('SavedRemotely'); expect(result.draft.published).toBe(false);
    expect(result.draft.publication?.deliveries?.[0].status).toBe('SavedRemotely');
    const mixed = await preview({ accountIds: ['personal', 'devto'], article: { title: 'Mixed', published: false } });
    const both = await drafts.publish(request(mixed, 'mixed-delivery'));
    expect(both.draft.publication?.deliveries?.map(target => target.status)).toEqual(['Published', 'SavedRemotely']);
});
it('lists statuses and receipts without full post bodies', async () => {
    const saved = await preview(); await drafts.publish(request(saved)); create({ text: 'private draft body' });
    const listing = drafts.list({ status: 'Published' });
    expect(listing.drafts).toHaveLength(1); expect(listing.drafts[0].status).toBe('Published');
    expect(JSON.stringify(drafts.list())).not.toContain('private draft body');
    expect(JSON.stringify(listing)).toContain('https://social.example/personal/0');
});
it('fails closed for corrupted snapshots, invalid IDs, stale revision edits and reused operation IDs', async () => {
    const draft = await preview();
    const file = path.join(home, 'drafts', `${draft.id}.json`); const saved = JSON.parse(JSON.stringify(accounts.files.read(file)));
    saved.content.text = 'Changed outside the saved revision'; accounts.files.write(file, saved);
    expect(() => drafts.get(draft.id)).toThrow('inconsistent');
    expect(() => drafts.get('../escape')).toThrow(); expect(() => drafts.get(randomUUID())).toThrow('not found');
    const other = await preview(); publisher.journal.begin('taken', 'another-fingerprint', 'cancel');
    await expect(drafts.publish(request(other, 'taken'))).rejects.toThrow('another action');
    expect(drafts.get(other.id).status).toBe('Preview'); expect(adapter).not.toHaveBeenCalled();
});
it('keeps a draft readable when a failed platform preview would be too large to store', async () => {
    const draft = create();
    jest.spyOn(publisher.planner, 'preview').mockResolvedValueOnce({ valid: false, targets: [], errors: ['x'.repeat(3 * 1024 * 1024)], warnings: [] });
    const result = await drafts.preview({ draftId: draft.id, expectedRevision: 1 });
    expect(result.status).toBe('Draft'); expect(result.validation?.errors[0]).toContain('exceeds 2 MiB');
    expect(new AgentDrafts(publisher).get(draft.id).id).toBe(draft.id);
});
it('does not let a competing failed preparation release an older publisher into a changed draft', async () => {
    const draft = await preview(); const original = publisher.planner.preview.bind(publisher.planner);
    let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
    jest.spyOn(publisher.planner, 'preview').mockImplementationOnce(async value => { await barrier; return original(value); })
        .mockRejectedValueOnce(new Error('Preparation failed before any operation was claimed'));
    const pending = drafts.publish(request(draft));
    await expect(drafts.publish(request(draft))).rejects.toThrow('Preparation failed');
    expect(drafts.get(draft.id).status).toBe('Draft');
    release(); await expect(pending).rejects.toThrow('Draft changed');
    expect(adapter).not.toHaveBeenCalled(); expect(publisher.journal.list()).toEqual([]);
});
it('rejects a preview if the account changes while the platform plan is being read', async () => {
    const initial = create(); const original = publisher.planner.preview.bind(publisher.planner);
    jest.spyOn(publisher.planner, 'preview').mockImplementationOnce(async value => {
        const plan = await original(value);
        accounts.add({ id: 'personal', name: 'Changed account', platform: 'x', credentials: { accessToken: 'rotated-during-preview' } });
        return plan;
    });
    const result = await drafts.preview({ draftId: initial.id, expectedRevision: 1 });
    expect(result.status).toBe('Draft'); expect(result.validation?.errors[0]).toContain('Accounts changed');
});
it('leaves a cancelled preflight editable and creates no publication operation', async () => {
    const draft = await preview(); const controller = new AbortController(); controller.abort();
    await expect(drafts.publish(request(draft), controller.signal)).rejects.toThrow('Cancelled before publishing');
    expect(drafts.get(draft.id).status).toBe('Draft'); expect(publisher.journal.list()).toEqual([]); expect(adapter).not.toHaveBeenCalled();
    expect(drafts.update({ draftId: draft.id, expectedRevision: 1, patch: { text: 'Editable again' } }).revision).toBe(2);
});
