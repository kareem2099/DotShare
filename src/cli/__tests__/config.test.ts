import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigManager } from '../config';
import type { CliCredentialStore } from '../credential-store';

jest.mock('@napi-rs/keyring', () => ({ Entry: jest.fn() }));
let root: string;
let stored: Map<string, string>;
let secrets: CliCredentialStore;
beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-cli-test-'));
    stored = new Map();
    secrets = { get: key => stored.get(key), set: (key, value) => { stored.set(key, value); }, delete: key => { stored.delete(key); } };
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('persists metadata only and retrieves credentials from the keyring', () => {
    const config = new ConfigManager(root, secrets);
    config.setTelegramCredentials('private-bot', 'private-chat');
    config.setLinkedInToken('private-linkedin');
    config.setDefaultPlatforms(['telegram']);
    const disk = fs.readFileSync(path.join(root, 'config.json'), 'utf8');
    expect(disk).not.toMatch(/private-|credentials/);
    expect(new ConfigManager(root, secrets).getConfig().credentials.telegram).toEqual({ botToken: 'private-bot', chatId: 'private-chat' });
    expect(config.getConfiguredPlatforms()).toEqual(['telegram', 'linkedin']);
});

it('preserves conflicting legacy credentials instead of silently discarding them', () => {
    stored.set('linkedin', JSON.stringify({ accessToken: 'newer-secure-token' }));
    const legacy = JSON.stringify({ credentials: { linkedin: { accessToken: 'old-token' } } });
    fs.writeFileSync(path.join(root, 'config.json'), legacy, {mode: 0o600});
    expect(() => new ConfigManager(root, secrets).getConfig()).toThrow('conflict');
    expect(fs.readFileSync(path.join(root, 'config.json'), 'utf8')).toBe(legacy);
});

it('fails closed and leaves the legacy file intact when OS storage is unavailable', () => {
    const legacy = JSON.stringify({ credentials: { linkedin: { accessToken: 'legacy-value' } } });
    fs.writeFileSync(path.join(root, 'config.json'), legacy, {mode: 0o600});
    const locked = { get: () => undefined, set: () => { throw new Error('keyring locked'); } };
    expect(() => new ConfigManager(root, locked).getConfig()).toThrow('keyring locked');
    expect(fs.readFileSync(path.join(root, 'config.json'), 'utf8')).toBe(legacy);
});

it('never writes a failed new credential to disk', () => {
    const locked = { get: () => undefined, set: () => { throw new Error('keyring locked'); } };
    expect(() => new ConfigManager(root, locked).setLinkedInToken('must-never-hit-disk')).toThrow();
    expect(fs.readFileSync(path.join(root, 'config.json'), 'utf8')).not.toContain('must-never-hit-disk');
});
