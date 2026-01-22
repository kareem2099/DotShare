import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { ScheduledPostsStorage } from './scheduled-posts';
import { PostData, HistoricalPost, ShareRecord, AnalyticsSummary, SavedApiConfiguration } from './types';
import { Logger } from './utils/Logger';

export class StorageManager {
    private _context: vscode.ExtensionContext;
    private _scheduledPostsStorage!: ScheduledPostsStorage;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this.initializeStorage();
    }

    private initializeStorage() {
        // Try to get global storage first
        const storageUri = this._context.globalStorageUri;
        let storagePath: string;

        if (storageUri) {
            storagePath = storageUri.fsPath;
        } else {
            // Fallback to extension storage directory
            storagePath = path.join(this._context.extensionPath, 'storage');
        }

        // Try to create the storage directory synchronously
        try {
            if (!fs.existsSync(storagePath)) {
                fs.mkdirSync(storagePath, { recursive: true });
            }
        } catch (error) {
            Logger.warn('Could not create storage directory, using temp:', error);
            // Final fallback to temp directory
            storagePath = path.join(os.tmpdir(), 'dotshare-scheduled');
            try {
                if (!fs.existsSync(storagePath)) {
                    fs.mkdirSync(storagePath, { recursive: true });
                }
            } catch (tempError) {
                Logger.error('Even temp directory creation failed:', tempError);
                // Last resort - use system temp
                storagePath = os.tmpdir();
            }
        }

        this._scheduledPostsStorage = new ScheduledPostsStorage(storagePath);
    }

    // Scheduled posts storage methods
    public get scheduledPostsStorage(): ScheduledPostsStorage {
        return this._scheduledPostsStorage;
    }

    // Post history methods
    public savePostToHistory(aiProvider: 'gemini' | 'openai' | 'xai', aiModel: string, postData: PostData): void {
        const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
        const historicalPost: HistoricalPost = {
            id: this.generatePostId(),
            timestamp: new Date().toISOString(),
            aiProvider,
            aiModel,
            postData,
            shares: []
        };

        // Keep only last 50 posts to prevent storage bloat
        history.unshift(historicalPost);
        if (history.length > 50) {
            history.splice(50);
        }

        this._context.globalState.update('postHistory', history);
        // Update lastPost for backward compatibility
        this._context.globalState.update('lastPost', postData);
    }

    public recordShare(postId: string, platform: 'linkedin' | 'telegram' | 'x' | 'facebook' | 'discord' | 'reddit' | 'bluesky', success: boolean, errorMessage?: string, postIdOnPlatform?: string): void {
        const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
        const postIndex = history.findIndex(post => post.id === postId);

        if (postIndex !== -1) {
            const shareRecord: ShareRecord = {
                platform,
                timestamp: new Date().toISOString(),
                success,
                errorMessage,
                postId: postIdOnPlatform
            };

            history[postIndex].shares.push(shareRecord);
            this._context.globalState.update('postHistory', history);
        }
    }

    public getPostHistory(): HistoricalPost[] {
        return this._context.globalState.get('postHistory', [] as HistoricalPost[]);
    }

    public getLastPost(): PostData {
        return this._context.globalState.get('lastPost') as PostData;
    }

    public updateLastPost(updatedPost: PostData): void {
        this._context.globalState.update('lastPost', updatedPost);
    }

    // Configuration methods
    public async loadConfiguration(): Promise<{
        selectedModel?: {
            provider: 'gemini' | 'openai' | 'xai';
            model: string;
        };
        apiKey: string;
        linkedinToken: string;
        telegramBot: string;
        telegramChat: string;
        xAccessToken: string;
        xAccessSecret: string;
        facebookToken: string;
        facebookPageToken: string;
        facebookPageId: string;
        discordWebhookUrl: string;
        redditAccessToken: string;
        redditRefreshToken: string;
        blueskyIdentifier: string;
        blueskyPassword: string;
        // Reddit configuration details
        redditClientId?: string;
        redditClientSecret?: string;
        redditUsername?: string;
        redditPassword?: string;
        redditApiName?: string;
    }> {
        const savedModel = this._context.globalState.get('selectedModel') as {
            provider: 'gemini' | 'openai' | 'xai';
            model: string;
        } | undefined;
        let apiKey = '';
        if (savedModel) {
            try {
                apiKey = await this._context.secrets.get(`${savedModel.provider}ApiKey`) || '';
            } catch (error) {
                Logger.warn('Failed to retrieve API key from secrets:', error);
            }
        }

        // Function to load configuration for a platform (check default saved config first, then fallback to individual secrets)
        const loadPlatformConfig = async (platform: string) => {
            const defaultConfig = await this.getDefaultApiConfiguration(platform);
            if (defaultConfig) {
                // Load from default saved configuration
                return defaultConfig.credentials;
            } else {
                // Fallback to individual secrets
                return null;
            }
        };

        // Load configurations for each platform
        const linkedinConfig = await loadPlatformConfig('linkedin') as { linkedinToken: string } | null;
        const telegramConfig = await loadPlatformConfig('telegram') as { telegramBot: string; telegramChat: string } | null;
        const xConfig = await loadPlatformConfig('x') as { xAccessToken: string; xAccessSecret: string } | null;
        const facebookConfig = await loadPlatformConfig('facebook') as { facebookToken: string; facebookPageToken?: string; facebookPageId?: string } | null;
        const discordConfig = await loadPlatformConfig('discord') as { discordWebhook: string } | null;
        const redditConfig = await loadPlatformConfig('reddit') as { redditAccessToken: string; redditRefreshToken: string } | null;
        const blueskyConfig = await loadPlatformConfig('bluesky') as { blueskyIdentifier: string; blueskyPassword: string } | null;

        // Extract values from configurations, with fallbacks to individual secrets
        const linkedinToken = linkedinConfig?.linkedinToken || await this._context.secrets.get('linkedinToken') || '';
        const telegramBot = telegramConfig?.telegramBot || await this._context.secrets.get('telegramBot') || '';
        const telegramChat = telegramConfig?.telegramChat || await this._context.secrets.get('telegramChat') || '';
        const facebookToken = facebookConfig?.facebookToken || await this._context.secrets.get('facebookToken') || '';
        const facebookPageToken = facebookConfig?.facebookPageToken || await this._context.secrets.get('facebookPageToken') || '';
        const facebookPageId = facebookConfig?.facebookPageId || await this._context.secrets.get('facebookPageId') || '';
        const discordWebhookUrl = discordConfig?.discordWebhook || await this._context.secrets.get('discordWebhookUrl') || '';
        const redditAccessToken = redditConfig?.redditAccessToken || await this._context.secrets.get('redditAccessToken') || '';
        const redditRefreshToken = redditConfig?.redditRefreshToken || await this._context.secrets.get('redditRefreshToken') || '';
        const blueskyIdentifier = blueskyConfig?.blueskyIdentifier || await this._context.secrets.get('blueskyIdentifier') || '';
        const blueskyPassword = blueskyConfig?.blueskyPassword || await this._context.secrets.get('blueskyPassword') || '';

        // Get X/Twitter credentials (from saved config or individual secrets)
        let xAccessToken = '';
        let xAccessSecret = '';
        if (xConfig) {
            xAccessToken = xConfig.xAccessToken;
            xAccessSecret = xConfig.xAccessSecret;
        } else {
            xAccessToken = await this._context.secrets.get('xAccessToken') || '';
            xAccessSecret = await this._context.secrets.get('xAccessSecret') || '';
        }

        // Get Reddit additional details (for token generation)
        const redditClientId = await this._context.secrets.get('redditClientId') || '';
        const redditClientSecret = await this._context.secrets.get('redditClientSecret') || '';
        const redditUsername = await this._context.secrets.get('redditUsername') || '';
        const redditPassword = await this._context.secrets.get('redditPassword') || '';
        const redditApiName = this._context.globalState.get('redditApiName', 'Reddit Account');

        return {
            selectedModel: savedModel,
            apiKey,
            linkedinToken,
            telegramBot,
            telegramChat,
            xAccessToken,
            xAccessSecret,
            facebookToken,
            facebookPageToken,
            facebookPageId,
            discordWebhookUrl,
            redditAccessToken,
            redditRefreshToken,
            blueskyIdentifier,
            blueskyPassword,
            redditClientId,
            redditClientSecret,
            redditUsername,
            redditPassword,
            redditApiName
        };
    }

    public saveModelSelection(model: { provider: 'gemini' | 'openai' | 'xai'; model: string; apiKey?: string }): void {
        // Store selected model without API key for security
        const modelForStorage = {
            provider: model.provider,
            model: model.model,
            apiKey: '' // Don't store API key in global state
        };
        this._context.globalState.update('selectedModel', modelForStorage);

        // Store API key securely if provided
        if (model.apiKey) {
            this._context.secrets.store(`${model.provider}ApiKey`, model.apiKey);
        }
    }

    // Analytics methods
    public calculateAnalytics(): AnalyticsSummary {
        const history = this.getPostHistory();

        const totalPosts = history.length;
        let successfulShares = 0;
        let failedShares = 0;
        let linkedinShares = 0;
        let telegramShares = 0;
        let xShares = 0;
        let facebookShares = 0;
        let discordShares = 0;
        let redditShares = 0;
        let blueskyShares = 0;

        for (const post of history) {
            for (const share of post.shares) {
                switch (share.platform) {
                    case 'linkedin': linkedinShares++; break;
                    case 'telegram': telegramShares++; break;
                    case 'x': xShares++; break;
                    case 'facebook': facebookShares++; break;
                    case 'discord': discordShares++; break;
                    case 'reddit': redditShares++; break;
                    case 'bluesky': blueskyShares++; break;
                }

                if (share.success) {
                    successfulShares++;
                } else {
                    failedShares++;
                }
            }
        }

        const totalShares = successfulShares + failedShares;
        const successRate = totalShares > 0 ? Math.round((successfulShares / totalShares) * 100) : 0;

        return {
            totalPosts,
            successfulShares,
            failedShares,
            linkedinShares,
            telegramShares,
            xShares,
            facebookShares,
            discordShares,
            redditShares,
            blueskyShares,
            successRate
        };
    }

    // Saved APIs methods
    public async loadSavedApis(platform: string): Promise<SavedApiConfiguration[]> {
        try {
            const savedApisKey = `savedApis_${platform}`;
            let dataString = await this._context.secrets.get(savedApisKey);

            // Migration: If no data in secrets, check globalState and migrate
            if (!dataString) {
                const migratedData = this._context.globalState.get(savedApisKey, [] as SavedApiConfiguration[]);
                if (migratedData && migratedData.length > 0) {
                    // Migrate to secrets
                    await this._context.secrets.store(savedApisKey, JSON.stringify(migratedData));
                    // Clear old data
                    this._context.globalState.update(savedApisKey, undefined);
                    dataString = JSON.stringify(migratedData);
                } else {
                    return [];
                }
            }

            return JSON.parse(dataString);
        } catch (error) {
            Logger.error('Error loading saved APIs:', error);
            return [];
        }
    }

    public async getDefaultApiConfiguration(platform: string): Promise<SavedApiConfiguration | null> {
        const savedApis = await this.loadSavedApis(platform);
        return savedApis.find(config => config.isDefault === true) || null;
    }

    public async setDefaultApiConfiguration(platform: string, apiId: string | null): Promise<void> {
        const savedApis = await this.loadSavedApis(platform);
        const savedApisKey = `savedApis_${platform}`;

        // First, unset all default flags
        savedApis.forEach(config => {
            config.isDefault = false;
        });

        // Then set the new default if provided
        if (apiId) {
            const configToSetDefault = savedApis.find(config => config.id === apiId);
            if (configToSetDefault) {
                configToSetDefault.isDefault = true;
                configToSetDefault.lastUsed = new Date().toISOString();
            }
        }

        await this._context.secrets.store(savedApisKey, JSON.stringify(savedApis));
    }

    public async saveApiConfiguration(apiConfig: SavedApiConfiguration): Promise<void> {
        try {
            const savedApisKey = `savedApis_${apiConfig.platform}`;
            const savedApis = await this.loadSavedApis(apiConfig.platform);

            // Ensure config has an ID
            if (!apiConfig.id) {
                apiConfig.id = `${apiConfig.platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }

            // Set created date if not set
            if (!apiConfig.created) {
                apiConfig.created = new Date().toISOString();
            }

            // Add or update the configuration
            const existingIndex = savedApis.findIndex((config: SavedApiConfiguration) => config.id === apiConfig.id);
            if (existingIndex >= 0) {
                savedApis[existingIndex] = apiConfig;
            } else {
                savedApis.push(apiConfig);
            }

            await this._context.secrets.store(savedApisKey, JSON.stringify(savedApis));
        } catch (error) {
            Logger.error('Error saving API configuration:', error);
            throw error;
        }
    }

    public async loadApiConfiguration(apiId: string): Promise<SavedApiConfiguration | null> {
        try {
            // Find the platform from the ID pattern (platform_timestamp_random)
            const platform = apiId.split('_')[0];
            const savedApis = await this.loadSavedApis(platform);
            return savedApis.find((config: SavedApiConfiguration) => config.id === apiId) || null;
        } catch (error) {
            Logger.error('Error loading API configuration:', error);
            return null;
        }
    }

    public async deleteApiConfiguration(apiId: string): Promise<void> {
        try {
            // Find the platform from the ID pattern
            const platform = apiId.split('_')[0];
            const savedApisKey = `savedApis_${platform}`;
            const savedApis = await this.loadSavedApis(platform);

            // Remove the configuration
            const updatedApis = savedApis.filter((config: SavedApiConfiguration) => config.id !== apiId);

            await this._context.secrets.store(savedApisKey, JSON.stringify(updatedApis));
        } catch (error) {
            Logger.error('Error deleting API configuration:', error);
            throw error;
        }
    }

    public async loadFromSecretsOrDefault(secretKey: string): Promise<string> {
        // First try to get from secrets directly
        let value = await this._context.secrets.get(secretKey) || '';

        // If secrets is empty, check for default saved API configuration
        if (!value) {
            // Map secret keys to platform
            const platformMappings: { [key: string]: string } = {
                'linkedinToken': 'linkedin',
                'telegramBot': 'telegram',
                'telegramChat': 'telegram',
                'xAccessToken': 'x',
                'xAccessSecret': 'x',
                'facebookToken': 'facebook',
                'facebookPageToken': 'facebook',
                'facebookPageId': 'facebook',
                'discordWebhook': 'discord',
                'redditAccessToken': 'reddit',
                'redditRefreshToken': 'reddit',
                'blueskyIdentifier': 'bluesky',
                'blueskyPassword': 'bluesky'
            };

            const platform = platformMappings[secretKey];
            if (platform) {
                const defaultConfig = await this.getDefaultApiConfiguration(platform);
                if (defaultConfig && typeof defaultConfig.credentials === 'object' && defaultConfig.credentials !== null && secretKey in defaultConfig.credentials) {
                    value = (defaultConfig.credentials as unknown as Record<string, string | undefined>)[secretKey] || '';
                    // Store the loaded value in secrets for UI access
                    await this._context.secrets.store(secretKey, value);
                }
            }
        }

        return value;
    }

    // Migration methods
    public async migrateLegacyData(): Promise<void> {
        const platforms = ['linkedin', 'telegram', 'x', 'facebook', 'discord', 'reddit', 'bluesky'];

        for (const platform of platforms) {
            const key = `savedApis_${platform}`;

            // Check if there's legacy data in globalState
            const legacyData = this._context.globalState.get(key);

            if (legacyData && Array.isArray(legacyData) && legacyData.length > 0) {
                // Check if the new secrets storage is empty (to avoid overwriting new data)
                const existingSecret = await this._context.secrets.get(key);

                if (!existingSecret) {
                    Logger.info(`📦 Migrating ${platform} data to secure storage...`);

                    // Migrate data to encrypted secrets
                    await this._context.secrets.store(key, JSON.stringify(legacyData));

                    // Clear old data
                    this._context.globalState.update(key, undefined);
                }
            }
        }
    }

    // Helper methods
    private generatePostId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
