import axios from 'axios';
import { AccountStore, Account } from './accounts';
import { redactSensitiveText } from '../security/redaction';

const cleanIdentity = (identity: string): string => [...redactSensitiveText(identity)].map(char => {
    const code = char.codePointAt(0)!;
    return code < 32 || (code >= 127 && code <= 159) ? ' ' : char;
}).join('').trim();

export interface AccountCheck {
    id: string; platform: string; status: 'pass' | 'warn' | 'fail'; identity?: string; message: string; fix?: string;
}
export type CheckAccount = (store: AccountStore, account: Account) => Promise<AccountCheck>;

/** Identity checks only: no posts, uploads, scheduling, credential sync or refresh. */
export const checkAccount: CheckAccount = async (store, account) => {
    const base = { id: account.id, platform: account.platform };
    const fix = `Reconnect in your terminal: dotshare-agent accounts add ${account.id} --platform ${account.platform}`;
    try {
        const credentials = store.credentials(account.id);
        const options = { timeout: 10000, maxRedirects: 0 };
        const bearer = { ...options, headers: { Authorization: `Bearer ${credentials.accessToken}` } };
        let identity: unknown;
        switch (account.platform) {
            case 'mastodon': {
                const { data } = await axios.get(`${credentials.instance}/api/v1/accounts/verify_credentials`, bearer);
                identity = data.acct; break;
            }
            case 'x': {
                const { data } = await axios.get('https://api.x.com/2/users/me', bearer);
                identity = data.data?.username; break;
            }
            case 'linkedin': {
                const { data } = await axios.get('https://api.linkedin.com/v2/userinfo', bearer);
                identity = data.name || data.sub; break;
            }
            case 'telegram': {
                const { data } = await axios.get(`https://api.telegram.org/bot${credentials.botToken}/getMe`, options);
                if (!data.ok) throw new Error('Telegram identity check failed.');
                identity = data.result?.username;
                const chat = await axios.get(`https://api.telegram.org/bot${credentials.botToken}/getChat`, { ...options, params: { chat_id: credentials.chatId } });
                if (!chat.data.ok) throw new Error('Telegram destination check failed.');
                break;
            }
            case 'discord': {
                const { data } = await axios.get(credentials.webhookUrl, options);
                identity = data.id && (data.name || `Webhook ${data.id}`); break;
            }
            case 'devto': {
                const { data } = await axios.get('https://dev.to/api/users/me', { ...options, headers: { 'api-key': credentials.apiKey } });
                identity = data.username; break;
            }
            case 'bluesky': {
                // Read-only handle lookup avoids creating/rotating a login session.
                // It cannot prove that an app password is still valid.
                const { data } = await axios.get('https://bsky.social/xrpc/com.atproto.identity.resolveHandle', { ...options, params: { handle: credentials.identifier } });
                if (typeof data.did !== 'string' || !data.did.startsWith('did:')) throw new Error('Bluesky handle could not be resolved.');
                return { ...base, status: 'warn', identity: cleanIdentity(data.did), message: 'Handle resolved and local credentials are readable. App-password validity was not tested; no session was created.' };
            }
        }
        if (typeof identity !== 'string' || !identity.trim() || identity.length > 256) throw new Error('Platform returned no usable identity.');
        return { ...base, status: 'pass', identity: cleanIdentity(identity), message: 'Account identity verified. Posting permissions were not exercised.' };
    } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        // Never return raw request URLs, response bodies, or library errors.
        if (status === 403 && account.platform === 'mastodon') return { ...base, status: 'warn', message: 'The token cannot read its own profile, so its identity was not verified. Posting with write:statuses and write:media may still work.', fix: 'Recreate the Mastodon application token with the profile scope (or read:accounts) in addition to write:statuses and write:media.' };
        if (status === 403) return { ...base, status: 'warn', message: 'The platform denied the identity lookup. Read permissions or API-plan access may be missing; posting may still work.', fix: 'Check the platform token scopes and API access plan.' };
        return { ...base, status: 'fail', message: status === 401 ? 'The platform rejected authentication. The credential may be invalid or expired.'
            : status === 429 ? 'The platform rate-limited this check. Wait before trying doctor again.'
                : 'Could not verify this account. Check the OS keyring, credentials, destination and network access.', fix };
    }
};
