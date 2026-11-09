import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setImmediate } from 'timers';
import { AccountStore } from '../accounts';
import { AgentPublisher } from '../publisher';
import { characterCount, splitThread } from '../preview';
import { OperationJournal, fingerprint, fingerprints, matchesFingerprint } from '../journal';
import { CREDENTIAL_FIELDS, Platform } from '../schema';
import { fetchInstanceLimits } from '../../platforms/mastodon';

jest.mock('@napi-rs/keyring', () => ({ Entry: jest.fn() }));
jest.mock('../../platforms/mastodon', () => ({
    ...jest.requireActual('../../platforms/mastodon'),
    fetchInstanceLimits: jest.fn().mockResolvedValue({ maxChars: 500, maxMedia: 4 }),
}));

let home: string;
let media: string;
let values: Map<string, string>;
let accounts: AccountStore;
beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-agent-test-'));
    media = path.join(home, 'images'); fs.mkdirSync(media);
    values = new Map();
    accounts = new AccountStore(home, { get: key => values.get(key), set: (key, value) => { values.set(key, value); }, delete: key => { values.delete(key); } });
    jest.mocked(fetchInstanceLimits).mockResolvedValue({ maxChars: 500, maxMedia: 4 });
});
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); jest.restoreAllMocks(); });

function add(platform: Platform, id = platform): void {
    const credentials = Object.fromEntries(CREDENTIAL_FIELDS[platform].map(field => [field, `private-${platform}-${field}`]));
    if (platform === 'mastodon') credentials.instance = 'https://social.example';
    if (platform === 'telegram') { credentials.botToken = '123456:private_token'; credentials.chatId = '@example'; }
    if (platform === 'discord') credentials.webhookUrl = 'https://discord.com/api/webhooks/123456/private_webhook';
    accounts.add({ id, name: `My ${id}`, platform, credentials });
}
const png = (): string => {
    const file = path.join(media, 'image.png');
    fs.writeFileSync(file, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]));
    return file;
};
const publisher = (adapter = jest.fn(async (_target, _credentials, _input, report) => { report({ id: 'post-1', url: 'https://social.example/post-1' }); })) => new AgentPublisher(accounts, adapter, [media]);

it('keeps credentials in the keyring and lists metadata without reading secrets', () => {
    add('bluesky', 'personal'); add('bluesky', 'work');
    const file = fs.readFileSync(path.join(home, 'accounts.json'), 'utf8');
    expect(file).not.toContain('private-');
    expect(file).not.toContain('credentials');
    expect(fs.statSync(path.join(home, 'accounts.json')).mode & 0o777).toBe(0o600);
    const locked = new AccountStore(home, { get: () => { throw new Error('Locked'); }, set: jest.fn(), delete: jest.fn() });
    expect(locked.list()).toHaveLength(2);
    expect(() => locked.credentials('personal')).toThrow('Locked');
});
it('does not advertise accounts when secure storage fails', () => {
    const locked = new AccountStore(home, { get: () => undefined, set: () => { throw new Error('Locked'); }, delete: jest.fn() });
    expect(() => locked.add({ id: 'x', name: 'X', platform: 'x', credentials: { accessToken: 'secret' } })).toThrow('Locked');
    expect(locked.list()).toEqual([]);
});
it('rejects invalid destinations and changing an account platform', () => {
    add('x', 'personal');
    expect(() => accounts.add({ id: 'personal', name: 'Other', platform: 'devto', credentials: { apiKey: 'secret' } })).toThrow('cannot change platform');
    for (const webhookUrl of ['https://evil.example/api/webhooks/123/secret', 'http://discord.com/api/webhooks/123/secret', 'https://discord.com/api/webhooks/123/secret?wait=false']) {
        expect(() => accounts.add({ id: 'discord', name: 'Discord', platform: 'discord', credentials: { webhookUrl } })).toThrow();
    }
});
it('revokes local access when an account is removed', () => {
    add('x'); accounts.remove('x');
    expect(accounts.list()).toEqual([]);
    expect(values.has('agent:x')).toBe(false);
    expect(() => accounts.credentials('x')).toThrow('not configured');
});
it('previews all seven platforms without publishing or leaking credentials', async () => {
    const platforms = ['linkedin', 'telegram', 'x', 'discord', 'bluesky', 'mastodon', 'devto'] as Platform[];
    platforms.forEach(platform => add(platform));
    const p = publisher();
    const preview = await p.planner.preview({ accountIds: platforms, text: 'Hello developer world!', article: { title: 'A release' } });
    expect(preview.valid).toBe(true);
    expect(preview.targets).toHaveLength(7);
    expect(JSON.stringify(preview)).not.toContain('private-');
    expect(p.journal.list()).toEqual([]);
});
it('supports different content on different accounts without mutating the request', async () => {
    add('x'); add('linkedin');
    const input = { accountIds: ['x', 'linkedin'], text: 'Short', overrides: { linkedin: { text: 'Long professional variant' } } };
    const before = JSON.stringify(input);
    const preview = await publisher().planner.preview(input);
    expect(preview.targets.map(target => target.posts[0].text)).toEqual(['Short', 'Long professional variant']);
    expect(JSON.stringify(input)).toBe(before);
});
it('allows an account-specific thread to replace common single-post text', async () => {
    add('x'); add('linkedin');
    const preview = await publisher().planner.preview({
        accountIds: ['x', 'linkedin'], text: 'Common announcement',
        overrides: { x: { posts: [{ text: 'First part' }, { text: 'Second part' }] } },
    });
    expect(preview.valid).toBe(true);
    expect(preview.targets[0].posts).toHaveLength(2);
    expect(preview.targets[1].posts[0].text).toBe('Common announcement');
});
it('splits Arabic, emoji, newlines, long words and URLs into bounded threads', () => {
    for (const platform of ['x', 'mastodon'] as Platform[]) {
        const text = 'أهلا 👨‍👩‍👧‍👦\n'.repeat(100) + 'x'.repeat(800) + ' https://example.com/' + 'a'.repeat(800);
        const parts = splitThread(text, platform, 300);
        expect(parts.length).toBeGreaterThan(1);
        expect(parts.every(part => characterCount(part, platform) <= 300)).toBe(true);
        expect(parts.join(' ')).toContain(`https://example.com/${'a'.repeat(800)}`);
    }
});
it('counts short and long URLs as 23 characters for X and Mastodon', () => {
    expect(characterCount('https://x.co', 'x')).toBe(23);
    expect(characterCount('https://example.com/long/path', 'mastodon')).toBe(23);
});
it('does not produce empty thread parts from long whitespace', async () => {
    add('x');
    expect(splitThread(' '.repeat(2000), 'x', 280)).toEqual(['']);
    const text = `Hello${'\n'.repeat(1000)}world`;
    expect(splitThread(text, 'x', 280).every(part => part.replace(/\s*\(\d+\/\d+\)$/, '').trim())).toBe(true);
    expect((await publisher().planner.preview({ accountIds: ['x'], text: ' '.repeat(2000), autoSplit: true })).valid).toBe(false);
});
it('uses live Mastodon character and attachment limits', async () => {
    add('mastodon');
    jest.mocked(fetchInstanceLimits).mockResolvedValue({ maxChars: 1000, maxMedia: 1 });
    const preview = await publisher().planner.preview({ accountIds: ['mastodon'], text: 'a'.repeat(800) });
    expect(preview.valid).toBe(true);
    expect(preview.targets[0].characterLimit).toBe(1000);
    const bad = await publisher().planner.preview({ accountIds: ['mastodon'], text: 'Hello', media: [png(), png()] });
    expect(bad.valid).toBe(false);
});
it('keeps images on the first automatic thread part and supports explicit thread media', async () => {
    add('bluesky'); const image = png();
    const preview = await publisher().planner.preview({ accountIds: ['bluesky'], text: 'a'.repeat(700), autoSplit: true, media: [image] });
    expect(preview.valid).toBe(true);
    expect(preview.targets[0].posts.map(part => part.media.length)).toEqual([1, 0, 0]);
    const explicit = await publisher().planner.preview({ accountIds: ['bluesky'], posts: [{ text: 'First' }, { text: 'Second', media: [image] }] });
    expect(explicit.valid).toBe(true);
    expect(explicit.targets[0].posts[1].media).toEqual([image]);
});
it('rejects long posts without autoSplit, unsupported threads and conflicting content', async () => {
    add('x'); add('linkedin');
    for (const input of [
        { accountIds: ['x'], text: 'x'.repeat(281) },
        { accountIds: ['linkedin'], posts: [{ text: 'Thread' }] },
        { accountIds: ['x'], text: 'Mixed', posts: [{ text: 'Thread' }] },
        { accountIds: ['x', 'x'], text: 'Duplicate' },
        { accountIds: ['x'], text: 'Hi', overrides: { other: { text: 'Oops' } } },
    ]) expect((await publisher().planner.preview(input)).valid).toBe(false);
});
it('rejects missing media, symlink escapes, unsupported bytes, oversized images and social URLs', async () => {
    add('bluesky');
    const outside = path.join(home, 'outside.png'); fs.copyFileSync(png(), outside);
    const symlink = path.join(media, 'symlink.png'); fs.symlinkSync(outside, symlink);
    const fake = path.join(media, 'fake.png'); fs.writeFileSync(fake, '<html>not an image</html>');
    const huge = path.join(media, 'huge.png'); fs.writeFileSync(huge, Buffer.alloc(1000001));
    for (const ref of [path.join(media, 'missing.png'), outside, symlink, fake, huge, 'https://example.com/image.png']) {
        expect((await publisher().planner.preview({ accountIds: ['bluesky'], text: 'Media', media: [ref] })).valid).toBe(false);
    }
});
it('disables local images unless DOTSHARE_MEDIA_ROOTS lists absolute directories', async () => {
    add('bluesky');
    const image = png();
    const previous = process.env.DOTSHARE_MEDIA_ROOTS;
    try {
        delete process.env.DOTSHARE_MEDIA_ROOTS;
        const unset = await new AgentPublisher(accounts).planner.preview({ accountIds: ['bluesky'], text: 'Media', media: [image] });
        expect(unset.errors.join()).toContain('Set DOTSHARE_MEDIA_ROOTS');
        // Text-only posts keep working without the setting.
        expect((await new AgentPublisher(accounts).planner.preview({ accountIds: ['bluesky'], text: 'Text only' })).valid).toBe(true);

        process.env.DOTSHARE_MEDIA_ROOTS = 'images';
        const relative = await new AgentPublisher(accounts).planner.preview({ accountIds: ['bluesky'], text: 'Media', media: [image] });
        expect(relative.errors.join()).toContain('absolute paths');

        process.env.DOTSHARE_MEDIA_ROOTS = media;
        expect((await new AgentPublisher(accounts).planner.preview({ accountIds: ['bluesky'], text: 'Media', media: [image] })).valid).toBe(true);
    } finally {
        if (previous === undefined) delete process.env.DOTSHARE_MEDIA_ROOTS; else process.env.DOTSHARE_MEDIA_ROOTS = previous;
    }
});
it('requires Dev.to article metadata and public HTTPS image references', async () => {
    add('devto');
    expect((await publisher().planner.preview({ accountIds: ['devto'], text: 'Body' })).valid).toBe(false);
    expect((await publisher().planner.preview({ accountIds: ['devto'], text: 'Body', article: { title: 'Title' }, media: [png()] })).valid).toBe(false);
    expect((await publisher().planner.preview({ accountIds: ['devto'], text: 'Body', article: { title: 'Title' }, media: ['https://cdn.example/image.png'] })).valid).toBe(true);
});
it('uses the Telegram media caption limit before any network request', async () => {
    add('telegram');
    expect((await publisher().planner.preview({ accountIds: ['telegram'], text: 'a'.repeat(1025), media: [png()] })).valid).toBe(false);
});
it('publishes once and recovers the same result after a process restart', async () => {
    add('x'); const adapter = jest.fn(async (_target, _credentials, _input, report) => report({ id: '123', url: 'https://x.com/i/status/123' }));
    const p = publisher(adapter);
    const input = { requestId: 'release-1', accountIds: ['x'], text: 'Launch' };
    expect((await p.publish(input)).operation.status).toBe('completed');
    const replay = await new AgentPublisher(accounts, adapter, [media]).publish(input);
    expect(replay.replayed).toBe(true);
    expect(replay.operation.results[0].receipts[0].id).toBe('123');
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(p.journal.list())).not.toContain('private-x-accessToken');
});
it('claims the request atomically when concurrent agents publish it', async () => {
    add('x');
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const adapter = jest.fn(async (_target, _credentials, _input, report) => { await barrier; report({ id: '123' }); });
    const p = publisher(adapter); const input = { requestId: 'concurrent', accountIds: ['x'], text: 'Launch' };
    const first = p.publish(input);
    await new Promise(resolve => setImmediate(resolve));
    const second = await publisher(adapter).publish(input);
    expect(second.replayed).toBe(true);
    expect(second.operation.status).toBe('running');
    release(); await first;
    expect(adapter).toHaveBeenCalledTimes(1);
});
it('records partial thread receipts and never resends an uncertain request', async () => {
    add('x');
    const adapter = jest.fn(async (_target, _credentials, _input, report) => { report({ id: 'first' }); throw new Error('Timed out with private-x-accessToken'); });
    const p = publisher(adapter); const input = { requestId: 'partial', accountIds: ['x'], text: 'Launch' };
    const first = await p.publish(input);
    expect(first.operation.status).toBe('needs_review');
    expect(first.operation.results[0].receipts).toEqual([{ id: 'first' }]);
    expect(first.operation.results[0].error).toContain('[REDACTED]');
    expect((await p.publish(input)).replayed).toBe(true);
    expect(adapter).toHaveBeenCalledTimes(1);
    await expect(p.publish({ ...input, text: 'Different' })).rejects.toThrow('different content');
});
it('does not treat a missing receipt as publishing success', async () => {
    add('x');
    const result = await publisher(jest.fn(async () => undefined)).publish({ requestId: 'no-receipt', accountIds: ['x'], text: 'Hello' });
    expect(result.operation.status).toBe('needs_review');
});
it('stops after a recorded receipt on cancellation and skips remaining accounts', async () => {
    add('x'); add('bluesky');
    const controller = new AbortController();
    const adapter = jest.fn(async (_target, _credentials, _input, report) => {
        controller.abort(); report({ id: 'already-published' });
    });
    const result = await publisher(adapter).publish({ requestId: 'cancelled', accountIds: ['x', 'bluesky'], text: 'Hello' }, controller.signal);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(result.operation.results[0].receipts).toEqual([{ id: 'already-published' }]);
    expect(result.operation.results[1].status).toBe('cancelled');
    expect(result.operation.status).toBe('needs_review');
});
it('preflights every account and image before publishing to any account', async () => {
    add('x'); add('bluesky'); values.delete('agent:bluesky');
    const adapter = jest.fn(); const p = publisher(adapter);
    await expect(p.publish({ requestId: 'preflight', accountIds: ['x', 'bluesky'], text: 'Hello' })).rejects.toThrow('Credentials unavailable');
    expect(adapter).not.toHaveBeenCalled();
    expect(p.journal.list()).toEqual([]);
});
it('canonicalizes JSON key order, rejects conflicting IDs and fails closed on corrupt journals', () => {
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
    const journal = new OperationJournal(home, accounts.files);
    journal.begin('one', 'hash', 'publish');
    expect(journal.begin('one', 'hash', 'publish').replayed).toBe(true);
    expect(() => journal.begin('one', 'hash', 'schedule')).toThrow('different content');
    expect(() => journal.get('../escape')).toThrow();
    fs.writeFileSync(path.join(home, 'operations', 'one.json'), '');
    expect(() => journal.get('one')).toThrow('unreadable');
    expect(() => journal.begin('one', 'hash', 'publish')).toThrow('unreadable');
});
it('lists readable operations when one record is damaged', () => {
    const journal = new OperationJournal(home, accounts.files);
    journal.begin('good', 'hash-good', 'publish');
    journal.begin('bad', 'hash-bad', 'publish');
    fs.writeFileSync(path.join(home, 'operations', 'bad.json'), '{"truncated"');
    const listed = journal.list();
    expect(listed).toHaveLength(2);
    expect(listed[0]).toMatchObject({ requestId: 'good', fingerprint: 'hash-good' });
    expect(listed[1]).toMatchObject({ requestId: 'bad', unreadable: true });
});
it('orders fingerprint keys by code point and still accepts records hashed with localeCompare', () => {
    // localeCompare puts "personal" before "Work"; code-point order puts "Work" first.
    const value = { overrides: { Work: { text: 'a' }, personal: { text: 'b' } } };
    const { current, legacy } = fingerprints(value);
    expect(current).toBe(fingerprint({ overrides: { personal: { text: 'b' }, Work: { text: 'a' } } }));
    expect(current).not.toBe(legacy);
    expect(matchesFingerprint(legacy, value)).toBe(true);
    expect(matchesFingerprint(fingerprint({ other: true }), value)).toBe(false);

    const journal = new OperationJournal(home, accounts.files);
    journal.begin('legacy', legacy, 'publish');
    expect(journal.begin('legacy', fingerprints(value), 'publish').replayed).toBe(true);
    expect(() => journal.begin('legacy', fingerprints({ changed: true }), 'publish')).toThrow('different content');
});
it('looks up relative image paths inside the media roots, not the working directory', async () => {
    add('bluesky');
    png();
    const preview = await publisher().planner.preview({ accountIds: ['bluesky'], text: 'Media', media: ['image.png'] });
    expect(preview.valid).toBe(true);
    expect(preview.targets[0].posts[0].media[0]).toBe(fs.realpathSync(path.join(media, 'image.png')));
    const missing = await publisher().planner.preview({ accountIds: ['bluesky'], text: 'Media', media: ['missing.png'] });
    expect(missing.errors.join()).toContain('not found in DOTSHARE_MEDIA_ROOTS');
    fs.writeFileSync(path.join(home, 'outside.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]));
    const escape = await publisher().planner.preview({ accountIds: ['bluesky'], text: 'Media', media: ['../outside.png'] });
    expect(escape.errors.join()).toContain('outside DOTSHARE_MEDIA_ROOTS');
});
it('carries a LinkedIn first comment into the plan and ignores it elsewhere', async () => {
    add('linkedin'); add('x');
    const preview = await publisher().planner.preview({ accountIds: ['linkedin', 'x'], text: 'New article out', firstComment: 'Read it: https://dev.to/example' });
    expect(preview.valid).toBe(true);
    expect(preview.targets.find(target => target.platform === 'linkedin')?.firstComment).toBe('Read it: https://dev.to/example');
    expect(preview.targets.find(target => target.platform === 'x')).not.toHaveProperty('firstComment');
    expect(preview.warnings.join()).toContain('x: firstComment is only posted on LinkedIn');

    const perAccount = await publisher().planner.preview({ accountIds: ['linkedin'], text: 'Post', firstComment: 'Shared', overrides: { linkedin: { firstComment: 'Account specific' } } });
    expect(perAccount.targets[0].firstComment).toBe('Account specific');
    expect(() => publisher().planner.preview({ accountIds: ['linkedin'], text: 'Post', firstComment: 'x'.repeat(1251) })).rejects.toThrow();
});
it('publishes the first comment through the LinkedIn adapter', async () => {
    add('linkedin');
    const adapter = jest.fn(async (target, _credentials, _input, report) => { report({ id: 'post' }); if (target.firstComment) report({ id: 'comment' }); });
    const result = await publisher(adapter).publish({ requestId: 'linkedin-first-comment', accountIds: ['linkedin'], text: 'Post', firstComment: 'Link here' });
    expect(adapter.mock.calls[0][0].firstComment).toBe('Link here');
    expect(result.operation.results[0].receipts.map(receipt => receipt.id)).toEqual(['post', 'comment']);
});
