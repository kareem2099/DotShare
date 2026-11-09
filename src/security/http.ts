import axios from 'axios';
import { rememberSecret } from './redaction';

let installed = false;
/**
 * API credentials must never be replayed to a redirect destination. Disabled TLS
 * verification is refused per request, not here, so the extension still activates.
 */
export function hardenHttp(): void {
    axios.defaults.maxRedirects = 0;
    axios.defaults.timeout = 30000;
    if (installed) return;
    installed = true;
    axios.interceptors.request.use(config => {
        if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || config.httpsAgent?.options?.rejectUnauthorized === false) throw new Error('TLS certificate verification must remain enabled. Unset NODE_TLS_REJECT_UNAUTHORIZED=0 to send credentials.');
        config.maxRedirects = 0; if (!config.timeout) config.timeout = 30000; return config;
    });
}
export function secureFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): ReturnType<typeof fetch> {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('TLS certificate verification must remain enabled.');
    return fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(30000), redirect: 'error' });
}
export function discordWebhookUrl(value: string): string {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(url.pathname) || url.username || url.password || url.search || url.hash) throw new Error();
        rememberSecret(value); return url.href;
    } catch { throw new Error('Use a canonical HTTPS discord.com API webhook without credentials or query parameters.'); }
}
export function linkedinUploadUrl(value: unknown): string {
    try {
        if (typeof value !== 'string') throw new Error();
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || (url.hostname !== 'linkedin.com' && !url.hostname.endsWith('.linkedin.com'))) throw new Error();
        return url.href;
    } catch { throw new Error('LinkedIn returned an untrusted upload destination. Credentials were not sent.'); }
}
