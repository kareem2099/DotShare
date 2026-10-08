import type * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigHandler } from '../../handlers/ConfigHandler';
import { StorageManager } from '../../storage/storage-manager';
import { ALL_SECRET_KEYS } from '../credentials';

function fixture() {
    const secretValues = new Map<string, string>();
    const state = new Map<string, unknown>();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-secrets-test-'));
    const context = {
        globalStorageUri: { fsPath: root }, extensionPath: root,
        secrets: {
            get: jest.fn(async key => secretValues.get(key)),
            store: jest.fn(async (key, value) => { secretValues.set(key, value); }),
            delete: jest.fn(async key => { secretValues.delete(key); }),
        },
        globalState: {
            get: jest.fn((key, fallback) => state.has(key) ? state.get(key) : fallback),
            update: jest.fn(async (key, value) => { if (value === undefined) state.delete(key); else state.set(key, value); }),
        },
    };
    const messages: Array<{
        command: string; credentialsSaved?: Record<string, boolean>; aiKeysSaved?: Record<string, boolean>;
        selectedModel?: unknown; savedApis?: Array<Record<string, unknown>>;
    }> = [];
    const handler = new ConfigHandler({ webview: { postMessage: jest.fn(msg => messages.push(msg)) } } as unknown as vscode.WebviewView, context as unknown as vscode.ExtensionContext);
    return { context, handler, secretValues, state, messages, root };
}

let f: ReturnType<typeof fixture>;
beforeEach(() => { f = fixture(); });
afterEach(() => { fs.rmSync(f.root, { recursive: true, force: true }); });

it('returns boolean status, never stored values or arbitrary selected-model fields', async () => {
    for (const key of ALL_SECRET_KEYS) f.secretValues.set(key, `secret-value-${key}`);
    f.state.set('selectedModel', { provider: 'claude', model: 'claude-test', apiKey: 'legacy-secret', unrelatedSecret: 'hidden-secret' });
    await f.handler.handleMessage({ command: 'loadConfiguration' });
    const response = f.messages.find(m => m.command === 'updateConfiguration');
    expect(response.credentialsSaved.devtoApiKey).toBe(true);
    expect(response.aiKeysSaved.claude).toBe(true);
    expect(response.selectedModel).toEqual({ provider: 'claude', model: 'claude-test' });
    expect(JSON.stringify(f.messages)).not.toMatch(/secret-value-|legacy-secret|hidden-secret/);
});

it('stores a Dev.to replacement and returns only saved status', async () => {
    await f.handler.handleMessage({ command: 'saveDevToCredentials', devtoApiKey: 'new-private-value' });
    expect(f.secretValues.get('devtoApiKey')).toBe('new-private-value');
    expect(JSON.stringify(f.messages)).not.toContain('new-private-value');
    await f.handler.handleMessage({ command: 'saveDevToCredentials', devtoApiKey: '' });
    expect(f.secretValues.get('devtoApiKey')).toBe('new-private-value');
});

it('preserves a second credential when replacing only one blank UI field', async () => {
    f.secretValues.set('telegramBot', 'old-bot');
    f.secretValues.set('telegramChat', 'old-chat');
    await f.handler.handleMessage({ command: 'saveTelegramCredentials', telegramBot: 'new-bot', telegramChat: '' });
    expect(f.secretValues.get('telegramBot')).toBe('new-bot');
    expect(f.secretValues.get('telegramChat')).toBe('old-chat');
});

it('lists saved configurations without credentials and activates them on the host', async () => {
    const config = { id: 'devto_123_test', name: 'Work', platform: 'devto', created: 'today', credentials: { devtoApiKey: 'private-devto-value' } };
    f.secretValues.set('savedApis_devto', JSON.stringify([config]));
    await f.handler.handleMessage({ command: 'loadSavedApis', platform: 'devto' });
    expect(f.messages[0].savedApis[0]).toEqual(expect.objectContaining({ name: 'Work', hasCredentials: true }));
    expect(f.messages[0].savedApis[0].credentials).toBeUndefined();
    await f.handler.handleMessage({ command: 'loadApiConfig', apiId: config.id });
    expect(f.secretValues.get('devtoApiKey')).toBe('private-devto-value');
    expect(JSON.stringify(f.messages)).not.toContain('private-devto-value');
});

it('snapshots a Saved API from secrets without a round trip through the webview', async () => {
    f.secretValues.set('devtoApiKey', 'snapshot-private-key');
    await f.handler.handleMessage({ command: 'saveApiSet', platform: 'devto', name: 'Personal' });
    const saved = JSON.parse(f.secretValues.get('savedApis_devto')!);
    expect(saved[0].credentials).toEqual({ devtoApiKey: 'snapshot-private-key' });
    expect(JSON.stringify(f.messages)).not.toContain('snapshot-private-key');
});

it('clears every known credential, saved list, legacy list and cloud consent', async () => {
    for (const key of ALL_SECRET_KEYS) f.secretValues.set(key, 'private-value');
    for (const platform of ['linkedin', 'telegram', 'x', 'discord', 'bluesky', 'devto']) {
        f.secretValues.set(`savedApis_${platform}`, '[]');
        f.state.set(`savedApis_${platform}`, [{}]);
    }
    f.state.set('dotshare.cloudCredentialsConsentGiven', true);
    f.state.set('selected_claude_model', 'old-model');
    await f.handler.handleMessage({ command: 'clearAllCredentials' });
    expect(f.secretValues.size).toBe(0);
    expect(f.state.size).toBe(0);
    expect(f.messages.find(m => m.command === 'LOGOUT_SUCCESS')).toBeDefined();
});

it('removes stale plaintext migration copies without overwriting secure data', async () => {
    f.secretValues.set('savedApis_devto', JSON.stringify([{ id: 'new' }]));
    f.state.set('savedApis_devto', [{ id: 'old' }]);
    f.secretValues.set('discordWebhookUrl', 'old-discord-key');
    f.state.set('selectedModel', { provider: 'deepseek', model: 'model', apiKey: 'legacy-ai-key' });
    await new StorageManager(f.context as unknown as vscode.ExtensionContext).migrateLegacyData();
    expect(f.state.has('savedApis_devto')).toBe(false);
    expect(JSON.parse(f.secretValues.get('savedApis_devto')!)[0].id).toBe('new');
    expect(f.secretValues.get('discordWebhook')).toBe('old-discord-key');
    expect(f.secretValues.has('discordWebhookUrl')).toBe(false);
    expect(f.secretValues.get('deepseekApiKey')).toBe('legacy-ai-key');
    expect(f.state.get('selectedModel')).toEqual({ provider: 'deepseek', model: 'model' });
});

it('retains legacy credentials if secure migration fails', async () => {
    f.state.set('savedApis_devto', [{ id: 'legacy' }]);
    f.context.secrets.store.mockRejectedValue(new Error('keyring unavailable'));
    await new StorageManager(f.context as unknown as vscode.ExtensionContext).loadSavedApis('devto');
    expect(f.state.has('savedApis_devto')).toBe(true);
});
