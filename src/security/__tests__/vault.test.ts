import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalVault } from '../vault';
import { privateRead, privateWriteJson } from '../private-files';
import { CliCredentialStore, OsCredentialStore } from '../../cli/credential-store';
import { Entry } from '@napi-rs/keyring';
import { rememberSecret, redactSensitiveText, safeLogValue, assertNoKnownSecrets } from '../redaction';

jest.mock('@napi-rs/keyring', () => ({ Entry: jest.fn().mockImplementation(() => ({ getPassword: jest.fn(() => 'test'), setPassword: jest.fn(), deletePassword: jest.fn() })) }));
let home: string;
let secrets: Map<string, string>;
let store: CliCredentialStore;
let vault: LocalVault;
const record = () => path.join(home, 'drafts', 'saved.json');
beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-vault-test-')); secrets = new Map();
    store = { get: key => secrets.get(key), set: (key, value) => { secrets.set(key, value); }, delete: key => { secrets.delete(key); } };
    vault = new LocalVault(home, store);
});
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); jest.restoreAllMocks(); });
it('writes authenticated ciphertext with a random key only in the OS store, and survives a new process instance', () => {
    vault.write(record(), { text: 'private-draft-body', token: 'accidental-private-value' });
    expect(fs.readFileSync(record(), 'utf8')).not.toMatch(/private-draft-body|accidental-private-value/);
    expect(new LocalVault(home, store).read(record())).toEqual({ text: 'private-draft-body', token: 'accidental-private-value' });
    expect(secrets.size).toBe(1); expect([...secrets.keys()][0]).toMatch(/^vault:/);
    expect(fs.readFileSync(path.join(home, 'security.json'), 'utf8')).not.toContain([...secrets.values()][0]);
    expect(fs.statSync(record()).mode & 0o777).toBe(0o600); expect(fs.statSync(path.dirname(record())).mode & 0o777).toBe(0o700);
});
it('uses a fresh 96-bit nonce and a 128-bit tag on every write', () => {
    vault.write(record(), { text: 'same content' }); const first = JSON.parse(fs.readFileSync(record(), 'utf8'));
    vault.write(record(), { text: 'same content' }); const second = JSON.parse(fs.readFileSync(record(), 'utf8'));
    expect(first.nonce).not.toBe(second.nonce); expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(Buffer.from(first.nonce, 'base64')).toHaveLength(12); expect(Buffer.from(first.tag, 'base64')).toHaveLength(16);
});
it.each(['ciphertext', 'nonce', 'tag', 'keyId', 'algorithm', 'version'])('rejects a tampered %s without releasing plaintext', field => {
    vault.write(record(), { text: 'must-stay-private' }); const envelope = JSON.parse(fs.readFileSync(record(), 'utf8'));
    envelope[field] = field === 'version' ? 2 : 'tampered'; fs.writeFileSync(record(), JSON.stringify(envelope));
    expect(() => vault.read(record())).toThrow('authentication failed');
});
it('binds ciphertext to the category and record ID, rejecting copied or swapped records', () => {
    vault.write(record(), { text: 'record A' }); const other = path.join(home, 'drafts', 'other.json'); fs.copyFileSync(record(), other); fs.chmodSync(other, 0o600);
    expect(() => vault.read(other)).toThrow('authentication failed');
    vault.directory('templates'); const template = path.join(home, 'templates', 'saved.json'); fs.copyFileSync(record(), template); fs.chmodSync(template, 0o600);
    expect(() => vault.read(template)).toThrow('authentication failed');
});
it('never regenerates a lost key or overwrites ciphertext when the OS store is locked/missing', () => {
    vault.write(record(), { text: 'original' }); const before = fs.readFileSync(record(), 'utf8');
    secrets.clear(); const set = jest.spyOn(store, 'set');
    expect(() => vault.read(record())).toThrow('key is unavailable'); expect(() => vault.write(record(), { text: 'replacement' })).toThrow('key is unavailable');
    expect(set).not.toHaveBeenCalled(); expect(fs.readFileSync(record(), 'utf8')).toBe(before);
});
it('blocks creation of a replacement vault when encrypted records outlive their manifest', () => {
    vault.write(record(), { text: 'original' }); fs.unlinkSync(path.join(home, 'security.json'));
    expect(() => new LocalVault(home, store).write(record(), { text: 'replacement' })).toThrow('without vault metadata');
});
it('rejects a substituted 256-bit OS key before overwriting any existing ciphertext', () => {
    vault.write(record(), { text: 'original' }); const before = fs.readFileSync(record(), 'utf8');
    secrets.set([...secrets.keys()][0], Buffer.alloc(32, 7).toString('base64'));
    expect(() => vault.write(record(), { text: 'replacement' })).toThrow('does not match');
    expect(fs.readFileSync(record(), 'utf8')).toBe(before);
});
it('holds a cross-process migration/write lock and never authenticates corrupted ciphertext after replacing plaintext', () => {
    vault.write(record(), { text: 'encrypted first' }); const envelope = JSON.parse(fs.readFileSync(record(), 'utf8')); envelope.tag = Buffer.alloc(16).toString('base64'); fs.writeFileSync(record(), JSON.stringify(envelope));
    const plaintext = path.join(home, 'drafts', 'another.json'); privateWriteJson(plaintext, { text: 'still original' });
    expect(() => vault.protect()).toThrow('authentication'); expect(JSON.parse(fs.readFileSync(plaintext, 'utf8'))).toEqual({ text: 'still original' });
    fs.writeFileSync(path.join(home, 'security.write.lock'), '', {mode: 0o600});
    expect(() => vault.write(plaintext, {})).toThrow('busy');
});
it('fails initialization without a usable keyring, leaving no plaintext record or file key', () => {
    const unavailable = new LocalVault(home, { get: () => undefined, set: () => { throw new Error('locked'); }, delete: jest.fn() });
    expect(() => unavailable.write(record(), { text: 'never-on-disk' })).toThrow('No plaintext fallback');
    expect(fs.existsSync(record())).toBe(false); expect(fs.existsSync(path.join(home, 'security.json'))).toBe(false);
    expect(fs.readdirSync(home)).toEqual(['drafts']);
});
it('migrates existing plaintext explicitly, preserving content/IDs and leaving no plaintext backup', () => {
    fs.mkdirSync(path.dirname(record()), { mode: 0o755 }); fs.writeFileSync(record(), JSON.stringify({ id: 'same-id', text: 'old-private-content' }));
    expect(() => vault.read(record())).toThrow();
    expect(vault.protect()).toEqual({ encrypted: 1, alreadyEncrypted: 0 });
    expect(vault.read(record())).toEqual({ id: 'same-id', text: 'old-private-content' });
    expect(vault.protect()).toEqual({ encrypted: 0, alreadyEncrypted: 1 });
    expect(fs.readdirSync(path.dirname(record()))).toEqual(['saved.json']);
    expect(fs.statSync(path.dirname(record())).mode & 0o777).toBe(0o700);
    expect(vault.status()).toMatchObject({ encrypted: 1, plaintext: 0, unreadable: 0, keyAccess: 'not-checked' });
});
it('refuses plaintext reads and validates all migration files before replacing any record', () => {
    vault.directory('drafts'); privateWriteJson(record(), { text: 'legacy' }); privateWriteJson(path.join(home, 'drafts', 'broken.json'), {}); fs.writeFileSync(path.join(home, 'drafts', 'broken.json'), 'private-malformed-content');
    expect(() => vault.read(record())).toThrow('plaintext records are blocked');
    expect(() => vault.protect()).toThrow('unreadable'); expect(JSON.parse(fs.readFileSync(record(), 'utf8'))).toEqual({ text: 'legacy' });
    expect(secrets.size).toBe(0);
});
it('refuses symbolic links, hard links, broad permissions and escaping paths', () => {
    vault.write(record(), { text: 'safe' });
    const linked = path.join(home, 'drafts', 'link.json'); fs.symlinkSync(record(), linked); expect(() => vault.read(linked)).toThrow('symlinks'); fs.unlinkSync(linked);
    fs.linkSync(record(), linked); expect(() => vault.write(record(), {})).toThrow('hardlinks'); fs.unlinkSync(linked);
    fs.chmodSync(record(), 0o644); expect(() => vault.read(record())).toThrow('permissions'); fs.chmodSync(record(), 0o600);
    expect(() => vault.write(path.join(home, '..', 'escape.json'), {})).toThrow('outside');
});
it('does not follow a symbolic-link home or record directory', () => {
    const other = path.join(home, 'actual'); fs.mkdirSync(other); const link = path.join(home, 'link'); fs.symlinkSync(other, link);
    expect(() => new LocalVault(link, store).write(path.join(link, 'drafts', 'one.json'), {})).toThrow('symlinks');
    fs.symlinkSync(other, path.join(home, 'drafts')); expect(() => vault.write(record(), {})).toThrow('symlinks');
});
it('retains an exclusive publication claim when a competing process attempts to overwrite it', () => {
    vault.write(record(), { claim: 'first' }, true);
    expect(() => vault.write(record(), { claim: 'second' }, true)).toThrow(); expect(vault.read(record())).toEqual({ claim: 'first' });
});
it('pins Linux credentials to Secret Service, never the automatic fallback', () => {
    const credentials = new OsCredentialStore(); credentials.get('test'); credentials.set('test', 'secret'); credentials.delete('test');
    if (process.platform === 'linux') expect(Entry).toHaveBeenLastCalledWith('DotShare CLI', 'test', { linux: { store: 'secret-service' } });
});
it('redacts unregistered credential URLs, credentials in objects and circular errors', () => {
    const message = redactSensitiveText('https://api.telegram.org/bot123:private/sendMessage https://discord.com/api/webhooks/123/private-webhook https://user:password@example.com/?client_secret=private-query');
    expect(message).not.toMatch(/123:private|private-webhook|user:password|private-query/);
    const circular: Record<string, unknown> = { accessToken: 'never-log', config: { data: 'never-log-body' }, message: 'Safe error' }; circular.self = circular;
    expect(safeLogValue(circular)).not.toMatch(/never-log/); expect(safeLogValue(circular)).toContain('Safe error');
});
it('blocks a known credential in publication text without treating public instance URLs as secrets', () => {
    rememberSecret(JSON.stringify({ accessToken: 'real-credential-for-leak-test', instance: 'https://public.example' }));
    expect(() => assertNoKnownSecrets({ text: 'real-credential-for-leak-test' })).toThrow('Publication blocked');
    expect(() => assertNoKnownSecrets({ text: 'Visit https://public.example' })).not.toThrow();
    rememberSecret('\ud800'); expect(() => redactSensitiveText('Other text')).not.toThrow();
});
it('never prints malformed storage contents through JSON parse errors', () => {
    vault.directory('drafts'); fs.writeFileSync(record(), 'a-very-private-malformed-value', { mode: 0o600 });
    try { vault.read(record()); throw new Error('must reject'); } catch (error) { expect((error as Error).message).not.toContain('a-very-private'); }
    expect(() => privateRead(record(), 1)).toThrow();
});
