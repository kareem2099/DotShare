import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CliCredentialStore, OsCredentialStore } from '../cli/credential-store';
import { rememberSecret } from '../security/redaction';
import { LocalVault } from '../security/vault';
import { privateDirectory, privateRead, privateWriteJson } from '../security/private-files';
import { normalizeMastodonInstance } from '../platforms/mastodon';
import { AccountInput, accountInputSchema, accountIdSchema, CREDENTIAL_FIELDS, OPTIONAL_CREDENTIAL_FIELDS, Platform } from './schema';
import { refreshXToken, XRefresher } from './token-refresh';

export interface Account { id: string; name: string; platform: Platform; }
export const defaultAgentHome = (): string => process.env.DOTSHARE_HOME || path.join(os.homedir(), '.dotshare');

export function privateWrite(file: string, value: unknown): void {
    privateWriteJson(file, value);
}

export class AccountStore {
    readonly home: string;
    readonly files: LocalVault;
    /** Swaps an X refresh token through dotsuite.dev; replaceable in tests. */
    xRefresher: XRefresher = refreshXToken;
    constructor(home = defaultAgentHome(), private readonly secrets: CliCredentialStore = new OsCredentialStore()) {
        this.home = path.resolve(home); this.files = new LocalVault(this.home, secrets);
    }

    list(): Account[] {
        const file = path.join(this.home, 'accounts.json');
        if (!fs.existsSync(file)) return [];
        privateDirectory(this.home);
        // Validate stored data rather than trusting manually edited configuration.
        const metadata = accountInputSchema.omit({ credentials: true }).array().parse(JSON.parse(privateRead(file, 1024 * 1024)));
        if (new Set(metadata.map(a => a.id)).size !== metadata.length) throw new Error('Duplicate account IDs in accounts.json.');
        return metadata;
    }

    get(id: string): Account {
        const account = this.list().find(a => a.id === accountIdSchema.parse(id));
        if (!account) throw new Error(`Account "${id}" is not configured. Use dotshare accounts add first.`);
        return account;
    }

    credentials(id: string): Record<string, string> {
        const account = this.get(id);
        const value = this.secrets.get(`agent:${id}`);
        if (!value) throw new Error(`Credentials unavailable for account "${id}". Reconnect it with dotshare accounts add.`);
        rememberSecret(value);
        let credentials: unknown;
        try { credentials = JSON.parse(value) as unknown; } catch { throw new Error('Stored credential data is invalid. Reconnect the account; secret contents were not displayed.'); }
        const input = accountInputSchema.parse({ ...account, credentials });
        this.validate(input);
        rememberSecret(JSON.stringify(input.credentials));
        return input.credentials;
    }

    private validate(input: AccountInput): void {
        // X through DotSuite: the token stays on DotSuite, which meters each post.
        if (input.platform === 'x' && input.credentials.via !== undefined) {
            if (input.credentials.via !== 'dotsuite' || Object.keys(input.credentials).length !== 1) throw new Error('An X account through DotSuite stores only via: dotsuite.');
            return;
        }
        const fields = CREDENTIAL_FIELDS[input.platform];
        const allowed = [...fields, ...(OPTIONAL_CREDENTIAL_FIELDS[input.platform] || [])];
        if (fields.some(key => !input.credentials[key]?.trim())) throw new Error(`Required credentials: ${fields.join(', ')}.`);
        if (Object.keys(input.credentials).some(key => !allowed.includes(key))) throw new Error(`Allowed credentials: ${allowed.join(', ')}.`);
        if (input.credentials.expiresAt !== undefined && !/^[0-9]{1,12}$/.test(input.credentials.expiresAt)) throw new Error('expiresAt must be Unix seconds.');
        if (input.platform === 'mastodon') input.credentials.instance = normalizeMastodonInstance(input.credentials.instance);
        if (input.platform === 'telegram' && !/^[0-9]+:[A-Za-z0-9_-]+$/.test(input.credentials.botToken)) throw new Error('Invalid Telegram bot token format.');
        if (input.platform === 'discord') {
            const url = new URL(input.credentials.webhookUrl);
            if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(url.pathname) || url.username || url.password || url.search || url.hash) {
                throw new Error('Use an HTTPS discord.com API webhook URL without query parameters.');
            }
        }
    }

    add(value: unknown): Account {
        const input = accountInputSchema.parse(value);
        rememberSecret(JSON.stringify(input.credentials));
        this.validate(input);
        const accounts = this.list();
        const previous = accounts.find(a => a.id === input.id);
        if (previous && previous.platform !== input.platform) throw new Error('An existing account ID cannot change platform. Use a new ID.');
        const { credentials, ...metadata } = input;
        privateDirectory(this.home);
        // Keyring must succeed before any account is advertised as available.
        this.secrets.set(`agent:${input.id}`, JSON.stringify(credentials));
        if (this.secrets.get(`agent:${input.id}`) !== JSON.stringify(credentials)) throw new Error('Credential storage could not be verified. The account was not advertised.');
        privateWrite(path.join(this.home, 'accounts.json'), [...accounts.filter(a => a.id !== input.id), metadata]);
        return metadata;
    }

    /**
     * Credentials ready to use now. An X account connected in the browser gets a
     * new access token when the current one has under five minutes left. X rotates
     * refresh tokens, so the new pair is saved before it is used; if another
     * process refreshed first, its saved pair is used instead.
     */
    async freshCredentials(id: string, now = Date.now()): Promise<Record<string, string>> {
        const credentials = this.credentials(id);
        const account = this.get(id);
        const expiresAt = Number(credentials.expiresAt || 0) * 1000;
        if (account.platform !== 'x' || !credentials.refreshToken || !expiresAt || expiresAt - now > 5 * 60 * 1000) return credentials;
        let token;
        try { token = await this.xRefresher(credentials.refreshToken); }
        catch (error) {
            const stored = this.credentials(id);
            if (stored.refreshToken !== credentials.refreshToken) return stored;
            throw error;
        }
        const stored = this.credentials(id);
        if (stored.refreshToken !== credentials.refreshToken) return stored;
        const next: Record<string, string> = { ...credentials, accessToken: token.accessToken, expiresAt: String(token.expiresAt) };
        if (token.refreshToken) next.refreshToken = token.refreshToken;
        else delete next.refreshToken;
        this.add({ ...account, credentials: next });
        return next;
    }

    /** True when this X account posts through DotSuite (metered) rather than with a local token. */
    xViaDotSuite(id: string): boolean {
        return this.get(id).platform === 'x' && this.credentials(id).via === 'dotsuite';
    }

    remove(id: string): void {
        this.get(id);
        this.secrets.delete(`agent:${id}`);
        privateWrite(path.join(this.home, 'accounts.json'), this.list().filter(a => a.id !== id));
    }

    setCloudToken(token: string): void {
        if (!token.trim() || token.length > 4096) throw new Error('A DotSuite token is required.');
        rememberSecret(token);
        privateDirectory(this.home);
        this.secrets.set('agent:dotsuite', token.trim());
    }

    cloudToken(): string {
        const token = this.secrets.get('agent:dotsuite');
        if (!token) throw new Error('DotSuite is not connected. Use dotshare cloud login first.');
        rememberSecret(token);
        return token;
    }
}
