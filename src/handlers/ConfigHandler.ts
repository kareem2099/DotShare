import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SavedApiConfiguration } from '../types';
import { Logger } from '../utils/Logger';
import { redactSensitiveText } from '../security/redaction';
import { AI_PROVIDERS, PLATFORM_SECRET_KEYS, credentialStatus, isPlatform, publicApiConfiguration } from '../security/credentials';
import { normalizeMastodonInstance } from '../platforms/mastodon';

interface Message {
    command: string;
    [key: string]: unknown;
}

export class ConfigHandler {
    constructor(
        private view: vscode.WebviewView,
        private context: vscode.ExtensionContext
    ) { }

    public async handleMessage(message: Message): Promise<void> {
        const cmd = message.command;

        try {
            switch (cmd) {
                case 'saveModelSelection':
                    await this.handleSaveModelSelection(message);
                    break;

                case 'saveLinkedinToken':
                    await this.handleSaveLinkedinToken(message);
                    break;

                case 'saveTelegramCredentials':
                    await this.handleSaveTelegramCredentials(message);
                    break;



                case 'saveDiscordWebhook':
                    await this.handleSaveDiscordWebhook(message);
                    break;

                case 'saveXCredentials':
                    await this.handleSaveXCredentials(message);
                    break;


                case 'saveBlueSkyCredentials':
                    await this.handleSaveBlueSkyCredentials(message);
                    break;

                case 'saveMastodonCredentials':
                    await this.handleSaveMastodonCredentials(message);
                    break;

                case 'saveDevToCredentials':
                    await this.handleSaveDevToCredentials(message);
                    break;



                case 'loadConfiguration':
                    await this.handleLoadConfiguration();
                    break;

                case 'loadSavedApis':
                    await this.handleLoadSavedApis(message);
                    break;

                case 'clearAllCredentials':
                    await this.handleClearAllCredentials();
                    break;

                case 'saveApiSet':
                    await this.handleSaveApiSet(message);
                    break;

                case 'saveApiConfiguration':
                    await this.handleSaveApiConfiguration(message);
                    break;

                case 'deleteApiConfig':
                case 'deleteApiConfiguration':
                    await this.handleDeleteApiConfiguration(message);
                    break;

                case 'setDefaultApiConfiguration':
                    await this.handleSetDefaultApiConfiguration(message);
                    break;

                case 'loadApiConfig':
                case 'loadApiConfiguration':
                    await this.handleLoadApiConfiguration(message);
                    break;

                default:
                    Logger.info('[ConfigHandler] Unhandled command:', cmd);
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Config error: ${errorMessage}`);
        }
    }

    private async handleSaveModelSelection(message: Message): Promise<void> {
        if (message.selectedModel) {
            const selection = message.selectedModel as { provider: string; model: string };
            if (!AI_PROVIDERS.includes(selection.provider as typeof AI_PROVIDERS[number])) throw new Error('Unknown AI provider');
            const modelForStorage = { provider: selection.provider, model: selection.model };
            await this.context.globalState.update('selectedModel', modelForStorage);

            // Save API key in secrets so it can be loaded when configuration is loaded
            const selectedModel = message.selectedModel as { provider: string; apiKey?: string };
            if (selectedModel.apiKey) {
                await this.context.secrets.store(`${selectedModel.provider}ApiKey`, selectedModel.apiKey);
            }
        }
    }

    private async handleSaveLinkedinToken(message: Message): Promise<void> {
        const token = message.linkedinToken as string | undefined;
        await this.saveReplacement('linkedinToken', token);
        this.sendSuccess('LinkedIn token saved!');
        await this.handleLoadConfiguration();
    }

    private async handleSaveTelegramCredentials(message: Message): Promise<void> {
        const bot = message.telegramBot as string | undefined;
        const chat = message.telegramChat as string | undefined;
        await this.saveReplacement('telegramBot', bot);
        await this.saveReplacement('telegramChat', chat);
        this.sendSuccess('Telegram credentials saved!');
        await this.handleLoadConfiguration();
    }


    private async handleSaveDiscordWebhook(message: Message): Promise<void> {
        const webhook = message.discordWebhookUrl as string | undefined;
        await this.saveReplacement('discordWebhook', webhook);
        this.sendSuccess('Discord webhook saved!');
        await this.handleLoadConfiguration();
    }

    private async handleSaveXCredentials(message: Message): Promise<void> {
        const token = message.xAccessToken as string | undefined;
        const secret = message.xAccessSecret as string | undefined;
        await this.saveReplacement('xAccessToken', token);
        await this.saveReplacement('xAccessSecret', secret);
        this.sendSuccess('X/Twitter credentials saved!');
        await this.handleLoadConfiguration();
    }


    private async handleSaveBlueSkyCredentials(message: Message): Promise<void> {
        const identifier = message.blueskyIdentifier as string | undefined;
        const password = message.blueskyPassword as string | undefined;
        await this.saveReplacement('blueskyIdentifier', identifier);
        await this.saveReplacement('blueskyPassword', password);
        this.sendSuccess('BlueSky credentials saved!');
        await this.handleLoadConfiguration();
    }

    private async handleSaveMastodonCredentials(message: Message): Promise<void> {
        const instance = message.mastodonInstance as string | undefined;
        const token = message.mastodonToken as string | undefined;
        await this.saveReplacement('mastodonInstance', instance?.trim() ? normalizeMastodonInstance(instance) : instance);
        await this.saveReplacement('mastodonToken', token);
        this.sendSuccess('Mastodon credentials saved!');
        await this.handleLoadConfiguration();
    }

    private async handleSaveDevToCredentials(message: Message): Promise<void> {
        const apiKey = message.devtoApiKey as string | undefined;
        await this.saveReplacement('devtoApiKey', apiKey);
        this.sendSuccess('Dev.to API key saved!');
        await this.handleLoadConfiguration();
    }



    private async handleLoadConfiguration(): Promise<void> {
        const savedModel = this.context.globalState.get<{ provider: string; model: string }>('selectedModel');
        const credentialsSaved = await credentialStatus(this.context.secrets);
        // X connected through DotSuite keeps no local token but is connected.
        const xViaDotSuite = this.context.globalState.get<string>('dotshare.xVia') === 'dotsuite';
        if (xViaDotSuite) credentialsSaved.xAccessToken = true;
        const aiKeysSaved = Object.fromEntries(AI_PROVIDERS.map(provider => [provider, credentialsSaved[`${provider}ApiKey`]]));

        const currentLanguage = this.context.globalState.get('dotshareLanguage') || 'en';

        let translations = {};
        try {
            const filePath = path.join(this.context.extensionPath, 'media', 'locales', `${currentLanguage}.json`);
            if (fs.existsSync(filePath)) {
                translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
        } catch (e) {
            Logger.warn(`[ConfigHandler] Failed to load translations for ${currentLanguage}`, e);
        }

        let githubConnected = false;
        try {
            const { TokenManager } = await import('../services/TokenManager');
            githubConnected = await TokenManager.hasGitHubToken();
        } catch {
            // Ignore error
        }

        const expiresAt = Number(await this.context.secrets.get('x_expires_at'));
        this.view.webview.postMessage({
            command: 'updateConfiguration',
            selectedModel: savedModel ? { provider: savedModel.provider, model: savedModel.model } : undefined,
            credentialsSaved,
            aiKeysSaved,

            githubConnected,
            xViaDotSuite,

            language: currentLanguage,
            translations: translations,
            // AEGIS 1.4.0: Proactive refresh flags & expiry timestamps
            xShouldRefreshSoon: this.context.globalState.get<boolean>('x_should_refresh_soon'),
            xExpiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : undefined,
        });
    }

    private async handleLoadSavedApis(message: Message): Promise<void> {
        const platform = message.platform;
        if (!isPlatform(platform)) throw new Error('Unknown platform');
        const { StorageManager } = await import('../storage/storage-manager');
        const storageManager = new StorageManager(this.context);
        const savedApis = await storageManager.loadSavedApis(platform);
        this.view.webview.postMessage({
            command: 'savedApisLoaded',
            platform: platform,
            savedApis: savedApis.map(publicApiConfiguration)
        });
    }

    private async handleSaveApiConfiguration(message: Message): Promise<void> {
        const { StorageManager } = await import('../storage/storage-manager');
        const storageManager = new StorageManager(this.context);
        await storageManager.saveApiConfiguration(message.apiConfig as SavedApiConfiguration);
        this.view.webview.postMessage({ command: 'status', status: 'API configuration saved!', type: 'success' });
        this.view.webview.postMessage({ command: 'apiConfigurationSaved' });
    }

    private async handleDeleteApiConfiguration(message: Message): Promise<void> {
        const apiId = message.apiId as string;
        const { StorageManager } = await import('../storage/storage-manager');
        const storageManager = new StorageManager(this.context);
        await storageManager.deleteApiConfiguration(apiId);
        this.sendSuccess('API configuration deleted!');
        await this.handleLoadSavedApis({ command: 'loadSavedApis', platform: apiId.split('_')[0] });
    }

    private async handleSetDefaultApiConfiguration(message: Message): Promise<void> {
        const platform = message.platform as string;
        const apiId = message.apiId as string;
        const { StorageManager } = await import('../storage/storage-manager');
        const storageManager = new StorageManager(this.context);
        await storageManager.setDefaultApiConfiguration(platform, apiId);
        this.sendSuccess(`${platform.charAt(0).toUpperCase() + platform.slice(1)} default configuration updated!`);
        this.view.webview.postMessage({ command: 'defaultConfigurationSet' });
    }

    private async handleLoadApiConfiguration(message: Message): Promise<void> {
        const apiId = message.apiId as string;
        const { StorageManager } = await import('../storage/storage-manager');
        const storageManager = new StorageManager(this.context);
        const apiConfig = await storageManager.loadApiConfiguration(apiId);
        if (apiConfig) {
            // Activate on the extension host; never return stored values to the UI.
            for (const key of PLATFORM_SECRET_KEYS[apiConfig.platform]) {
                const value = (apiConfig.credentials as unknown as Record<string, string>)[key];
                if (!value) throw new Error('Saved configuration is incomplete');
            }
            for (const key of PLATFORM_SECRET_KEYS[apiConfig.platform]) {
                await this.context.secrets.store(key, (apiConfig.credentials as unknown as Record<string, string>)[key]);
            }
            await storageManager.setDefaultApiConfiguration(apiConfig.platform, apiConfig.id);
            await this.handleLoadConfiguration();
            this.sendSuccess('Saved configuration is active.');
        } else {
            this.sendError('API configuration not found');
        }
    }

    private async handleClearAllCredentials(): Promise<void> {
        const { StorageManager } = await import('../storage/storage-manager');
        const storageManager = new StorageManager(this.context);
        await storageManager.clearAllCredentials();
        this.sendSuccess('All local credentials and saved APIs cleared. To delete copies synced to DotSuite, email support@dotsuite.dev.');
        this.view.webview.postMessage({ command: 'credentialsCleared' });
        this.view.webview.postMessage({ command: 'LOGOUT_SUCCESS' });
        // Reload configuration so the UI updates
        await this.handleLoadConfiguration();
    }

    private async saveReplacement(key: string, value: unknown): Promise<void> {
        if (typeof value === 'string' && value.trim()) {
            await this.context.secrets.store(key, value.trim());
        }
    }

    private async handleSaveApiSet(message: Message): Promise<void> {
        if (!isPlatform(message.platform) || typeof message.name !== 'string' || !message.name.trim()) {
            throw new Error('Platform and configuration name are required');
        }
        const credentials: Record<string, string> = {};
        for (const key of PLATFORM_SECRET_KEYS[message.platform]) {
            const value = await this.context.secrets.get(key);
            if (!value) throw new Error('Save platform credentials before creating a configuration');
            credentials[key] = value;
        }
        const { StorageManager } = await import('../storage/storage-manager');
        const storage = new StorageManager(this.context);
        await storage.saveApiConfiguration({
            id: '', name: message.name.trim(), platform: message.platform, created: '',
            credentials: credentials as unknown as SavedApiConfiguration['credentials'],
        });
        await this.handleLoadSavedApis({ command: 'loadSavedApis', platform: message.platform });
        this.sendSuccess('API configuration saved securely.');
    }

    private sendSuccess(message: string) {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'success' });
    }

    private sendError(message: string) {
        this.view.webview.postMessage({ command: 'status', status: redactSensitiveText(message), type: 'error' });
    }
}
