import * as http from 'http';
import { spawn } from 'child_process';
import { createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, randomUUID, KeyObject } from 'crypto';
import { z } from 'zod';
import { Account, AccountStore } from './accounts';
import { accountIdSchema } from './schema';
import { connectBaseUrl } from './token-refresh';
import { rememberSecret } from '../security/redaction';

/**
 * `dotshare-agent accounts connect <id> --platform linkedin|x`
 *
 * Signs in through the browser instead of asking for a pasted token. The CLI
 * listens on 127.0.0.1 and sends dotsuite.dev a fresh X25519 public key and a
 * nonce. The tokens come back to that port encrypted to the key, so only this
 * process can read them, and the nonce inside proves the result belongs to this
 * sign-in rather than one another site started.
 */

export const connectPlatformSchema = z.enum(['linkedin', 'x']);
export type BrowserPlatform = z.infer<typeof connectPlatformSchema>;

const INFO = Buffer.from('dotshare-connect-v1');
const tokenSchema = z.object({
    nonce: z.string(),
    platform: connectPlatformSchema,
    token: z.object({
        access_token: z.string().min(1).max(8192),
        refresh_token: z.string().min(1).max(8192).optional(),
        expires_at: z.number().int().positive(),
    }).loose().optional(),
    // X connected on DotSuite: no token is sent; posts go through DotSuite.
    via: z.literal('dotsuite').optional(),
}).refine(result => Boolean(result.token) !== Boolean(result.via));
type SignInResult = z.infer<typeof tokenSchema>;

export interface ConnectOptions {
    id: string;
    platform: string;
    name?: string;
    /** Open the browser automatically (default true). */
    open?: boolean;
    timeoutMs?: number;
    /** Where to tell the user to go; printed even when the browser opens. */
    announce?: (url: string) => void;
    /** Replaceable in tests. */
    openBrowser?: (url: string) => void;
}

export interface ConnectResult { account: Account; expiresAt?: string; refreshable: boolean; via?: 'dotsuite'; }

/** Opens the system browser without a shell, so the URL can't be reinterpreted. */
export function openBrowser(url: string): void {
    const [command, args] = process.platform === 'darwin' ? ['open', [url]]
        : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
            : ['xdg-open', [url]];
    try {
        const child = spawn(command, args, { stdio: 'ignore', detached: true });
        child.on('error', () => { /* The printed link still works. */ });
        child.unref();
    } catch { /* The printed link still works. */ }
}

/** Decrypts the loopback payload sent by dotsuite.dev (ECDH + HKDF-SHA256 + AES-256-GCM). */
export function openPayload(payload: string, privateKey: KeyObject, ownKey: Buffer): unknown {
    const bytes = Buffer.from(payload, 'base64url');
    if (bytes.length < 32 + 12 + 16 + 1) throw new Error('The sign-in result was incomplete. Run the command again.');
    const peerKey = bytes.subarray(0, 32), iv = bytes.subarray(32, 44), tag = bytes.subarray(44, 60), body = bytes.subarray(60);
    const peer = createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: peerKey.toString('base64url') }, format: 'jwk' });
    const shared = diffieHellman({ privateKey, publicKey: peer });
    const key = Buffer.from(hkdfSync('sha256', shared, Buffer.concat([peerKey, ownKey]), INFO, 32));
    try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAAD(INFO); decipher.setAuthTag(tag);
        return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'));
    } catch { throw new Error('The sign-in result could not be verified. Run the command again.'); }
}

const page = (title: string, message: string, ok: boolean): string => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${title}</title>
<style>:root{color-scheme:dark light}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;padding:16px}main{max-width:420px;text-align:center}.i{width:48px;height:48px;margin:0 auto 16px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:24px;background:${ok ? '#22c55e' : '#ef4444'}}p{opacity:.75}</style></head>
<body><main><div class="i">${ok ? '✓' : '!'}</div><h1>${title}</h1><p>${message}</p></main></body></html>`;

export async function connectAccount(store: AccountStore, options: ConnectOptions): Promise<ConnectResult> {
    const id = accountIdSchema.parse(options.id);
    const platform = connectPlatformSchema.parse(options.platform);
    const existing = store.list().find(account => account.id === id);
    if (existing && existing.platform !== platform) throw new Error('An existing account ID cannot change platform. Use a new ID.');
    const name = options.name?.trim() || existing?.name || id;

    const keys = generateKeyPairSync('x25519');
    const ownKey = Buffer.from(keys.publicKey.export({ format: 'jwk' }).x!, 'base64url');
    const nonce = randomBytes(24).toString('base64url');
    const base = connectBaseUrl();

    const signIn = await new Promise<SignInResult>((resolve, reject) => {
        let settled = false;
        const server = http.createServer((req, res) => {
            const url = new URL(req.url || '/', 'http://127.0.0.1');
            if (req.method !== 'GET' || url.pathname !== '/callback' || settled) { res.writeHead(404).end(); return; }
            const reply = (status: number, title: string, message: string, ok: boolean): void => {
                res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', Connection: 'close' });
                res.end(page(title, message, ok));
            };
            try {
                const error = url.searchParams.get('error');
                if (error !== null) {
                    // Only the sign-in this command started can stop it.
                    if (url.searchParams.get('nonce') !== nonce) { reply(400, 'Unknown sign-in', 'This result is not for the sign-in running in your terminal.', false); return; }
                    reply(200, 'Not connected', 'The sign-in did not finish. Check your terminal.', false);
                    finish(new Error(error.replace(/[^\x20-\x7e]/g, ' ').slice(0, 200) || 'The sign-in did not finish.'));
                    return;
                }
                const result = tokenSchema.parse(openPayload(url.searchParams.get('payload') || '', keys.privateKey, ownKey));
                if (result.nonce !== nonce || result.platform !== platform) throw new Error('Foreign sign-in result.');
                reply(200, 'Connected', 'DotShare received your sign-in. You can close this tab and return to your terminal.', true);
                finish(undefined, result);
            } catch {
                // Anything that isn't this sign-in's result is ignored; the genuine one (or the timeout) still ends the wait.
                reply(400, 'Unknown sign-in', 'This result is not for the sign-in running in your terminal.', false);
            }
        });
        const timer = setTimeout(() => finish(new Error('Timed out waiting for the browser sign-in. Run the command again.')), options.timeoutMs ?? 5 * 60 * 1000);
        function finish(error?: Error, value?: SignInResult): void {
            if (settled) return;
            settled = true; clearTimeout(timer);
            // Drop the browser's keep-alive connection too, so the CLI exits right away.
            server.close(); server.closeAllConnections();
            if (error) reject(error); else resolve(value!);
        }
        server.on('error', () => finish(new Error('Could not listen on 127.0.0.1 for the sign-in result.')));
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as { port: number };
            const url = `${base}/${platform}?${new URLSearchParams({ target: 'cli', port: String(port), key: ownKey.toString('base64url'), nonce })}`;
            options.announce?.(url);
            if (options.open !== false) (options.openBrowser || openBrowser)(url);
        });
    });

    if (signIn.via === 'dotsuite') {
        const account = store.add({ id, name, platform, credentials: { via: 'dotsuite' } });
        return { account, refreshable: false, via: 'dotsuite' };
    }
    const token = signIn.token!;
    rememberSecret(token.access_token);
    if (token.refresh_token) rememberSecret(token.refresh_token);
    const credentials: Record<string, string> = {
        accessToken: token.access_token,
        expiresAt: String(token.expires_at),
        connectionId: randomUUID(),
        ...(platform === 'x' && token.refresh_token && { refreshToken: token.refresh_token }),
    };
    const account = store.add({ id, name, platform, credentials });
    return { account, expiresAt: new Date(token.expires_at * 1000).toISOString(), refreshable: Boolean(credentials.refreshToken) };
}
