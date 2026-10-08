import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DEFAULT_SERVER_URL } from '../constants';
import { CliCredentialStore, OsCredentialStore } from './credential-store';

export interface DotShareConfig {
    serverUrl: string;
    credentials: {
        telegram?: { botToken: string; chatId: string };
        linkedin?: { accessToken: string };
    };
    defaultPlatforms: ('telegram' | 'linkedin')[];
}

export class ConfigManager {
    private configPath: string;
    private config: DotShareConfig | null = null;

    constructor(
        configDir = path.join(os.homedir(), '.dotshare'),
        private secretStore: CliCredentialStore = new OsCredentialStore(),
    ) {
        fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
        this.configPath = path.join(configDir, 'config.json');
    }

    private loadConfig(): DotShareConfig {
        if (this.config) return this.config;
        const defaults: DotShareConfig = { serverUrl: DEFAULT_SERVER_URL, credentials: {}, defaultPlatforms: [] };
        let stored: Partial<DotShareConfig> = {};
        if (fs.existsSync(this.configPath)) {
            try {
                stored = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            } catch {
                throw new Error('Cannot read CLI configuration. Repair config.json before retrying.');
            }
        }

        // Transfer old credentials first; keep the file intact on keyring failure.
        for (const platform of ['telegram', 'linkedin'] as const) {
            const legacy = stored.credentials?.[platform];
            if (legacy && !this.secretStore.get(platform)) {
                this.secretStore.set(platform, JSON.stringify(legacy));
            }
        }
        this.config = {
            serverUrl: stored.serverUrl || defaults.serverUrl,
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
        const temporary = `${this.configPath}.${process.pid}.tmp`;
        try {
            fs.writeFileSync(temporary, JSON.stringify(metadata, null, 2), { mode: 0o600 });
            fs.renameSync(temporary, this.configPath);
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
