import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// Basic imports needed for current functionality
import { generatePost as generateGeminiPost } from './gemini';
import { generatePost as generateOpenAIPost } from './openai';
import { generatePost as generateXAIPost } from './xai';
import { /* shareToLinkedIn */ } from './linkedin';
import { /* shareToTelegram */ } from './telegram';
import { ScheduledPostsStorage } from './scheduled-posts';
import { Scheduler } from './scheduler';
import { PostData, HistoricalPost, ShareRecord, AnalyticsSummary } from './types';

export function activate(context: vscode.ExtensionContext) {
    console.log('DotShare extension is now active!');

    // Command for generating post
    const generateDisposable = vscode.commands.registerCommand('dotshare.generatePost', () => {
        vscode.window.showInformationMessage('Please use the DotShare activity bar panel to enter API keys and generate posts.');
    });

    // Command for LinkedIn
    const linkedinDisposable = vscode.commands.registerCommand('dotshare.shareToLinkedIn', () => {
        vscode.window.showInformationMessage('Please use the DotShare activity bar panel to share to LinkedIn.');
    });

    // Command for Telegram
    const telegramDisposable = vscode.commands.registerCommand('dotshare.shareToTelegram', () => {
        vscode.window.showInformationMessage('Please use the DotShare activity bar panel to share to Telegram.');
    });

    context.subscriptions.push(generateDisposable);
    context.subscriptions.push(linkedinDisposable);
    context.subscriptions.push(telegramDisposable);

    // Register webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DotShareProvider.viewType, new DotShareProvider(context.extensionUri, context))
    );
}

class DotShareProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'dotshareView';

    private _view?: vscode.WebviewView;
    private _scheduledPostsStorage!: ScheduledPostsStorage;
    private _scheduler?: Scheduler;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        // Initialize scheduled posts storage synchronously
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
            console.warn('Could not create storage directory, using temp:', error);
            // Final fallback to temp directory
            storagePath = path.join(os.tmpdir(), 'dotshare-scheduled');
            try {
                if (!fs.existsSync(storagePath)) {
                    fs.mkdirSync(storagePath, { recursive: true });
                }
            } catch (tempError) {
                console.error('Even temp directory creation failed:', tempError);
                // Last resort - use system temp
                storagePath = os.tmpdir();
            }
        }

        this._scheduledPostsStorage = new ScheduledPostsStorage(storagePath);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken,
    ) {
        void context; // Suppress unused parameter warning
        void token; // Suppress unused parameter warning
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

                // Load initial data when webview is ready
                setImmediate(async () => {
                    try {
                        // Load scheduled posts
                        await this._loadScheduledPosts(webviewView);

                        // Load post history and analytics
                        await this._loadPostHistory(webviewView);

                        // Load all saved configuration (tokens, model settings, etc.)
                        await this._loadConfiguration(webviewView);
                    } catch (error) {
                        console.error('Error loading initial data:', error);
                    }
                });

        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'generatePost':
                        if (!message.selectedModel || !message.selectedModel.apiKey) {
                            vscode.window.showErrorMessage('API Key is required to generate posts.');
                            return;
                        }
                        try {
                            const { provider, apiKey, model } = message.selectedModel;
                            let post: PostData | null = null;

                            // Retry logic for API failures
                            let retryCount = 0;
                            const maxRetries = 1;
                            while (retryCount <= maxRetries) {
                                try {
                                    if (provider === 'gemini') {
                                        post = await generateGeminiPost(apiKey, model);
                                    } else if (provider === 'openai') {
                                        post = await generateOpenAIPost(apiKey, model);
                                    } else if (provider === 'xai') {
                                        post = await generateXAIPost(apiKey, model);
                                    } else {
                                        webviewView.webview.postMessage({ command: 'status', status: 'Error: Unsupported AI provider.', type: 'error' });
                                        return;
                                    }
                                    break; // Success, exit retry loop
                                } catch (retryError: unknown) {
                                    retryCount++;
                                    if (retryCount > maxRetries) {
                                        throw retryError; // Re-throw after max retries
                                    }
                                    // Wait briefly before retry
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                }
                            }

                            if (post) {
                                // Save post to history with AI metadata
                                this._savePostToHistory(provider as 'gemini' | 'openai' | 'xai', model, post);
                                webviewView.webview.postMessage({ command: 'updatePost', post: post.text });

                                // Refresh analytics after posting
                                const updatedAnalytics = this._calculateAnalytics();
                                webviewView.webview.postMessage({
                                    command: 'updateAnalytics',
                                    analytics: updatedAnalytics
                                });

                                // Securely store API keys and save model selection for persistence
                                if (message.selectedModel) {
                                    await this._context.secrets.store(`${message.selectedModel.provider}ApiKey`, message.selectedModel.apiKey);
                                    // Also save model selection (without API key for security)
                                    const modelForStorage = { provider, model, apiKey: '' };
                                    this._context.globalState.update('selectedModel', modelForStorage);
                                }
                            }
                        } catch (error: unknown) {
                            const errorMessageObj = error instanceof Error ? error : { message: String(error) };
                            let errorMessage = 'Error generating post.';
                            if (errorMessageObj.message.includes('API key')) {
                                errorMessage = 'Invalid API key. Check your credentials.';
                            } else if (errorMessageObj.message.includes('rate limit')) {
                                errorMessage = 'API rate limit exceeded. Try again later.';
                            } else if (errorMessageObj.message.includes('network')) {
                                errorMessage = 'Network error. Check your connection.';
                            } else {
                                errorMessage = `AI service error: ${errorMessageObj.message}`;
                            }
                            webviewView.webview.postMessage({ command: 'status', status: errorMessage, type: 'error' });
                        }
                        return;
                    case 'saveModelSelection':
                        if (message.selectedModel) {
                            // Store selected model without API key for security
                            const modelForStorage = { ...message.selectedModel, apiKey: '' };
                            this._context.globalState.update('selectedModel', modelForStorage);
                        }
                        return;
                    case 'saveLinkedinToken':
                        try {
                            await this._context.secrets.store('linkedinToken', message.linkedinToken || '');
                            webviewView.webview.postMessage({ command: 'status', status: 'LinkedIn token saved!', type: 'success' });
                        } catch (error: unknown) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            webviewView.webview.postMessage({ command: 'status', status: `Error saving LinkedIn token: ${errorMessage}`, type: 'error' });
                        }
                        return;
                    case 'saveTelegramCredentials':
                        try {
                            await this._context.secrets.store('telegramBot', message.telegramBot || '');
                            await this._context.secrets.store('telegramChat', message.telegramChat || '');
                            webviewView.webview.postMessage({ command: 'status', status: 'Telegram credentials saved!', type: 'success' });
                        } catch (error: unknown) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            webviewView.webview.postMessage({ command: 'status', status: `Error saving Telegram credentials: ${errorMessage}`, type: 'error' });
                        }
                        return;
                    case 'saveFacebookToken': {
                        try {
                            await this._context.secrets.store('facebookToken', message.facebookToken || '');
                            await this._context.secrets.store('facebookPageToken', message.facebookPageToken || '');
                            await this._context.secrets.store('facebookPageId', message.facebookPageId || '');
                            webviewView.webview.postMessage({ command: 'status', status: 'Facebook credentials saved!', type: 'success' });
                        } catch (error: unknown) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error saving Facebook credentials: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'saveDiscordWebhook': {
                        try {
                            await this._context.secrets.store('discordWebhook', message.discordWebhookUrl || '');
                            webviewView.webview.postMessage({ command: 'status', status: 'Discord webhook saved!', type: 'success' });
                        } catch (error: unknown) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error saving Discord webhook: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'saveXCredentials': {
                        try {
                            await this._context.secrets.store('xAccessToken', message.xAccessToken || '');
                            await this._context.secrets.store('xAccessSecret', message.xAccessSecret || '');
                            webviewView.webview.postMessage({ command: 'status', status: 'X/Twitter credentials saved!', type: 'success' });
                        } catch (error: unknown) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error saving X/Twitter credentials: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'saveRedditCredentials': {
                        try {
                            await this._context.secrets.store('redditAccessToken', message.redditAccessToken || '');
                            await this._context.secrets.store('redditRefreshToken', message.redditRefreshToken || '');
                            webviewView.webview.postMessage({ command: 'status', status: 'Reddit credentials saved!', type: 'success' });
                        } catch (error: unknown) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error saving Reddit credentials: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'saveBlueSkyCredentials': {
                        try {
                            await this._context.secrets.store('blueskyIdentifier', message.blueskyIdentifier || '');
                            await this._context.secrets.store('blueskyPassword', message.blueskyPassword || '');
                            webviewView.webview.postMessage({ command: 'status', status: 'BlueSky credentials saved!', type: 'success' });
                        } catch (error: unknown) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error saving BlueSky credentials: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'loadConfiguration': {
                        const savedModel = this._context.globalState.get('selectedModel');
                        let apiKey = '';
                        if (savedModel && typeof savedModel === 'object' && 'provider' in savedModel && typeof (savedModel as { provider?: unknown }).provider === 'string') {
                            const validModel = savedModel as { provider: 'gemini' | 'openai' | 'xai' };
                            apiKey = await this._context.secrets.get(`${validModel.provider}ApiKey`) || '';
                        }
                        // Get all social media tokens from secrets
                        const savedLinkedInToken = await this._context.secrets.get('linkedinToken') || '';
                        const savedTelegramBot = await this._context.secrets.get('telegramBot') || '';
                        const savedTelegramChat = await this._context.secrets.get('telegramChat') || '';
                        const savedXToken = await this._context.secrets.get('xAccessToken') || '';
                        const savedXSecret = await this._context.secrets.get('xAccessSecret') || '';
                        const savedFacebookToken = await this._context.secrets.get('facebookToken') || '';
                        const savedFacebookPageToken = await this._context.secrets.get('facebookPageToken') || '';
                        const savedFacebookPageId = await this._context.secrets.get('facebookPageId') || '';
                        const savedDiscordWebhook = await this._context.secrets.get('discordWebhook') || '';
                        const savedRedditToken = await this._context.secrets.get('redditAccessToken') || '';
                        const savedRedditRefresh = await this._context.secrets.get('redditRefreshToken') || '';
                        // Load Reddit configuration details
                        const savedRedditClientId = await this._context.secrets.get('redditClientId') || '';
                        const savedRedditClientSecret = await this._context.secrets.get('redditClientSecret') || '';
                        const savedRedditUsername = await this._context.secrets.get('redditUsername') || '';
                        const savedRedditPassword = await this._context.secrets.get('redditPassword') || '';
                        const savedRedditApiName = this._context.globalState.get('redditApiName', 'Reddit Account');
                        const savedBlueSkyIdentifier = await this._context.secrets.get('blueskyIdentifier') || '';
                        const savedBlueSkyPassword = await this._context.secrets.get('blueskyPassword') || '';

                        webviewView.webview.postMessage({
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
                        return;
                    }
                    case 'shareToFacebook': {
                        try {
                            const facebookPost = this._context.globalState.get('lastPost') as PostData;
                            if (!facebookPost) {
                                webviewView.webview.postMessage({ command: 'status', status: 'Error: No post generated. Generate first.', type: 'error' });
                                return;
                            }

                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            await this.shareToFacebookWithUpdate(webviewView, facebookPost, message, postId);
                        } catch (error: unknown) {
                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            if (postId) {
                                this._recordShare(postId, 'facebook', false, String(error));
                            }

                            webviewView.webview.postMessage({ command: 'status', status: `Error sharing to Facebook: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'shareToDiscord': {
                        try {
                            const discordPost = this._context.globalState.get('lastPost') as PostData;
                            if (!discordPost) {
                                webviewView.webview.postMessage({ command: 'status', status: 'Error: No post generated. Generate first.', type: 'error' });
                                return;
                            }

                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            await this.shareToDiscordWithUpdate(webviewView, discordPost, message, postId);
                        } catch (error: unknown) {
                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            if (postId) {
                                this._recordShare(postId, 'discord', false, String(error));
                            }

                            webviewView.webview.postMessage({ command: 'status', status: `Error sharing to Discord: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'shareToX': {
                        try {
                            const xPost = this._context.globalState.get('lastPost') as PostData;
                            if (!xPost) {
                                webviewView.webview.postMessage({ command: 'status', status: 'Error: No post generated. Generate first.', type: 'error' });
                                return;
                            }

                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            await this.shareToXWithUpdate(webviewView, xPost, message, postId);
                        } catch (error: unknown) {
                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            if (postId) {
                                this._recordShare(postId, 'x', false, String(error));
                            }

                            webviewView.webview.postMessage({ command: 'status', status: `Error sharing to X/Twitter: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'shareToReddit': {
                        try {
                            const msg = message as { redditAccessToken?: string; redditRefreshToken?: string; post?: string; mediaFilePaths?: string[] };
                            const postText = msg.post || '';
                            const mediaPaths = msg.mediaFilePaths || [];

                            const redditPost: PostData = {
                                text: postText,
                                media: mediaPaths
                            };

                            await this.shareToRedditWithUpdate(webviewView, redditPost, message, undefined);
                        } catch (error: unknown) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error sharing to Reddit: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'shareToLinkedIn': {
                        try {
                            const msg = message as { linkedinToken?: string; post?: string; mediaFilePaths?: string[] };
                            const postText = msg.post || '';
                            const mediaPaths = msg.mediaFilePaths || [];

                            const linkedinPost: PostData = {
                                text: postText,
                                media: mediaPaths
                            };

                            await this.shareToLinkedInWithUpdate(webviewView, linkedinPost, message, undefined);
                        } catch (error: unknown) {
                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            if (postId) {
                                this._recordShare(postId, 'linkedin', false, String(error));
                            }

                            webviewView.webview.postMessage({ command: 'status', status: `Error sharing to LinkedIn: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'shareToTelegram': {
                        try {
                            const msg = message as { telegramBot?: string; telegramChat?: string; post?: string; mediaFilePaths?: string[] };
                            const postText = msg.post || '';
                            const mediaPaths = msg.mediaFilePaths || [];

                            const telegramPost: PostData = {
                                text: postText,
                                media: mediaPaths
                            };

                            await this.shareToTelegramWithUpdate(webviewView, telegramPost, message, undefined);
                        } catch (error: unknown) {
                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            if (postId) {
                                this._recordShare(postId, 'telegram', false, String(error));
                            }

                            webviewView.webview.postMessage({ command: 'status', status: `Error sharing to Telegram: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'shareToBlueSky': {
                        try {
                            const blueskyPost = this._context.globalState.get('lastPost') as PostData;
                            if (!blueskyPost) {
                                webviewView.webview.postMessage({ command: 'status', status: 'Error: No post generated. Generate first.', type: 'error' });
                                return;
                            }

                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            await this.shareToBlueSkyWithUpdate(webviewView, blueskyPost, message, postId);
                        } catch (error: unknown) {
                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            if (postId) {
                                this._recordShare(postId, 'bluesky', false, String(error));
                            }

                            webviewView.webview.postMessage({ command: 'status', status: `Error sharing to BlueSky: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'generateRedditTokens': {
                        try {
                            // Validate all required Reddit credentials
                            if (!message.redditClientId || !message.redditClientSecret ||
                                !message.redditUsername || !message.redditPassword ||
                                message.redditClientId.trim() === '' || message.redditClientSecret.trim() === '' ||
                                message.redditUsername.trim() === '' || message.redditPassword.trim() === '') {
                                webviewView.webview.postMessage({
                                    command: 'status',
                                    status: 'All Reddit credentials are required. Please fill in Client ID, Secret, Username, and Password.',
                                    type: 'error'
                                });
                                return;
                            }

                            // Get current saved configuration for comparison
                            const savedClientId = await this._context.secrets.get('redditClientId') || '';
                            const savedClientSecret = await this._context.secrets.get('redditClientSecret') || '';
                            const savedUsername = await this._context.secrets.get('redditUsername') || '';
                            const savedPassword = await this._context.secrets.get('redditPassword') || '';
                            const savedApiName = this._context.globalState.get('redditApiName', '');
                            const savedAccessToken = await this._context.secrets.get('redditAccessToken') || '';

                            const currentClientId = message.redditClientId.trim();
                            const currentClientSecret = message.redditClientSecret.trim();
                            const currentUsername = message.redditUsername.trim();
                            const currentPassword = message.redditPassword.trim();
                            const currentApiName = message.redditApiName || 'Reddit Account';

                            // Check if configuration has changed or token needs regeneration
                            const configChanged = (
                                savedClientId !== currentClientId ||
                                savedClientSecret !== currentClientSecret ||
                                savedUsername !== currentUsername ||
                                savedPassword !== currentPassword ||
                                savedApiName !== currentApiName
                            );

                            // Check if user has already entered an access token in the UI (not just saved in storage)
                            const userEnteredAccessToken = message.redditAccessToken?.trim();
                            if (userEnteredAccessToken && !configChanged) {
                                webviewView.webview.postMessage({
                                    command: 'status',
                                    status: 'You already have a Reddit access token in the field. Clear the access token field if you want to generate a new one.',
                                    type: 'error'
                                });
                                return;
                            }

                            // Save the Reddit configuration details for persistence
                            await this._context.secrets.store('redditClientId', currentClientId);
                            await this._context.secrets.store('redditClientSecret', currentClientSecret);
                            await this._context.secrets.store('redditUsername', currentUsername);
                            await this._context.secrets.store('redditPassword', currentPassword);
                            // Store in globalState for config name (non-sensitive data)
                            this._context.globalState.update('redditApiName', currentApiName);

                            // Import the existing function and use proper parameters
                            const { generateRedditTokens } = await import('./reddit');
                            const tokenData = await generateRedditTokens(
                                currentClientId,
                                currentClientSecret,
                                currentUsername,
                                currentPassword
                            );

                            // Store the generated tokens (only store refresh token if it exists)
                            await this._context.secrets.store('redditAccessToken', tokenData.access_token || '');
                            if (tokenData.refresh_token) {
                                await this._context.secrets.store('redditRefreshToken', tokenData.refresh_token);
                            } else {
                                // For script apps, remove any stored refresh token
                                await this._context.secrets.delete('redditRefreshToken');
                            }

                            // Send success message with indication if this was a regeneration
                            const successMessage = configChanged && savedAccessToken
                                ? 'Reddit tokens regenerated successfully! Old token replaced.'
                                : 'Reddit tokens generated successfully!';

                            webviewView.webview.postMessage({
                                command: 'redditTokensGenerated',
                                tokens: {
                                    accessToken: tokenData.access_token,
                                    refreshToken: tokenData.refresh_token
                                }
                            });

                            webviewView.webview.postMessage({
                                command: 'status',
                                status: successMessage,
                                type: 'success'
                            });
                        } catch (error: unknown) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            // Provide more helpful error message for authentication issues
                            let userMessage = errorMessage;
                            if (errorMessage.includes('401')) {
                                userMessage = 'Invalid Reddit credentials. Please check your Client ID, Secret, Username, and Password.';
                            } else if (errorMessage.includes('unsupported_grant_type')) {
                                userMessage = 'Reddit password authentication is not supported. Please use Reddit app with "script" OAuth type.';
                            } else if (errorMessage.includes('invalid_client')) {
                                userMessage = 'Invalid Reddit Client ID or Secret. Please check your app credentials.';
                            }
                            webviewView.webview.postMessage({ command: 'status', status: `Error generating Reddit tokens: ${userMessage}`, type: 'error' });
                        }
                        return;
                    }
                    case 'getRedditFlairs': {
                        try {
                            const { getRedditFlairs } = await import('./reddit');
                            const accessToken = await this._context.secrets.get('redditAccessToken') || '';

                            if (!accessToken) {
                                webviewView.webview.postMessage({ command: 'status', status: 'Reddit access token required.', type: 'error' });
                                return;
                            }

                            const flairs = await getRedditFlairs(accessToken, message.subreddit);
                            webviewView.webview.postMessage({
                                command: 'redditFlairsLoaded',
                                subreddit: message.subreddit,
                                flairs: flairs
                            });
                        } catch (error: unknown) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            webviewView.webview.postMessage({ command: 'status', status: `Error loading Reddit flairs: ${errorMessage}`, type: 'error' });
                        }
                        return;
                    }
                    case 'getRedditUserPosts': {
                        try {
                            const { getRedditUserPosts } = await import('./reddit');
                            const accessToken = await this._context.secrets.get('redditAccessToken') || '';

                            if (!accessToken) {
                                webviewView.webview.postMessage({ command: 'status', status: 'Reddit access token required.', type: 'error' });
                                return;
                            }

                            const posts = await getRedditUserPosts(accessToken, message.username, message.limit);
                            webviewView.webview.postMessage({
                                command: 'redditUserPostsRetrieved',
                                posts: posts
                            });
                        } catch (error: unknown) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            webviewView.webview.postMessage({ command: 'status', status: `Error loading Reddit posts: ${errorMessage}`, type: 'error' });
                        }
                        return;
                    }
                    case 'editRedditPost': {
                        try {
                            const { editRedditPost } = await import('./reddit');
                            const accessToken = await this._context.secrets.get('redditAccessToken') || '';

                            if (!accessToken) {
                                webviewView.webview.postMessage({ command: 'status', status: 'Reddit credentials required.', type: 'error' });
                                return;
                            }

                            const success = await editRedditPost(accessToken, message.postId, message.newText);

                            if (success) {
                                webviewView.webview.postMessage({ command: 'status', status: 'Reddit post updated successfully!', type: 'success' });
                            } else {
                                webviewView.webview.postMessage({ command: 'status', status: 'Failed to update Reddit post.', type: 'error' });
                            }
                        } catch (error: unknown) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            webviewView.webview.postMessage({ command: 'status', status: `Error updating Reddit post: ${errorMessage}`, type: 'error' });
                        }
                        return;
                    }
                    case 'deleteRedditPost': {
                        try {
                            const { deleteRedditPost } = await import('./reddit');
                            const accessToken = await this._context.secrets.get('redditAccessToken') || '';

                            if (!accessToken) {
                                webviewView.webview.postMessage({ command: 'status', status: 'Reddit credentials required.', type: 'error' });
                                return;
                            }

                            const success = await deleteRedditPost(accessToken, message.postId);

                            if (success) {
                                webviewView.webview.postMessage({ command: 'status', status: 'Reddit post deleted successfully!', type: 'success' });
                            } else {
                                webviewView.webview.postMessage({ command: 'status', status: 'Failed to delete Reddit post.', type: 'error' });
                            }
                        } catch (error: unknown) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            webviewView.webview.postMessage({ command: 'status', status: `Error deleting Reddit post: ${errorMessage}`, type: 'error' });
                        }
                        return;
                    }
                    case 'loadSavedApis': {
                        try {
                            const storageManager = new (await import('./storage-manager')).StorageManager(this._context);
                            const savedApis = storageManager.loadSavedApis(message.platform);
                            webviewView.webview.postMessage({
                                command: 'savedApisLoaded',
                                savedApis: savedApis
                            });
                        } catch (error: unknown) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error loading saved APIs: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'saveApiConfiguration': {
                        try {
                            const { StorageManager } = await import('./storage-manager');
                            const storageManager = new StorageManager(this._context);
                            storageManager.saveApiConfiguration(message.apiConfig);
                            webviewView.webview.postMessage({ command: 'status', status: 'API configuration saved!', type: 'success' });
                            webviewView.webview.postMessage({ command: 'apiConfigurationSaved' });
                        } catch (error: unknown) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error saving API configuration: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'deleteApiConfiguration': {
                        try {
                            const { StorageManager } = await import('./storage-manager');
                            const storageManager = new StorageManager(this._context);
                            storageManager.deleteApiConfiguration(message.apiId);
                            webviewView.webview.postMessage({ command: 'status', status: 'API configuration deleted!', type: 'success' });
                        } catch (error: unknown) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error deleting API configuration: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'share': {
                        {
                            try {
                                const { platforms, post, mediaFilePaths } = message as { platforms: string[]; post: string; mediaFilePaths?: string[] };

                                if (!platforms || platforms.length === 0) {
                                    webviewView.webview.postMessage({ command: 'status', status: 'No platforms selected', type: 'error' });
                                    return;
                                }

                                if (!post || !post.trim()) {
                                    webviewView.webview.postMessage({ command: 'status', status: 'Post content is required', type: 'error' });
                                    return;
                                }

                                const postData: PostData = {
                                    text: post.trim(),
                                    media: mediaFilePaths || []
                                };

                                // Get post ID from history for analytics
                                const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                                const mostRecentPost = history[0];
                                const postId = mostRecentPost?.id;

                                // Start unified sharing
                                webviewView.webview.postMessage({
                                    command: 'status',
                                    status: `Sharing to ${platforms.length} platform(s)...`,
                                    type: 'info'
                                });

                                await this.unifiedSharePost(webviewView, platforms, postData, mediaFilePaths, postId);
                            } catch (error: unknown) {
                                const errorMessage = error instanceof Error ? error.message : String(error);
                                webviewView.webview.postMessage({
                                    command: 'status',
                                    status: `Error during unified sharing: ${errorMessage}`,
                                    type: 'error'
                                });
                            }
                            return;
                        }
                    }
                    case 'setDefaultApiConfiguration': {
                        try {
                            const { StorageManager } = await import('./storage-manager');
                            const storageManager = new StorageManager(this._context);
                            storageManager.setDefaultApiConfiguration(message.platform, message.apiId);
                            webviewView.webview.postMessage({ command: 'status', status: `${message.platform.charAt(0).toUpperCase() + message.platform.slice(1)} default configuration updated!`, type: 'success' });
                            webviewView.webview.postMessage({ command: 'defaultConfigurationSet' });
                        } catch (error: unknown) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error setting default configuration: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'loadApiConfiguration': {
                        try {
                            const { StorageManager } = await import('./storage-manager');
                            const storageManager = new StorageManager(this._context);
                            const apiConfig = storageManager.loadApiConfiguration(message.apiId);
                            if (apiConfig) {
                                webviewView.webview.postMessage({
                                    command: 'apiConfigurationLoaded',
                                    apiConfig: apiConfig
                                });
                            } else {
                                webviewView.webview.postMessage({ command: 'status', status: 'API configuration not found', type: 'error' });
                            }
                        } catch (error: unknown) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error loading API configuration: ${error}`, type: 'error' });
                        }
                        return;
                    }
                    case 'loadPostHistory':
                        await this._loadPostHistory(webviewView);
                        return;
                    case 'loadAnalytics': {
                        const analytics = this._calculateAnalytics();
                        webviewView.webview.postMessage({
                            command: 'updateAnalytics',
                            analytics: analytics
                        });
                        return;
                    }
                    case 'selectMediaFiles': {
                        try {
                            // Use VS Code's file picker to select files from anywhere on the system
                            const fileUris = await vscode.window.showOpenDialog({
                                canSelectFiles: true,
                                canSelectFolders: false,
                                canSelectMany: true,
                                filters: {
                                    'Images': ['jpg', 'jpeg', 'png', 'gif'],
                                    'Videos': ['mp4'],
                                    'All supported': ['jpg', 'jpeg', 'png', 'gif', 'mp4']
                                },
                                openLabel: 'Select Media Files from Anywhere'
                            });

                            if (fileUris && fileUris.length > 0) {
                                // Get file stats for size info
                                const mediaFiles = [];
                                for (const uri of fileUris) {
                                    try {
                                        const stats = await vscode.workspace.fs.stat(uri);
                                        const fileName = path.basename(uri.fsPath);
                                        const fileSize = stats.size;

                                        mediaFiles.push({
                                            mediaPath: uri.fsPath, // Real file path for backend use
                                            mediaFilePath: uri.fsPath, // Same for frontend display
                                            fileName: fileName,
                                            fileSize: fileSize
                                        });
                                    } catch (error) {
                                        console.warn(`Could not get stats for ${uri.fsPath}:`, error);
                                    }
                                }

                                if (mediaFiles.length > 0) {
                                    // Send the selected files back to webview
                                    webviewView.webview.postMessage({
                                        command: 'mediaSelected',
                                        mediaFiles: mediaFiles
                                    });

                                    webviewView.webview.postMessage({
                                        command: 'status',
                                        status: `${mediaFiles.length} file(s) selected successfully!`,
                                        type: 'success'
                                    });
                                }
                            }
                        } catch (error: unknown) {
                            webviewView.webview.postMessage({
                                command: 'status',
                                status: `Error selecting files: ${error}`,
                                type: 'error'
                            });
                        }
                        return;
                    }
                    case 'uploadFile': {
                        try {
                            // Handle file upload from webview (drag & drop, click to browse)
                            const { file } = message as { file: { name: string; size: number; type: string; base64Data: string } };

                            if (!file || !file.name || !file.base64Data) {
                                webviewView.webview.postMessage({
                                    command: 'status',
                                    status: 'Invalid file data provided.',
                                    type: 'error'
                                });
                                return;
                            }

                            // Get extension storage directory for media files
                            const storageUri = this._context.globalStorageUri || vscode.Uri.file(path.join(os.tmpdir(), 'dotshare-media'));
                            const mediaDir = vscode.Uri.joinPath(storageUri, 'media');

                            // Create media directory if it doesn't exist
                            try {
                                await vscode.workspace.fs.createDirectory(mediaDir);
                            } catch (error) {
                                console.warn('Could not create media directory:', error);
                            }

                            // Convert base64 data back to binary
                            const binaryString = atob(file.base64Data);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                            }

                            // Create unique filename with timestamp
                            const fileName = `${Date.now()}-${file.name}`;
                            const fileUri = vscode.Uri.joinPath(mediaDir, fileName);

                            // Write the file to disk
                            await vscode.workspace.fs.writeFile(fileUri, bytes);

                            // Send success message back to webview with the saved file path
                            webviewView.webview.postMessage({
                                command: 'fileUploaded',
                                mediaPath: fileUri.fsPath,
                                mediaFilePath: fileUri.fsPath,
                                fileName: file.name,
                                fileSize: file.size
                            });

                            webviewView.webview.postMessage({
                                command: 'status',
                                status: `File "${file.name}" uploaded successfully!`,
                                type: 'success'
                            });

                        } catch (error: unknown) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            webviewView.webview.postMessage({
                                command: 'status',
                                status: `Error uploading file: ${errorMessage}`,
                                type: 'error'
                            });
                        }
                        return;
                    }
                    case 'attachMedia': {
                        try {
                            // Handle media attachment from either uploadFile result or selectMediaFiles
                            const { mediaFilePath, mediaFilePaths, mediaPath, fileName, fileSize } = message as {
                                mediaFilePath?: string;
                                mediaFilePaths?: string[];
                                mediaPath?: string;
                                fileName?: string;
                                fileSize?: number;
                            };

                            // Handle multiple files (from selectMediaFiles)
                            if (mediaFilePaths && Array.isArray(mediaFilePaths)) {
                                const mediaFiles = mediaFilePaths.map(path => ({
                                    mediaPath: path,
                                    mediaFilePath: path,
                                    fileName: fileName || path.split(/[/\\]/).pop() || 'unknown',
                                    fileSize: fileSize || 0
                                }));

                                webviewView.webview.postMessage({
                                    command: 'mediaAttached',
                                    mediaFiles: mediaFiles
                                });

                                webviewView.webview.postMessage({
                                    command: 'status',
                                    status: `${mediaFilePaths.length} file(s) attached successfully!`,
                                    type: 'success'
                                });
                            }
                            // Handle single file (from uploadFile or direct attach)
                            else if (mediaFilePath || mediaPath) {
                                const filePath = mediaFilePath || mediaPath || '';
                                const mediaFiles = [{
                                    mediaPath: mediaPath || filePath,
                                    mediaFilePath: filePath,
                                    fileName: fileName || filePath.split(/[/\\]/).pop() || 'unknown',
                                    fileSize: fileSize || 0
                                }];

                                webviewView.webview.postMessage({
                                    command: 'mediaAttached',
                                    mediaFiles: mediaFiles
                                });

                                webviewView.webview.postMessage({
                                    command: 'status',
                                    status: `File attached successfully!`,
                                    type: 'success'
                                });
                            } else {
                                webviewView.webview.postMessage({
                                    command: 'status',
                                    status: 'No media files provided for attachment.',
                                    type: 'error'
                                });
                            }
                        } catch (error: unknown) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            webviewView.webview.postMessage({
                                command: 'status',
                                status: `Error attaching media: ${errorMessage}`,
                                type: 'error'
                            });
                        }
                        return;
                    }
                    case 'removeMedia': {
                        try {
                            // Handle media removal
                            webviewView.webview.postMessage({
                                command: 'mediaRemoved'
                            });

                            webviewView.webview.postMessage({
                                command: 'status',
                                status: 'Media attachment removed.',
                                type: 'success'
                            });
                        } catch (error: unknown) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            webviewView.webview.postMessage({
                                command: 'status',
                                status: `Error removing media: ${errorMessage}`,
                                type: 'error'
                            });
                        }
                        return;
                    }
                    default:
                        console.log('Unhandled message:', message.command);
                        return;
                }
            },
            undefined,
            this._context.subscriptions
        );
    }

    private _generatePostId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private _savePostToHistory(aiProvider: 'gemini' | 'openai' | 'xai', aiModel: string, postData: PostData): void {
        const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
        const historicalPost: HistoricalPost = {
            id: this._generatePostId(),
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

    private _recordShare(postId: string, platform: 'linkedin' | 'telegram' | 'facebook' | 'discord' | 'x' | 'reddit' | 'bluesky', success: boolean, errorMessage?: string, postIdOnPlatform?: string): void {
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

    private async _loadFromSecretsOrDefault(secretKey: string): Promise<string> {
        const storageManager = new (await import('./storage-manager')).StorageManager(this._context);
        return await storageManager.loadFromSecretsOrDefault(secretKey);
    }

    private async _loadConfiguration(webviewView: vscode.WebviewView): Promise<void> {
        try {
            const storageManager = new (await import('./storage-manager')).StorageManager(this._context);
            const config = await storageManager.loadConfiguration();

            webviewView.webview.postMessage({
                command: 'updateConfiguration',
                selectedModel: config.selectedModel ? { ...config.selectedModel, apiKey: config.apiKey } : config.selectedModel,
                linkedinToken: config.linkedinToken,
                telegramBot: config.telegramBot,
                telegramChat: config.telegramChat,
                xAccessToken: config.xAccessToken,
                xAccessSecret: config.xAccessSecret,
                facebookToken: config.facebookToken,
                facebookPageToken: config.facebookPageToken,
                facebookPageId: config.facebookPageId,
                discordWebhookUrl: config.discordWebhookUrl,
                redditAccessToken: config.redditAccessToken,
                redditRefreshToken: config.redditRefreshToken,
                redditClientId: config.redditClientId,
                redditClientSecret: config.redditClientSecret,
                redditUsername: config.redditUsername,
                redditPassword: config.redditPassword,
                redditApiName: config.redditApiName,
                blueskyIdentifier: config.blueskyIdentifier,
                blueskyPassword: config.blueskyPassword
            });
        } catch (error) {
            console.error('Error loading configuration:', error);
        }
    }

    private async _loadScheduledPosts(webviewView: vscode.WebviewView): Promise<void> {
        try {
            const scheduledPosts = this._scheduledPostsStorage.loadScheduledPosts();

            // Start the scheduler if there are scheduled posts and it's not already running
            if (scheduledPosts.length > 0 && !this._scheduler) {
                const storagePath = this._context.globalStorageUri?.fsPath || this._context.extensionPath;
                const credentialsGetter = async () => ({
                    linkedinToken: await this._context.secrets.get('linkedinToken') || '',
                    telegramBot: await this._context.secrets.get('telegramBot') || '',
                    telegramChat: await this._context.secrets.get('telegramChat') || ''
                });
                this._scheduler = new Scheduler(storagePath, undefined, credentialsGetter);
                this._scheduler.start();
                console.log('Scheduler started for existing scheduled posts');
            }

            webviewView.webview.postMessage({
                command: 'updateScheduledPosts',
                scheduledPosts: scheduledPosts
            });
        } catch (error) {
            console.error('Error loading scheduled posts:', error);
        }
    }

    private async _loadPostHistory(webviewView: vscode.WebviewView): Promise<void> {
        try {
            const postHistory = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
            const analytics = this._calculateAnalytics();

            webviewView.webview.postMessage({
                command: 'updatePostHistory',
                postHistory: postHistory
            });

            webviewView.webview.postMessage({
                command: 'updateAnalytics',
                analytics: analytics
            });
        } catch (error) {
            console.error('Error loading post history:', error);
        }
    }

    private _calculateAnalytics(): AnalyticsSummary {
        const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);

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
                    case 'linkedin':
                        linkedinShares++;
                        break;
                    case 'telegram':
                        telegramShares++;
                        break;
                    case 'x':
                        xShares++;
                        break;
                    case 'facebook':
                        facebookShares++;
                        break;
                    case 'discord':
                        discordShares++;
                        break;
                    case 'reddit':
                        redditShares++;
                        break;
                    case 'bluesky':
                        blueskyShares++;
                        break;
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

    private async shareToFacebookWithUpdate(webviewView: vscode.WebviewView, post: PostData, message: unknown, postId: string | undefined): Promise<void> {
        void webviewView, void post, void message, void postId;
        throw new Error('Facebook sharing not yet implemented');
    }

    private async shareToDiscordWithUpdate(webviewView: vscode.WebviewView, post: PostData, message: unknown, postId: string | undefined): Promise<void> {
        void webviewView, void post, void message, void postId;
        throw new Error('Discord sharing not yet implemented');
    }

    private async shareToXWithUpdate(webviewView: vscode.WebviewView, post: PostData, message: unknown, postId: string | undefined): Promise<void> {
        void webviewView, void post, void message, void postId;
        throw new Error('X/Twitter sharing not yet implemented');
    }

    private async shareToRedditWithUpdate(webviewView: vscode.WebviewView, post: PostData, message: unknown, postId: string | undefined): Promise<string | undefined> {
        try {
            const msg = message as { redditAccessToken?: string; redditRefreshToken?: string; post?: string; redditSubreddit?: string; redditTitle?: string; redditFlairId?: string; redditPostType?: string; redditSpoiler?: boolean };
            const { shareToReddit } = await import('./reddit');
            const credentials = {
                accessToken: msg.redditAccessToken || '',
                refreshToken: msg.redditRefreshToken || undefined // Allow undefined for script apps
            };

            // Create Reddit post data from message
            const redditPostData = {
                text: msg.post || '',
                media: post.media, // Pass through any media
                subreddit: msg.redditSubreddit?.startsWith('r/') ? msg.redditSubreddit.substring(2) : msg.redditSubreddit || '',
                title: msg.redditTitle || '',
                flairId: msg.redditFlairId,
                isSelfPost: msg.redditPostType !== 'link',
                spoiler: msg.redditSpoiler
            };

            const postIdOnPlatform = await shareToReddit(credentials.accessToken, credentials.refreshToken, redditPostData);

            // Record the share
            if (postId) {
                this._recordShare(postId, 'reddit', true, undefined, postIdOnPlatform);
            }

            webviewView.webview.postMessage({ command: 'status', status: 'Successfully posted to Reddit!', type: 'success' });
            return postIdOnPlatform;
        } catch (error: unknown) {
            console.error('Error sharing to Reddit:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (postId) {
                this._recordShare(postId, 'reddit', false, errorMessage);
            }

            throw new Error(`Reddit sharing failed: ${errorMessage}`);
        }
    }

    private async shareToLinkedInWithUpdate(webviewView: vscode.WebviewView, post: PostData, message: unknown, postId: string | undefined): Promise<void> {
        try {
            const msg = message as { linkedinToken?: string };

            const { shareToLinkedIn } = await import('./linkedin');

            await shareToLinkedIn(post, msg.linkedinToken || await this._context.secrets.get('linkedinToken') || '', {
                onSuccess: (message: string) => {
                    webviewView.webview.postMessage({ command: 'status', status: message, type: 'success' });
                    if (postId) {
                        this._recordShare(postId, 'linkedin', true);
                    }
                },
                onError: (message: string) => {
                    webviewView.webview.postMessage({ command: 'status', status: message, type: 'error' });
                    if (postId) {
                        this._recordShare(postId, 'linkedin', false, message);
                    }
                }
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            webviewView.webview.postMessage({ command: 'status', status: `Error sharing to LinkedIn: ${errorMessage}`, type: 'error' });
            if (postId) {
                this._recordShare(postId, 'linkedin', false, errorMessage);
            }
        }
    }

    private async shareToTelegramWithUpdate(webviewView: vscode.WebviewView, post: PostData, message: unknown, postId: string | undefined): Promise<void> {
        try {
            const msg = message as { telegramBot?: string; telegramChat?: string };
            const telegramBot = msg.telegramBot || await this._context.secrets.get('telegramBot') || '';
            const telegramChat = msg.telegramChat || await this._context.secrets.get('telegramChat') || '';

            console.log('DEBUG: Telegram sharing with bot:', !!telegramBot, 'chat:', !!telegramChat, 'post:', post.text);

            const { shareToTelegram } = await import('./telegram');

            await shareToTelegram(post, telegramBot, telegramChat, {
                onSuccess: (message: string) => {
                    webviewView.webview.postMessage({ command: 'status', status: message, type: 'success' });
                    if (postId) {
                        this._recordShare(postId, 'telegram', true);
                    }
                },
                onError: (message: string) => {
                    webviewView.webview.postMessage({ command: 'status', status: message, type: 'error' });
                    if (postId) {
                        this._recordShare(postId, 'telegram', false, message);
                    }
                }
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            webviewView.webview.postMessage({ command: 'status', status: `Error sharing to Telegram: ${errorMessage}`, type: 'error' });
            if (postId) {
                this._recordShare(postId, 'telegram', false, errorMessage);
            }
        }
    }

    private async shareToBlueSkyWithUpdate(webviewView: vscode.WebviewView, post: PostData, message: unknown, postId: string | undefined): Promise<void> {
                void webviewView, void post, void message, void postId;
        throw new Error('BlueSky sharing not yet implemented');
    }

    private async unifiedSharePost(webviewView: vscode.WebviewView, platforms: string[], post: PostData, mediaFilePaths: string[] = [], postId?: string): Promise<void> {
        const results = {
            linkedin: false,
            telegram: false,
            x: false,
            facebook: false,
            discord: false,
            reddit: false,
            bluesky: false
        };

        let firstError: string | null = null;

        // Share to each selected platform
        for (const platform of platforms) {
            try {
                const platformMessage = { ...post, mediaFilePaths };

                switch (platform) {
                    case 'linkedin':
                        await this.shareToLinkedInWithUpdate(webviewView, platformMessage, platformMessage, postId);
                        results.linkedin = true;
                        break;
                    case 'telegram':
                        await this.shareToTelegramWithUpdate(webviewView, platformMessage, platformMessage, postId);
                        results.telegram = true;
                        break;
                    case 'x':
                        await this.shareToXWithUpdate(webviewView, platformMessage, platformMessage, postId);
                        results.x = true;
                        break;
                    case 'facebook':
                        await this.shareToFacebookWithUpdate(webviewView, platformMessage, platformMessage, postId);
                        results.facebook = true;
                        break;
                    case 'discord':
                        await this.shareToDiscordWithUpdate(webviewView, platformMessage, platformMessage, postId);
                        results.discord = true;
                        break;
                    case 'reddit': {
                        const redditMessage = {
                            redditAccessToken: await this._context.secrets.get('redditAccessToken') || '',
                            redditRefreshToken: await this._context.secrets.get('redditRefreshToken') || '',
                            subreddit: 'test', // This should be configurable in the UI
                            title: post.text?.substring(0, 300) || 'Post from DotShare',
                            post: post.text,
                            mediaFilePaths: mediaFilePaths
                        };
                        await this.shareToRedditWithUpdate(webviewView, platformMessage, redditMessage, postId);
                        results.reddit = true;
                        break;
                    }
                    case 'bluesky':
                        await this.shareToBlueSkyWithUpdate(webviewView, platformMessage, platformMessage, postId);
                        results.bluesky = true;
                        break;
                    default:
                        console.warn(`Unknown platform: ${platform}`);
                }
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Error sharing to ${platform}:`, error);

                if (!firstError) {
                    firstError = `Error sharing to ${platform}: ${errorMessage}`;
                }

                // Record failure for this platform
                if (postId) {
                    const platformKey = platform as keyof typeof results;
                    if (platformKey in results) {
                        this._recordShare(postId, platform as 'linkedin' | 'telegram' | 'facebook' | 'discord' | 'x' | 'reddit' | 'bluesky', false, errorMessage);
                    }
                }
            }
        }

        // Count successful shares
        const successfulShares = Object.values(results).filter(success => success).length;

        if (platforms.length === 0) {
            webviewView.webview.postMessage({ command: 'status', status: 'No platforms selected', type: 'error' });
        } else if (successfulShares === platforms.length) {
            webviewView.webview.postMessage({
                command: 'status',
                status: `Successfully shared to all ${platforms.length} platform(s)!`,
                type: 'success'
            });
        } else if (successfulShares > 0) {
            webviewView.webview.postMessage({
                command: 'status',
                status: `Shared to ${successfulShares}/${platforms.length} platform(s). Check for any errors above.`,
                type: firstError ? 'error' : 'warning'
            });
        } else {
            webviewView.webview.postMessage({
                command: 'status',
                status: `Failed to share to any platforms. ${firstError || ''}`,
                type: 'error'
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const indexPath = path.join(this._extensionUri.fsPath, 'media', 'index.html');
        let html = fs.readFileSync(indexPath, 'utf-8');

        // Replace resource paths with webview URIs
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'assets', 'style.css'));
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'app.js'));

        html = html.replace('./assets/style.css', cssUri.toString());
        html = html.replace('./app.js', jsUri.toString());

        return html;
    }
}

export function deactivate(): void {
    // Cleanup if needed - currently no resources to clean up
}
