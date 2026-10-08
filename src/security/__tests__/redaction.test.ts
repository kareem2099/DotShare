import type * as vscode from 'vscode';
import { protectSecretStorage, redactSensitiveText, rememberSecret } from '../redaction';

it('redacts provider keys, bearer tokens, auth URLs and credential fields', () => {
    const raw = 'sk-123456789abcdef Bearer arbitrary-token https://callback?token=another-secret&code=oauth-code {"api-key":"private-value","telegramBot":"bot-value"}';
    const result = redactSensitiveText(raw);
    for (const value of ['123456789abcdef', 'arbitrary-token', 'another-secret', 'oauth-code', 'private-value', 'bot-value']) expect(result).not.toContain(value);
});

it('redacts registered secrets including URL encoded values and saved API JSON', () => {
    rememberSecret('an-unformatted-secret:with/slashes');
    rememberSecret(JSON.stringify([{ credentials: { devtoApiKey: 'saved-api-private-key', blueskyPassword: 'app-password-value' } }]));
    expect(redactSensitiveText('an-unformatted-secret:with/slashes an-unformatted-secret%3Awith%2Fslashes saved-api-private-key app-password-value')).toBe('[REDACTED] [REDACTED] [REDACTED] [REDACTED]');
});

it('guards secret reads and writes while preserving the VS Code context', async () => {
    const stored = new Map([['test', 'plain-unformatted-secret']]);
    const context = { globalState: {}, subscriptions: [], secrets: {
        onDidChange: jest.fn(), get: jest.fn(async key => stored.get(key)),
        store: jest.fn(async (key, value) => { stored.set(key, value); }), delete: jest.fn(async key => stored.delete(key)),
    } };
    const guarded = protectSecretStorage(context as unknown as vscode.ExtensionContext);
    expect(guarded.globalState).toBe(context.globalState);
    expect(await guarded.secrets.get('test')).toBe('plain-unformatted-secret');
    expect(redactSensitiveText('failure: plain-unformatted-secret')).toBe('failure: [REDACTED]');
    await guarded.secrets.store('new', 'another-unformatted-secret');
    expect(redactSensitiveText('another-unformatted-secret')).toBe('[REDACTED]');
    await guarded.secrets.delete('new');
    expect(stored.has('new')).toBe(false);
});
