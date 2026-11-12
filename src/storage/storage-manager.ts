import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

import { PostData, HistoricalPost, ShareRecord, AnalyticsSummary, SavedApiConfiguration } from '../types';
import { Logger } from '../utils/Logger';
import { ALL_SECRET_KEYS, AI_PROVIDERS, PLATFORM_SECRET_KEYS, isPlatform } from '../security/credentials';
import { DotShareAuth } from '../services/DotShareAuth';

export class StorageManager {
    private _context: vscode.ExtensionContext;


    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this.initializeStorage();
    }

    private initializeStorage() {
        // Resolve storage directory with fallbacks, then ensure it exists
        const resolveStoragePath = (): string => {
            const storageUri = this._context.globalStorageUri;
            if (storageUri) { return storageUri.fsPath; }
            return path.join(this._context.extensionPath, 'storage');
        };

        const ensureDir = (dirPath: string): boolean => {
            try {
                if (!fs.existsSync(dirPath)) { fs.mkdirSync(dirPath, { recursive: true }); }
                return true;
            } catch {
                return false;
            }
        };

        const primary = resolveStoragePath();
        if (!ensureDir(primary)) {
            Logger.warn('[StorageManager] Could not create storage directory, using temp');
            const temp = path.join(os.tmpdir(), 'dotshare-scheduled');
            if (!ensureDir(temp)) {
                Logger.error('[StorageManager] Even temp directory creation failed, falling back to os.tmpdir()');
                ensureDir(os.tmpdir());
            }
        }
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

    public recordShare(postId: string, platform: 'linkedin' | 'telegram' | 'x' | 'discord' | 'bluesky' | 'mastodon' | 'devto', success: boolean, errorMessage?: string, postIdOnPlatform?: string): void {
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

        discordWebhookUrl: string;

        blueskyIdentifier: string;
        blueskyPassword: string;

        mastodonInstance: string;
        mastodonToken: string;
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
                Logger.warn('[StorageManager] Failed to retrieve API key from secrets:', error);
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

        const discordConfig = await loadPlatformConfig('discord') as { discordWebhook: string } | null;

        const blueskyConfig = await loadPlatformConfig('bluesky') as { blueskyIdentifier: string; blueskyPassword: string } | null;

        const mastodonConfig = await loadPlatformConfig('mastodon') as { mastodonInstance: string; mastodonToken: string } | null;

        // Extract values from configurations, with fallbacks to individual secrets
        const linkedinToken = linkedinConfig?.linkedinToken || await this._context.secrets.get('linkedinToken') || '';
        const telegramBot = telegramConfig?.telegramBot || await this._context.secrets.get('telegramBot') || '';
        const telegramChat = telegramConfig?.telegramChat || await this._context.secrets.get('telegramChat') || '';

        const discordWebhookUrl = discordConfig?.discordWebhook || await this._context.secrets.get('discordWebhook') || '';

        const blueskyIdentifier = blueskyConfig?.blueskyIdentifier || await this._context.secrets.get('blueskyIdentifier') || '';
        const blueskyPassword = blueskyConfig?.blueskyPassword || await this._context.secrets.get('blueskyPassword') || '';

        const mastodonInstance = mastodonConfig?.mastodonInstance || await this._context.secrets.get('mastodonInstance') || '';
        const mastodonToken = mastodonConfig?.mastodonToken || await this._context.secrets.get('mastodonToken') || '';

        // Get X/Twitter credentials (from saved config or individual secrets)
        let xAccessToken: string;
        let xAccessSecret: string;
        if (xConfig) {
            xAccessToken = xConfig.xAccessToken;
            xAccessSecret = xConfig.xAccessSecret;
        } else {
            xAccessToken = await this._context.secrets.get('xAccessToken') || '';
            xAccessSecret = await this._context.secrets.get('xAccessSecret') || '';
        }

        return {
            selectedModel: savedModel,
            apiKey,
            linkedinToken,
            telegramBot,
            telegramChat,
            xAccessToken,
            xAccessSecret,

            discordWebhookUrl,

            blueskyIdentifier,
            blueskyPassword,

            mastodonInstance,
            mastodonToken,

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

        let discordShares = 0;

        let blueskyShares = 0;
        let mastodonShares = 0;
        let devtoShares = 0;


        for (const post of history) {
            for (const share of post.shares) {
                switch (share.platform) {
                    case 'linkedin': linkedinShares++; break;
                    case 'telegram': telegramShares++; break;
                    case 'x': xShares++; break;

                    case 'discord': discordShares++; break;

                    case 'bluesky': blueskyShares++; break;
                    case 'mastodon': mastodonShares++; break;
                    case 'devto': devtoShares++; break;

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

            discordShares,

            blueskyShares,
            mastodonShares,
            devtoShares,

            successRate
        };
    }

    // Saved APIs methods
    public async loadSavedApis(platform: string): Promise<SavedApiConfiguration[]> {
        try {
            const savedApisKey = `savedApis_${platform}`;
            let dataString = await this._context.secrets.get(savedApisKey);

            // Remove legacy plaintext copies even when a newer secure copy exists.
            const legacy = this._context.globalState.get<SavedApiConfiguration[]>(savedApisKey, []);
            if (legacy.length) {
                if (!dataString) {
                    dataString = JSON.stringify(legacy);
                    await this._context.secrets.store(savedApisKey, dataString);
                }
                await this._context.globalState.update(savedApisKey, undefined);
            }
            if (!dataString) return [];

            return JSON.parse(dataString);
        } catch (error) {
            Logger.error('[StorageManager] Error loading saved APIs:', error);
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
            if (!isPlatform(apiConfig.platform)) throw new Error('Unknown platform');
            const values = apiConfig.credentials as unknown as Record<string, string>;
            const credentials: Record<string, string> = {};
            for (const key of PLATFORM_SECRET_KEYS[apiConfig.platform]) {
                if (typeof values[key] !== 'string' || !values[key].trim()) throw new Error('Credentials are incomplete');
                credentials[key] = values[key].trim();
            }
            apiConfig = {
                id: apiConfig.id, name: apiConfig.name, platform: apiConfig.platform,
                created: apiConfig.created, lastUsed: apiConfig.lastUsed, isDefault: apiConfig.isDefault,
                credentials: credentials as unknown as SavedApiConfiguration['credentials'],
            };
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
            Logger.error('[StorageManager] Error saving API configuration:', error);
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
            Logger.error('[StorageManager] Error loading API configuration:', error);
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
            Logger.error('[StorageManager] Error deleting API configuration:', error);
            throw error;
        }
    }

    public async clearAllCredentials(): Promise<void> {
        try {
            Logger.info('[StorageManager] 🗑️ Clearing all credentials and saved APIs from secure storage...');
            
            // 1. Clear individual platform secrets and model API keys
            for (const key of ALL_SECRET_KEYS) {
                await this._context.secrets.delete(key);
            }

            // 2. Clear all saved API configurations lists (both from secrets and globalState)
            const platforms = Object.keys(PLATFORM_SECRET_KEYS);
            for (const platform of platforms) {
                const key = `savedApis_${platform}`;
                await this._context.secrets.delete(key);
                await this._context.globalState.update(key, undefined);
            }
            
            // Optional: Unset the selected model so they are completely "logged out"
            await this._context.globalState.update('selectedModel', undefined);
            for (const provider of AI_PROVIDERS) {
                await this._context.globalState.update(`selected_${provider}_model`, undefined);
            }
            for (const key of ['dotshare.xVia', 'last_selected_ai_provider', 'x_should_refresh_soon', 'linkedin_should_refresh_soon', 'dotshare.cloudCredentialsConsentGiven', 'dotshare.cloudMastodonConsentGiven']) {
                await this._context.globalState.update(key, undefined);
            }
            await DotShareAuth.logout(this._context);
            
            Logger.info('[StorageManager] ✅ All credentials cleared successfully.');
        } catch (error) {
            Logger.error('[StorageManager] Failed to clear all credentials:', error);
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
                'discordWebhook': 'discord',

                'blueskyIdentifier': 'bluesky',
                'blueskyPassword': 'bluesky',
                'mastodonInstance': 'mastodon',
                'mastodonToken': 'mastodon'
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
        // Migrate every platform through the same path, including Dev.to.
        for (const platform of Object.keys(PLATFORM_SECRET_KEYS)) await this.loadSavedApis(platform);
        const legacyDiscord = await this._context.secrets.get('discordWebhookUrl');
        if (legacyDiscord) {
            if (!await this._context.secrets.get('discordWebhook')) {
                await this._context.secrets.store('discordWebhook', legacyDiscord);
            }
            await this._context.secrets.delete('discordWebhookUrl');
        }
        const model = this._context.globalState.get<{ provider: string; model: string; apiKey?: string }>('selectedModel');
        if (model?.apiKey) {
            if (AI_PROVIDERS.includes(model.provider as typeof AI_PROVIDERS[number])) {
                const key = `${model.provider}ApiKey`;
                if (!await this._context.secrets.get(key)) await this._context.secrets.store(key, model.apiKey);
            }
            await this._context.globalState.update('selectedModel', { provider: model.provider, model: model.model });
        }
    }

    // Helper methods
    private generatePostId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
