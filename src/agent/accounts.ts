import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CliCredentialStore, OsCredentialStore } from '../cli/credential-store';
import { rememberSecret } from '../security/redaction';
import { LocalVault } from '../security/vault';
import { privateDirectory, privateRead, privateWriteJson } from '../security/private-files';
import { normalizeMastodonInstance } from '../platforms/mastodon';
import { AccountInput, accountInputSchema, accountIdSchema, CREDENTIAL_FIELDS, Platform } from './schema';

export interface Account { id: string; name: string; platform: Platform; }
export const defaultAgentHome = (): string => process.env.DOTSHARE_HOME || path.join(os.homedir(), '.dotshare');

export function privateWrite(file: string, value: unknown): void {
    privateWriteJson(file, value);
}

export class AccountStore {
    readonly home: string;
    readonly files: LocalVault;
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
        const fields = CREDENTIAL_FIELDS[input.platform];
        if (fields.some(key => !input.credentials[key]?.trim())) throw new Error(`Required credentials: ${fields.join(', ')}.`);
        if (Object.keys(input.credentials).some(key => !fields.includes(key))) throw new Error(`Allowed credentials: ${fields.join(', ')}.`);
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
