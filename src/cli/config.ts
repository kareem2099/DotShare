import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DEFAULT_SERVER_URL } from '../constants';
import { Logger } from '../utils/Logger';

export interface DotShareConfig {
    serverUrl: string;
    credentials: {
        telegram?: {
            botToken: string;
            chatId: string;
        };
        linkedin?: {
            accessToken: string;
        };
        reddit?: {
            accessToken: string;
            refreshToken?: string;
        };
    };
    defaultPlatforms: ('telegram' | 'linkedin' | 'reddit')[];
}

export class ConfigManager {
    private configPath: string;
    private config: DotShareConfig | null = null;

    constructor() {
        const homeDir = os.homedir();
        const configDir = path.join(homeDir, '.dotshare');
        this.configPath = path.join(configDir, 'config.json');

        // Ensure config directory exists
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
    }

    private loadConfig(): DotShareConfig {
        if (this.config) return this.config;

        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                this.config = JSON.parse(data);
            } else {
                // Create default config
                this.config = {
                    serverUrl: DEFAULT_SERVER_URL,
                    credentials: {},
                    defaultPlatforms: []
                };
                this.saveConfig();
            }
        } catch (error) {
            Logger.error('Error loading config:', error);
            // Return default config on error
            this.config = {
                serverUrl: DEFAULT_SERVER_URL,
                credentials: {},
                defaultPlatforms: []
            };
        }

        // Ensure we always return a valid config
        return this.config || {
            serverUrl: DEFAULT_SERVER_URL,
            credentials: {},
            defaultPlatforms: []
        };
    }

    private saveConfig(): void {
        if (!this.config) return;

        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            Logger.error('Error saving config:', error);
        }
    }

    public getConfig(): DotShareConfig {
        return this.loadConfig();
    }

    public setServerUrl(url: string): void {
        this.loadConfig();
        if (this.config) {
            this.config.serverUrl = url;
            this.saveConfig();
        }
    }

    public setTelegramCredentials(botToken: string, chatId: string): void {
        this.loadConfig();
        if (this.config) {
            this.config.credentials.telegram = { botToken, chatId };
            this.saveConfig();
        }
    }

    public setLinkedInToken(accessToken: string): void {
        this.loadConfig();
        if (this.config) {
            this.config.credentials.linkedin = { accessToken };
            this.saveConfig();
        }
    }

    public setRedditCredentials(accessToken: string, refreshToken?: string): void {
        this.loadConfig();
        if (this.config) {
            this.config.credentials.reddit = { accessToken, refreshToken };
            this.saveConfig();
        }
    }

    public setDefaultPlatforms(platforms: ('telegram' | 'linkedin' | 'reddit')[]): void {
        this.loadConfig();
        if (this.config) {
            this.config.defaultPlatforms = platforms;
            this.saveConfig();
        }
    }

    public getConfiguredPlatforms(): ('telegram' | 'linkedin' | 'reddit')[] {
        const config = this.loadConfig();
        const platforms: ('telegram' | 'linkedin' | 'reddit')[] = [];

        if (config.credentials.telegram?.botToken && config.credentials.telegram?.chatId) {
            platforms.push('telegram');
        }
        if (config.credentials.linkedin?.accessToken) {
            platforms.push('linkedin');
        }
        if (config.credentials.reddit?.accessToken) {
            platforms.push('reddit');
        }

        return platforms;
    }

    public isInitialized(): boolean {
        const config = this.loadConfig();
        return !!(config.serverUrl && Object.keys(config.credentials).length > 0);
    }
}
