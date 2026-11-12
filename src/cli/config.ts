import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DEFAULT_SERVER_URL, LEGACY_SERVER_HOST } from '../constants';
import { CliCredentialStore, OsCredentialStore } from './credential-store';
import { privateDirectory, privateRead, privateWriteJson } from '../security/private-files';

export interface DotShareConfig {
    serverUrl: string;
    credentials: {
        telegram?: { botToken: string; chatId: string };
        linkedin?: { accessToken: string };
    };
    defaultPlatforms: ('telegram' | 'linkedin')[];
}

/** The retired Vercel sign-in server is replaced by dotsuite.dev; custom URLs are kept. */
function migrateServerUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        return new URL(url).hostname === LEGACY_SERVER_HOST ? DEFAULT_SERVER_URL : url;
    } catch {
        return url;
    }
}

export class ConfigManager {
    private configPath: string;
    private config: DotShareConfig | null = null;

    constructor(
        configDir = process.env.DOTSHARE_HOME || path.join(os.homedir(), '.dotshare'),
        private secretStore: CliCredentialStore = new OsCredentialStore(),
    ) {
        privateDirectory(configDir);
        this.configPath = path.join(configDir, 'config.json');
    }

    private loadConfig(): DotShareConfig {
        if (this.config) return this.config;
        const defaults: DotShareConfig = { serverUrl: DEFAULT_SERVER_URL, credentials: {}, defaultPlatforms: [] };
        let stored: Partial<DotShareConfig> = {};
        if (fs.existsSync(this.configPath)) {
            try {
                stored = JSON.parse(privateRead(this.configPath, 1024 * 1024));
            } catch {
                throw new Error('Cannot read CLI configuration. Repair config.json before retrying.');
            }
        }

        // Transfer old credentials first; keep the file intact on keyring failure.
        for (const platform of ['telegram', 'linkedin'] as const) {
            const legacy = stored.credentials?.[platform];
            if (legacy) {
                const encoded = JSON.stringify(legacy); const existing = this.secretStore.get(platform);
                if (existing && existing !== encoded) throw new Error('Legacy credentials conflict with the OS keyring. Resolve them before removing plaintext data.');
                if (!existing) this.secretStore.set(platform, encoded);
                if (this.secretStore.get(platform) !== encoded) throw new Error('Secure credential migration could not be verified. Original configuration was kept.');
            }
        }
        this.config = {
            serverUrl: migrateServerUrl(stored.serverUrl) || defaults.serverUrl,
            defaultPlatforms: stored.defaultPlatforms || [],
            credentials: {},
        };
        try {
            this.saveConfig();
        } catch (error) {
            this.config = null;
            throw error;
        }
        return this.config;
    }

    private saveConfig(): void {
        if (!this.config) return;
        const metadata = { serverUrl: this.config.serverUrl, defaultPlatforms: this.config.defaultPlatforms };
        try {
            privateWriteJson(this.configPath, metadata);
        } catch {
            throw new Error('Could not save CLI configuration metadata.');
        }
    }

    public getConfig(): DotShareConfig {
        const config = this.loadConfig();
        const credentials: DotShareConfig['credentials'] = {};
        for (const platform of ['telegram', 'linkedin'] as const) {
            const value = this.secretStore.get(platform);
            if (value) credentials[platform] = JSON.parse(value);
        }
        return { ...config, credentials };
    }

    public setServerUrl(url: string): void {
        this.loadConfig().serverUrl = url;
        this.saveConfig();
    }

    public setTelegramCredentials(botToken: string, chatId: string): void {
        this.loadConfig();
        this.secretStore.set('telegram', JSON.stringify({ botToken, chatId }));
    }

    public setLinkedInToken(accessToken: string): void {
        this.loadConfig();
        this.secretStore.set('linkedin', JSON.stringify({ accessToken }));
    }

    public setDefaultPlatforms(platforms: ('telegram' | 'linkedin')[]): void {
        this.loadConfig().defaultPlatforms = platforms;
        this.saveConfig();
    }

    public getConfiguredPlatforms(): ('telegram' | 'linkedin')[] {
        const config = this.getConfig();
        const platforms: ('telegram' | 'linkedin')[] = [];
        if (config.credentials.telegram?.botToken && config.credentials.telegram.chatId) platforms.push('telegram');
        if (config.credentials.linkedin?.accessToken) platforms.push('linkedin');
        return platforms;
    }

    public isInitialized(): boolean {
        const config = this.getConfig();
        return !!(config.serverUrl && Object.keys(config.credentials).length);
    }
}
