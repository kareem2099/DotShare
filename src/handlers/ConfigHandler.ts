import * as vscode from 'vscode';
import { SavedApiConfiguration } from '../types';
import { Logger } from '../utils/Logger';

interface Message {
    command: string;
    [key: string]: unknown;
}

export class ConfigHandler {
    constructor(
        private view: vscode.WebviewView,
        private context: vscode.ExtensionContext
    ) {}

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

                case 'saveFacebookToken':
                    await this.handleSaveFacebookToken(message);
                    break;

                case 'saveDiscordWebhook':
                    await this.handleSaveDiscordWebhook(message);
                    break;

                case 'saveXCredentials':
                    await this.handleSaveXCredentials(message);
                    break;

                case 'saveRedditCredentials':
                    await this.handleSaveRedditCredentials(message);
                    break;

                case 'saveBlueSkyCredentials':
                    await this.handleSaveBlueSkyCredentials(message);
                    break;

                case 'loadConfiguration':
                    await this.handleLoadConfiguration();
                    break;

                case 'loadSavedApis':
                    await this.handleLoadSavedApis(message);
                    break;

                case 'saveApiConfiguration':
                    await this.handleSaveApiConfiguration(message);
                    break;

                case 'deleteApiConfiguration':
                    await this.handleDeleteApiConfiguration(message);
                    break;

                case 'setDefaultApiConfiguration':
                    await this.handleSetDefaultApiConfiguration(message);
                    break;

                case 'loadApiConfiguration':
                    await this.handleLoadApiConfiguration(message);
                    break;

                default:
                    Logger.info('ConfigHandler: Unhandled command:', cmd);
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Config error: ${errorMessage}`);
        }
    }

    private async handleSaveModelSelection(message: Message): Promise<void> {
        if (message.selectedModel) {
            const modelForStorage = { ...message.selectedModel, apiKey: '' };
            this.context.globalState.update('selectedModel', modelForStorage);

            // Save API key in secrets so it can be loaded when configuration is loaded
            const selectedModel = message.selectedModel as { provider: string; apiKey?: string };
            if (selectedModel.apiKey) {
                await this.context.secrets.store(`${selectedModel.provider}ApiKey`, selectedModel.apiKey);
            }
        }
    }

    private async handleSaveLinkedinToken(message: Message): Promise<void> {
        const token = message.linkedinToken as string | undefined;
        await this.context.secrets.store('linkedinToken', token || '');
        this.sendSuccess('LinkedIn token saved!');
    }

    private async handleSaveTelegramCredentials(message: Message): Promise<void> {
        const bot = message.telegramBot as string | undefined;
        const chat = message.telegramChat as string | undefined;
        await this.context.secrets.store('telegramBot', bot || '');
        await this.context.secrets.store('telegramChat', chat || '');
        this.sendSuccess('Telegram credentials saved!');
    }

    private async handleSaveFacebookToken(message: Message): Promise<void> {
        const token = message.facebookToken as string | undefined;
        const pageToken = message.facebookPageToken as string | undefined;
        const pageId = message.facebookPageId as string | undefined;
        await this.context.secrets.store('facebookToken', token || '');
        await this.context.secrets.store('facebookPageToken', pageToken || '');
        await this.context.secrets.store('facebookPageId', pageId || '');
        this.sendSuccess('Facebook credentials saved!');
    }

    private async handleSaveDiscordWebhook(message: Message): Promise<void> {
        const webhook = message.discordWebhookUrl as string | undefined;
        await this.context.secrets.store('discordWebhook', webhook || '');
        this.sendSuccess('Discord webhook saved!');
    }

    private async handleSaveXCredentials(message: Message): Promise<void> {
        const token = message.xAccessToken as string | undefined;
        const secret = message.xAccessSecret as string | undefined;
        await this.context.secrets.store('xAccessToken', token || '');
        await this.context.secrets.store('xAccessSecret', secret || '');
        this.sendSuccess('X/Twitter credentials saved!');
    }

    private async handleSaveRedditCredentials(message: Message): Promise<void> {
        const token = message.redditAccessToken as string | undefined;
        const refresh = message.redditRefreshToken as string | undefined;
        await this.context.secrets.store('redditAccessToken', token || '');
        await this.context.secrets.store('redditRefreshToken', refresh || '');
        this.sendSuccess('Reddit credentials saved!');
    }

    private async handleSaveBlueSkyCredentials(message: Message): Promise<void> {
        const identifier = message.blueskyIdentifier as string | undefined;
        const password = message.blueskyPassword as string | undefined;
        await this.context.secrets.store('blueskyIdentifier', identifier || '');
        await this.context.secrets.store('blueskyPassword', password || '');
        this.sendSuccess('BlueSky credentials saved!');
    }

    private async handleLoadConfiguration(): Promise<void> {
        const savedModel = this.context.globalState.get('selectedModel');
        let apiKey = '';
        if (savedModel && typeof savedModel === 'object' && 'provider' in savedModel && typeof (savedModel as { provider?: unknown }).provider === 'string') {
            const validModel = savedModel as { provider: 'gemini' | 'openai' | 'xai' };
            apiKey = await this.context.secrets.get(`${validModel.provider}ApiKey`) || '';
        }

        const savedLinkedInToken = await this.context.secrets.get('linkedinToken') || '';
        const savedTelegramBot = await this.context.secrets.get('telegramBot') || '';
        const savedTelegramChat = await this.context.secrets.get('telegramChat') || '';
        const savedXToken = await this.context.secrets.get('xAccessToken') || '';
        const savedXSecret = await this.context.secrets.get('xAccessSecret') || '';
        const savedFacebookToken = await this.context.secrets.get('facebookToken') || '';
        const savedFacebookPageToken = await this.context.secrets.get('facebookPageToken') || '';
        const savedFacebookPageId = await this.context.secrets.get('facebookPageId') || '';
        const savedDiscordWebhook = await this.context.secrets.get('discordWebhook') || '';
        const savedRedditToken = await this.context.secrets.get('redditAccessToken') || '';
        const savedRedditRefresh = await this.context.secrets.get('redditRefreshToken') || '';
        const savedRedditClientId = await this.context.secrets.get('redditClientId') || '';
        const savedRedditClientSecret = await this.context.secrets.get('redditClientSecret') || '';
        const savedRedditUsername = await this.context.secrets.get('redditUsername') || '';
        const savedRedditPassword = await this.context.secrets.get('redditPassword') || '';
        const savedRedditApiName = this.context.globalState.get('redditApiName', 'Reddit Account');
        const savedBlueSkyIdentifier = await this.context.secrets.get('blueskyIdentifier') || '';
        const savedBlueSkyPassword = await this.context.secrets.get('blueskyPassword') || '';

        this.view.webview.postMessage({
            command: 'updateConfiguration',
            selectedModel: savedModel ? { ...savedModel, apiKey } : savedModel,
            linkedinToken: savedLinkedInToken,
            telegramBot: savedTelegramBot,
            telegramChat: savedTelegramChat,
            xAccessToken: savedXToken,
            xAccessSecret: savedXSecret,
            facebookToken: savedFacebookToken,
            facebookPageToken: savedFacebookPageToken,
            facebookPageId: savedFacebookPageId,
            discordWebhookUrl: savedDiscordWebhook,
            redditAccessToken: savedRedditToken,
            redditRefreshToken: savedRedditRefresh,
            redditClientId: savedRedditClientId,
            redditClientSecret: savedRedditClientSecret,
            redditUsername: savedRedditUsername,
            redditPassword: savedRedditPassword,
            redditApiName: savedRedditApiName,
            blueskyIdentifier: savedBlueSkyIdentifier,
            blueskyPassword: savedBlueSkyPassword
        });
    }

    private async handleLoadSavedApis(message: Message): Promise<void> {
        const platform = message.platform as string;
        const { StorageManager } = await import('../storage-manager');
        const storageManager = new StorageManager(this.context);
        const savedApis = await storageManager.loadSavedApis(platform);
        this.view.webview.postMessage({
            command: 'savedApisLoaded',
            savedApis: savedApis
        });
    }

    private async handleSaveApiConfiguration(message: Message): Promise<void> {
        const { StorageManager } = await import('../storage-manager');
        const storageManager = new StorageManager(this.context);
        await storageManager.saveApiConfiguration(message.apiConfig as SavedApiConfiguration);
        this.view.webview.postMessage({ command: 'status', status: 'API configuration saved!', type: 'success' });
        this.view.webview.postMessage({ command: 'apiConfigurationSaved' });
    }

    private async handleDeleteApiConfiguration(message: Message): Promise<void> {
        const apiId = message.apiId as string;
        const { StorageManager } = await import('../storage-manager');
        const storageManager = new StorageManager(this.context);
        await storageManager.deleteApiConfiguration(apiId);
        this.sendSuccess('API configuration deleted!');
    }

    private async handleSetDefaultApiConfiguration(message: Message): Promise<void> {
        const platform = message.platform as string;
        const apiId = message.apiId as string;
        const { StorageManager } = await import('../storage-manager');
        const storageManager = new StorageManager(this.context);
        await storageManager.setDefaultApiConfiguration(platform, apiId);
        this.sendSuccess(`${platform.charAt(0).toUpperCase() + platform.slice(1)} default configuration updated!`);
        this.view.webview.postMessage({ command: 'defaultConfigurationSet' });
    }

    private async handleLoadApiConfiguration(message: Message): Promise<void> {
        const apiId = message.apiId as string;
        const { StorageManager } = await import('../storage-manager');
        const storageManager = new StorageManager(this.context);
        const apiConfig = await storageManager.loadApiConfiguration(apiId);
        if (apiConfig) {
            this.view.webview.postMessage({
                command: 'apiConfigurationLoaded',
                apiConfig: apiConfig
            });
        } else {
            this.sendError('API configuration not found');
        }
    }

    private sendSuccess(message: string) {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'success' });
    }

    private sendError(message: string) {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'error' });
    }
}
