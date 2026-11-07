import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AccountStore } from '../accounts';
import { checkAccount } from '../account-check';
import { Platform, CREDENTIAL_FIELDS } from '../schema';

jest.mock('axios');
let directory: string;
let store: AccountStore;
let values: Map<string, string>;
beforeEach(() => {
    jest.resetAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-identity-'));
    values = new Map();
    store = new AccountStore(directory, { get: key => values.get(key), set: (key, value) => { values.set(key, value); }, delete: key => { values.delete(key); } });
    jest.mocked(axios.isAxiosError).mockImplementation(error => Boolean(error && typeof error === 'object' && 'isAxiosError' in error));
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
function add(platform: Platform): void {
    const credentials = Object.fromEntries(CREDENTIAL_FIELDS[platform].map(field => [field, `private-${platform}-${field}`]));
    if (platform === 'mastodon') credentials.instance = 'https://social.example';
    if (platform === 'telegram') { credentials.botToken = '123:private_token'; credentials.chatId = '@mychannel'; }
    if (platform === 'discord') credentials.webhookUrl = 'https://discord.com/api/webhooks/123/private_webhook';
    store.add({ id: platform, name: platform, platform, credentials });
}
it('checks all seven identities with GET only; no posts, sessions or uploads are created', async () => {
    jest.mocked(axios.get).mockImplementation(async url => {
        const ref = String(url);
        if (ref.includes('verify_credentials')) return { data: { acct: 'me@social.example' } };
        if (ref.endsWith('/2/users/me')) return { data: { data: { username: 'myaccount' } } };
        if (ref.endsWith('userinfo')) return { data: { sub: 'person', name: 'Public Name' } };
        if (ref.endsWith('getMe')) return { data: { ok: true, result: { username: 'MyBot' } } };
        if (ref.endsWith('getChat')) return { data: { ok: true, result: { id: 123 } } };
        if (ref.includes('discord.com')) return { data: { id: '123', name: 'My Webhook' } };
        if (ref.includes('resolveHandle')) return { data: { did: 'did:plc:public' } };
        return { data: { username: 'mydevto' } };
    });
    for (const platform of ['mastodon', 'x', 'linkedin', 'telegram', 'discord', 'bluesky', 'devto'] as Platform[]) {
        add(platform);
        const result = await checkAccount(store, store.get(platform));
        expect(result.status).toBe(platform === 'bluesky' ? 'warn' : 'pass');
        expect(result.identity).toBeTruthy();
        expect(JSON.stringify(result)).not.toContain('private-');
    }
    expect(axios.post).not.toHaveBeenCalled(); expect(axios.put).not.toHaveBeenCalled(); expect(axios.delete).not.toHaveBeenCalled();
    for (const call of jest.mocked(axios.get).mock.calls) expect(call[1]).toMatchObject({ timeout: 10000, maxRedirects: 0 });
});
it('handles authentication, read-scope and rate-limit failures without exposing secrets', async () => {
    add('mastodon');
    for (const [status, expected] of [[401, 'fail'], [403, 'warn'], [429, 'fail']] as const) {
        jest.mocked(axios.get).mockRejectedValueOnce({ isAxiosError: true, message: 'private-mastodon-accessToken', response: { status, data: { token: 'private-response-token' } } });
        const result = await checkAccount(store, store.get('mastodon'));
        expect(result.status).toBe(expected);
        expect(JSON.stringify(result)).not.toMatch(/private-mastodon-accessToken|private-response-token/);
    }
});
it('does not claim valid credentials when the keyring is unavailable or the identity response is malformed', async () => {
    add('x'); values.delete('agent:x');
    expect((await checkAccount(store, store.get('x'))).status).toBe('fail');
    expect(axios.get).not.toHaveBeenCalled();
    add('x'); jest.mocked(axios.get).mockResolvedValue({ data: {} });
    expect((await checkAccount(store, store.get('x'))).status).toBe('fail');
});
it('redacts an echoed credential even in a successful identity field', async () => {
    add('x'); jest.mocked(axios.get).mockResolvedValue({ data: { data: { username: 'private-x-accessToken' } } });
    const result = await checkAccount(store, store.get('x'));
    expect(JSON.stringify(result)).not.toContain('private-x-accessToken');
    expect(result.identity).toBe('[REDACTED]');
});
