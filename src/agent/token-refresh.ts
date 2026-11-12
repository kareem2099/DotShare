import axios from 'axios';
import { DOTSUITE_CONNECT_URL } from '../constants';
import { rememberSecret } from '../security/redaction';

export interface RefreshedToken { accessToken: string; refreshToken?: string; expiresAt: number; }
export type XRefresher = (refreshToken: string) => Promise<RefreshedToken>;

/** HTTPS, or plain HTTP only on this machine for local testing. */
export function connectBaseUrl(value = process.env.DOTSHARE_CONNECT_URL || DOTSUITE_CONNECT_URL): string {
    const url = new URL(value);
    const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash) {
        throw new Error('DOTSHARE_CONNECT_URL must be an HTTPS URL without credentials or query parameters.');
    }
    return url.href.replace(/\/+$/, '');
}

/** X access tokens last two hours; the sign-in server swaps the refresh token for a new pair. */
export const refreshXToken: XRefresher = async refreshToken => {
    let data: Record<string, unknown>;
    try {
        ({ data } = await axios.post(`${connectBaseUrl()}/refresh/x`, { refreshToken }, { timeout: 15000, maxRedirects: 0 }));
    } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        throw new Error(status === 401
            ? 'X sign-in expired or was revoked. Reconnect: dotshare-agent accounts connect <id> --platform x'
            : 'Could not refresh the X access token. Check your connection and try again.');
    }
    if (typeof data.access_token !== 'string' || !data.access_token || typeof data.expires_at !== 'number') {
        throw new Error('The sign-in server returned an invalid X token. Reconnect the account.');
    }
    rememberSecret(data.access_token);
    if (typeof data.refresh_token === 'string') rememberSecret(data.refresh_token);
    return {
        accessToken: data.access_token,
        ...(typeof data.refresh_token === 'string' && data.refresh_token && { refreshToken: data.refresh_token }),
        expiresAt: Math.floor(data.expires_at),
    };
};
