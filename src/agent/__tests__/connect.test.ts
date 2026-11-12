import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import { createCipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from 'crypto';
import { AccountStore } from '../accounts';
import { connectAccount } from '../connect';
import { accountFingerprint } from '../publication-seal';

jest.mock('@napi-rs/keyring', () => ({ Entry: jest.fn() }));

/** The server half of the hand-off, as dotsuite.dev implements it (src/lib/social-connect.ts). */
function seal(cli: { port: number; key: string; nonce: string }, platform: string, token: Record<string, unknown>): string {
    const info = Buffer.from('dotshare-connect-v1');
    const peer = createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: cli.key }, format: 'jwk' });
    const own = generateKeyPairSync('x25519');
    const ownKey = Buffer.from(own.publicKey.export({ format: 'jwk' }).x!, 'base64url');
    const key = Buffer.from(hkdfSync('sha256', diffieHellman({ privateKey: own.privateKey, publicKey: peer }), Buffer.concat([ownKey, Buffer.from(cli.key, 'base64url')]), info, 32));
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(info);
    const body = Buffer.concat([cipher.update(JSON.stringify({ nonce: cli.nonce, platform, token })), cipher.final()]);
    return `http://127.0.0.1:${cli.port}/callback?${new URLSearchParams({ payload: Buffer.concat([ownKey, iv, cipher.getAuthTag(), body]).toString('base64url') })}`;
}
const cliOf = (url: string) => { const q = new URL(url).searchParams; return { port: Number(q.get('port')), key: q.get('key')!, nonce: q.get('nonce')! }; };
const get = (url: string) => new Promise<number>(resolve => http.get(url, res => { res.resume(); resolve(res.statusCode!); }).on('error', () => resolve(0)));
const token = (access: string, refresh?: string, expiresAt = Math.floor(Date.now() / 1000) + 7200) => ({ access_token: access, ...(refresh && { refresh_token: refresh }), expires_at: expiresAt });

let home: string;
let store: AccountStore;
beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-connect-test-'));
    const values = new Map<string, string>();
    store = new AccountStore(home, { get: key => values.get(key), set: (key, value) => { values.set(key, value); }, delete: key => { values.delete(key); } });
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

it('signs in through dotsuite.dev and stores the tokens it alone can decrypt', async () => {
    let started = '';
    const result = await connectAccount(store, { id: 'work-x', platform: 'x', openBrowser: async url => {
        started = url;
        expect(await get(seal(cliOf(url), 'x', token('access-1', 'refresh-1')))).toBe(200);
    } });
    expect(started).toMatch(/^https:\/\/dotsuite\.dev\/api\/connect\/x\?target=cli&port=\d+&key=[\w-]{43}&nonce=[\w-]+$/);
    expect(result.refreshable).toBe(true);
    expect(store.credentials('work-x')).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    expect(store.credentials('work-x').connectionId).toMatch(/^[0-9a-f-]{36}$/);
});

it('ignores results meant for another sign-in and keeps waiting for the real one', async () => {
    await connectAccount(store, { id: 'work-li', platform: 'linkedin', openBrowser: async url => {
        const cli = cliOf(url);
        expect(await get(seal({ ...cli, nonce: 'a'.repeat(32) }, 'linkedin', token('attacker')))).toBe(400);
        expect(await get(seal(cli, 'x', token('wrong-platform')))).toBe(400);
        expect(await get(`http://127.0.0.1:${cli.port}/callback?payload=AAAA`)).toBe(400);
        expect(await get(`http://127.0.0.1:${cli.port}/callback?error=stop&nonce=wrong`)).toBe(400);
        expect(await get(seal(cli, 'linkedin', token('genuine')))).toBe(200);
    } });
    expect(store.credentials('work-li').accessToken).toBe('genuine');
    expect(store.credentials('work-li').refreshToken).toBeUndefined();
});

it('stops on a cancelled sign-in or timeout without saving anything', async () => {
    await expect(connectAccount(store, { id: 'a', platform: 'x', openBrowser: async url => {
        const cli = cliOf(url); await get(`http://127.0.0.1:${cli.port}/callback?${new URLSearchParams({ error: 'You cancelled the sign-in.', nonce: cli.nonce })}`);
    } })).rejects.toThrow('You cancelled the sign-in.');
    await expect(connectAccount(store, { id: 'a', platform: 'x', timeoutMs: 200, openBrowser: () => undefined })).rejects.toThrow('Timed out');
    expect(store.list()).toEqual([]);
    await expect(connectAccount(store, { id: 'a', platform: 'mastodon', openBrowser: () => undefined })).rejects.toThrow();
});

it('refreshes an expiring X sign-in once, saves the rotated pair and keeps the account identity', async () => {
    const soon = String(Math.floor(Date.now() / 1000) + 60);
    store.add({ id: 'x', name: 'X', platform: 'x', credentials: { accessToken: 'old', refreshToken: 'r1', expiresAt: soon, connectionId: 'c-1' } });
    const before = accountFingerprint(store, 'x', store.credentials('x'));
    store.xRefresher = jest.fn(async () => ({ accessToken: 'new', refreshToken: 'r2', expiresAt: Math.floor(Date.now() / 1000) + 7200 }));
    expect((await store.freshCredentials('x')).accessToken).toBe('new');
    expect(store.credentials('x').refreshToken).toBe('r2');
    expect(accountFingerprint(store, 'x', store.credentials('x'))).toBe(before);
    await store.freshCredentials('x');
    expect(store.xRefresher).toHaveBeenCalledTimes(1);
});

it('uses the pair another process saved when it lost the refresh race, and reports real failures', async () => {
    store.add({ id: 'x', name: 'X', platform: 'x', credentials: { accessToken: 'old', refreshToken: 'r1', expiresAt: '1', connectionId: 'c-1' } });
    store.xRefresher = async () => {
        store.add({ id: 'x', name: 'X', platform: 'x', credentials: { accessToken: 'theirs', refreshToken: 'r9', expiresAt: '9999999999', connectionId: 'c-1' } });
        throw new Error('invalid_grant');
    };
    expect((await store.freshCredentials('x')).accessToken).toBe('theirs');
    store.add({ id: 'x', name: 'X', platform: 'x', credentials: { accessToken: 'old', refreshToken: 'r1', expiresAt: '1', connectionId: 'c-1' } });
    store.xRefresher = async () => { throw new Error('X sign-in expired or was revoked.'); };
    await expect(store.freshCredentials('x')).rejects.toThrow('expired');
});

it('accepts sign-in fields only on browser-connected platforms', () => {
    expect(() => store.add({ id: 't', name: 'T', platform: 'telegram', credentials: { botToken: '1:a', chatId: '1', expiresAt: '1' } })).toThrow('Allowed credentials');
    expect(() => store.add({ id: 'x', name: 'X', platform: 'x', credentials: { accessToken: 'a', expiresAt: 'soon' } })).toThrow('Unix seconds');
    store.add({ id: 'manual', name: 'Manual', platform: 'x', credentials: { accessToken: 'pasted' } });
    expect(store.credentials('manual')).toEqual({ accessToken: 'pasted' });
});
