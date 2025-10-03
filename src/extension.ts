import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { generatePost as generateGeminiPost, getAvailableModels as getGeminiModels } from './gemini';
import { generatePost as generateOpenAIPost, getAvailableModels as getOpenAIModels } from './openai';
import { generatePost as generateXAIPost, getAvailableModels as getXAIModels } from './xai';
import { shareToLinkedIn } from './linkedin';
import { shareToTelegram } from './telegram';
import { ScheduledPostsStorage, generateScheduledPostId } from './scheduled-posts';
import { Scheduler } from './scheduler';
import { PostData, HistoricalPost, ShareRecord, AnalyticsSummary, ScheduledPost } from './types';

export function activate(context: vscode.ExtensionContext) {
    console.log('DotShare extension is now active!');

    // Command for generating post
    let generateDisposable = vscode.commands.registerCommand('dotshare.generatePost', () => {
        vscode.window.showInformationMessage('Please use the DotShare activity bar panel to enter API keys and generate posts.');
    });

    // Command for LinkedIn
    let linkedinDisposable = vscode.commands.registerCommand('dotshare.shareToLinkedIn', () => {
        vscode.window.showInformationMessage('Please use the DotShare activity bar panel to share to LinkedIn.');
    });

    // Command for Telegram
    let telegramDisposable = vscode.commands.registerCommand('dotshare.shareToTelegram', () => {
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
            storagePath = path.join(require('os').tmpdir(), 'dotshare-scheduled');
            try {
                if (!fs.existsSync(storagePath)) {
                    fs.mkdirSync(storagePath, { recursive: true });
                }
            } catch (tempError) {
                console.error('Even temp directory creation failed:', tempError);
                // Last resort - use system temp
                storagePath = require('os').tmpdir();
            }
        }

        this._scheduledPostsStorage = new ScheduledPostsStorage(storagePath);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Load initial data when webview is ready
        setImmediate(async () => {
            try {
                // Load saved configuration (API keys and social media tokens)
                await this._loadConfiguration(webviewView);

                // Load scheduled posts
                await this._loadScheduledPosts(webviewView);

                // Load post history and analytics
                await this._loadPostHistory(webviewView);
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
                                } catch (retryError: any) {
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

                            // Securely store API keys and save model selection for persistence
                            if (message.selectedModel) {
                                await this._context.secrets.store(`${message.selectedModel.provider}ApiKey`, message.selectedModel.apiKey);
                                // Also save model selection (without API key for security)
                                const modelForStorage = { provider, model, apiKey: '' };
                                this._context.globalState.update('selectedModel', modelForStorage);
                            }
                            }
                        } catch (error: any) {
                            let errorMessage = 'Error generating post.';
                            if (error.message.includes('API key')) {
                                errorMessage = 'Invalid API key. Check your credentials.';
                            } else if (error.message.includes('rate limit')) {
                                errorMessage = 'API rate limit exceeded. Try again later.';
                            } else if (error.message.includes('network')) {
                                errorMessage = 'Network error. Check your connection.';
                            } else {
                                errorMessage = `AI service error: ${error.message}`;
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
                        } catch (error: any) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error saving LinkedIn token: ${error.message}`, type: 'error' });
                        }
                        return;
                    case 'saveTelegramCredentials':
                        try {
                            await this._context.secrets.store('telegramBot', message.telegramBot || '');
                            await this._context.secrets.store('telegramChat', message.telegramChat || '');
                            webviewView.webview.postMessage({ command: 'status', status: 'Telegram credentials saved!', type: 'success' });
                        } catch (error: any) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error saving Telegram credentials: ${error.message}`, type: 'error' });
                        }
                        return;
                    case 'loadConfiguration':
                        const savedModel = this._context.globalState.get('selectedModel') as any;
                        let apiKey = '';
                        if (savedModel) {
                            apiKey = await this._context.secrets.get(`${savedModel.provider}ApiKey`) || '';
                        }
                        // Get social media tokens from secrets
                        const savedLinkedInToken = await this._context.secrets.get('linkedinToken') || '';
                        const savedTelegramBot = await this._context.secrets.get('telegramBot') || '';
                        const savedTelegramChat = await this._context.secrets.get('telegramChat') || '';
                        webviewView.webview.postMessage({
                            command: 'updateConfiguration',
                            selectedModel: savedModel ? { ...savedModel, apiKey } : savedModel,
                            linkedinToken: savedLinkedInToken,
                            telegramBot: savedTelegramBot,
                            telegramChat: savedTelegramChat
                        });
                        return;
                    case 'fetchModels':
                        try {
                            const { provider, apiKey } = message;
                            let models: string[] = [];
                            if (provider === 'gemini') {
                                models = apiKey ? await getGeminiModels(apiKey) : [];
                            } else if (provider === 'openai') {
                                models = apiKey ? await getOpenAIModels(apiKey) : [];
                            } else if (provider === 'xai') {
                                models = apiKey ? await getXAIModels(apiKey) : [];
                            }

                            webviewView.webview.postMessage({
                                command: 'updateModels',
                                [`${provider}Models`]: models,
                                provider: provider // Send back the provider to update the correct dropdown
                            });
                        } catch (error: any) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error fetching models: ${error.message}`, type: 'error' });
                        }
                        return;
                    case 'shareToLinkedIn':
                        try {
                            const linkedinPost = this._context.globalState.get('lastPost') as PostData;
                            if (!linkedinPost) {
                                webviewView.webview.postMessage({ command: 'status', status: 'Error: No post generated. Generate first.', type: 'error' });
                                return;
                            }

                            // Get the most recent post ID from history
                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            await shareToLinkedIn(linkedinPost, message.linkedinToken);
                            await this._context.secrets.store('linkedinToken', message.linkedinToken);

                            // Record successful share
                            if (postId) {
                                this._recordShare(postId, 'linkedin', true);
                            }

                            webviewView.webview.postMessage({ command: 'status', status: 'Shared to LinkedIn!', type: 'success' });
                        } catch (error: any) {
                            // Get the most recent post ID from history for error recording
                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            // Record failed share
                            if (postId) {
                                this._recordShare(postId, 'linkedin', false, error.message);
                            }

                            webviewView.webview.postMessage({ command: 'status', status: `Error sharing to LinkedIn: ${error.message}`, type: 'error' });
                        }
                        return;
                    case 'shareToTelegram':
                        try {
                            const telegramPost = this._context.globalState.get('lastPost') as PostData;
                            if (!telegramPost) {
                                webviewView.webview.postMessage({ command: 'status', status: 'Error: No post generated. Generate first.', type: 'error' });
                                return;
                            }

                            // Get the most recent post ID from history
                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            await shareToTelegram(telegramPost, message.telegramBot, message.telegramChat);
                            await this._context.secrets.store('telegramBot', message.telegramBot);
                            await this._context.secrets.store('telegramChat', message.telegramChat);

                            // Record successful share
                            if (postId) {
                                this._recordShare(postId, 'telegram', true);
                            }

                            webviewView.webview.postMessage({ command: 'status', status: 'Shared to Telegram!', type: 'success' });
                        } catch (error: any) {
                            // Get the most recent post ID from history for error recording
                            const history = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                            const mostRecentPost = history[0];
                            const postId = mostRecentPost?.id;

                            // Record failed share
                            if (postId) {
                                this._recordShare(postId, 'telegram', false, error.message);
                            }

                            webviewView.webview.postMessage({ command: 'status', status: `Error sharing to Telegram: ${error.message}`, type: 'error' });
                        }
                        return;
                    case 'updatePost':
                        const previousPost = this._context.globalState.get('lastPost') as PostData;
                        if (message.post && previousPost) {
                            this._context.globalState.update('lastPost', { ...previousPost, text: message.post });
                        }
                        return;
                    case 'selectMediaFile':
                        try {
                            const uris = await vscode.window.showOpenDialog({
                                canSelectFiles: true,
                                canSelectFolders: false,
                                canSelectMany: true,
                                defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
                                filters: {
                                    'Images and Videos': ['jpg', 'jpeg', 'png', 'gif', 'mp4']
                                },
                                openLabel: 'Select Media Files'
                            });

                            if (uris && uris.length > 0) {
                                const mediaFiles = [];
                                const tempDir = path.join(this._context.extensionPath, 'temp');
                                await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir));

                                for (let i = 0; i < uris.length; i++) {
                                    const fileUri = uris[i];
                                    const fileName = path.basename(fileUri.fsPath);
                                    const stats = await vscode.workspace.fs.stat(fileUri);
                                    const fileSize = stats.size;

                                    // Copy file to extension's temp directory for web access
                                    const tempFileUri = vscode.Uri.file(path.join(tempDir, `${Date.now()}_${i}_${fileName}`));
                                    await vscode.workspace.fs.copy(fileUri, tempFileUri, { overwrite: true });

                                    // Create webview accessible URI for display
                                    const mediaUri = webviewView.webview.asWebviewUri(tempFileUri);

                                    mediaFiles.push({
                                        mediaPath: mediaUri.toString(), // For webview display
                                        mediaFilePath: tempFileUri.fsPath, // For file operations
                                        fileName: fileName,
                                        fileSize: fileSize
                                    });
                                }

                                // Send array of media files
                                webviewView.webview.postMessage({
                                    command: 'mediaSelected',
                                    mediaFiles: mediaFiles
                                });
                            }
                        } catch (error: any) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error selecting files: ${error.message}`, type: 'error' });
                        }
                        return;
                    case 'attachMedia':
                        if (message.mediaFilePaths && message.mediaFilePaths.length > 0) {
                            const currentPost = this._context.globalState.get('lastPost') as PostData;
                            if (currentPost) {
                                // Store array of filesystem paths for file operations, not webview URLs
                                const updatedPost = { ...currentPost, media: message.mediaFilePaths };
                                this._context.globalState.update('lastPost', updatedPost);
                            }
                        }
                        return;
                    case 'removeMedia':
                        const currentPost = this._context.globalState.get('lastPost') as PostData;
                        if (currentPost) {
                            const updatedPost = { ...currentPost, media: undefined };
                            this._context.globalState.update('lastPost', updatedPost);
                        }
                        return;
                    case 'removeSingleMedia':
                        if (message.mediaFilePath) {
                            const currentPost = this._context.globalState.get('lastPost') as PostData;
                            if (currentPost && currentPost.media && Array.isArray(currentPost.media)) {
                                // Remove the specific file from the media array
                                const updatedMedia = currentPost.media.filter(path => path !== message.mediaFilePath);
                                const updatedPost = {
                                    ...currentPost,
                                    media: updatedMedia.length > 0 ? updatedMedia : undefined
                                };
                                this._context.globalState.update('lastPost', updatedPost);
                            }
                        }
                        return;
                    case 'loadPostHistory':
                        const postHistory = this._context.globalState.get('postHistory', [] as HistoricalPost[]);
                        webviewView.webview.postMessage({
                            command: 'updatePostHistory',
                            postHistory: postHistory
                        });
                        return;
                    case 'loadAnalytics':
                        const analytics = this._calculateAnalytics();
                        webviewView.webview.postMessage({
                            command: 'updateAnalytics',
                            analytics: analytics
                        });
                        return;
                    case 'loadScheduledPosts':
                        const scheduledPosts = this._scheduledPostsStorage.loadScheduledPosts();
                        webviewView.webview.postMessage({
                            command: 'updateScheduledPosts',
                            scheduledPosts: scheduledPosts
                        });
                        return;
                    case 'schedulePost':
                        try {
                            if (!message.scheduledTime || !message.selectedPlatforms || message.selectedPlatforms.length === 0) {
                                webviewView.webview.postMessage({ command: 'status', status: 'Please select date/time and at least one platform.', type: 'error' });
                                return;
                            }

                            const currentPost = this._context.globalState.get('lastPost') as PostData;
                            if (!currentPost || !currentPost.text) {
                                webviewView.webview.postMessage({ command: 'status', status: 'No post to schedule. Generate a post first.', type: 'error' });
                                return;
                            }

                            const selectedModel = this._context.globalState.get('selectedModel') as any;

                            const scheduledPost: ScheduledPost = {
                                id: generateScheduledPostId(),
                                scheduledTime: message.scheduledTime,
                                postData: currentPost,
                                aiProvider: selectedModel?.provider || 'gemini',
                                aiModel: selectedModel?.model || 'gemini-2.5-flash',
                                platforms: message.selectedPlatforms,
                                status: 'scheduled',
                                created: new Date().toISOString()
                            };

                            this._scheduledPostsStorage.addScheduledPost(scheduledPost);

                            // Initialize scheduler if not already done
                            if (!this._scheduler) {
                                const storagePath = this._context.globalStorageUri?.fsPath || this._context.extensionPath;
                                const credentialsGetter = async () => ({
                                    linkedinToken: await this._context.secrets.get('linkedinToken') || '',
                                    telegramBot: await this._context.secrets.get('telegramBot') || '',
                                    telegramChat: await this._context.secrets.get('telegramChat') || ''
                                });
                                this._scheduler = new Scheduler(storagePath, undefined, credentialsGetter);
                                this._scheduler.start();
                            }

                            webviewView.webview.postMessage({ command: 'status', status: 'Post scheduled successfully!', type: 'success' });

                            // Reload scheduled posts to update the UI
                            const updatedPosts = this._scheduledPostsStorage.loadScheduledPosts();
                            webviewView.webview.postMessage({
                                command: 'updateScheduledPosts',
                                scheduledPosts: updatedPosts
                            });
                        } catch (error: any) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error scheduling post: ${error.message}`, type: 'error' });
                        }
                        return;
                    case 'deleteScheduledPost':
                        try {
                            if (!message.scheduledPostId) {
                                webviewView.webview.postMessage({ command: 'status', status: 'No post selected for deletion.', type: 'error' });
                                return;
                            }

                            this._scheduledPostsStorage.removeScheduledPost(message.scheduledPostId);
                            webviewView.webview.postMessage({ command: 'status', status: 'Scheduled post deleted successfully!', type: 'success' });

                            // Reload scheduled posts
                            const updatedPosts = this._scheduledPostsStorage.loadScheduledPosts();
                            webviewView.webview.postMessage({
                                command: 'updateScheduledPosts',
                                scheduledPosts: updatedPosts
                            });
                        } catch (error: any) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error deleting scheduled post: ${error.message}`, type: 'error' });
                        }
                        return;
                    case 'retryScheduledPost':
                        try {
                            if (!message.scheduledPostId) {
                                webviewView.webview.postMessage({ command: 'status', status: 'No post selected for retry.', type: 'error' });
                                return;
                            }

                            // Reset the post to scheduled status and clear error messages
                            this._scheduledPostsStorage.updateScheduledPost(message.scheduledPostId, {
                                status: 'scheduled',
                                errorMessage: undefined,
                                platformResults: undefined,
                                postedTime: undefined
                            });

                            webviewView.webview.postMessage({ command: 'status', status: 'Scheduled post queued for retry!', type: 'success' });

                            // Reload scheduled posts to refresh UI
                            const updatedPosts = this._scheduledPostsStorage.loadScheduledPosts();
                            webviewView.webview.postMessage({
                                command: 'updateScheduledPosts',
                                scheduledPosts: updatedPosts
                            });
                        } catch (error: any) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error retrying scheduled post: ${error.message}`, type: 'error' });
                        }
                        return;
                    case 'editScheduledPost':
                        try {
                            if (!message.scheduledPostId) {
                                webviewView.webview.postMessage({ command: 'status', status: 'No post selected for editing.', type: 'error' });
                                return;
                            }

                            const updates: Partial<ScheduledPost> = {};

                            // Update scheduled time if provided
                            if (message.scheduledTime) {
                                updates.scheduledTime = message.scheduledTime;
                            }

                            // Update platforms if provided
                            if (message.selectedPlatforms) {
                                updates.platforms = message.selectedPlatforms;
                            }

                            // Update post text if provided
                            if (message.postText !== undefined) {
                                // Get the existing post to preserve media if not changing it
                                const existingPost = this._scheduledPostsStorage.loadScheduledPosts().find(p => p.id === message.scheduledPostId);
                                if (existingPost) {
                                    updates.postData = {
                                        text: message.postText,
                                        media: existingPost.postData.media // Preserve existing media
                                    };
                                } else {
                                    updates.postData = { text: message.postText };
                                }
                            }

                            // Always reset status to scheduled and clear errors when editing
                            updates.status = 'scheduled';
                            updates.errorMessage = undefined;
                            updates.platformResults = undefined;
                            updates.postedTime = undefined;

                            this._scheduledPostsStorage.updateScheduledPost(message.scheduledPostId, updates);

                            webviewView.webview.postMessage({ command: 'status', status: 'Scheduled post updated successfully!', type: 'success' });

                            // Reload scheduled posts to refresh UI
                            const updatedPosts = this._scheduledPostsStorage.loadScheduledPosts();
                            webviewView.webview.postMessage({
                                command: 'updateScheduledPosts',
                                scheduledPosts: updatedPosts
                            });
                        } catch (error: any) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error updating scheduled post: ${error.message}`, type: 'error' });
                        }
                        return;
                    case 'confirmDeleteScheduledPost':
                        try {
                            const result = await vscode.window.showWarningMessage(
                                'Are you sure you want to delete this scheduled post?',
                                { modal: true },
                                'Delete'
                            );

                            if (result === 'Delete') {
                                this._scheduledPostsStorage.removeScheduledPost(message.scheduledPostId!);
                                webviewView.webview.postMessage({ command: 'status', status: 'Scheduled post deleted successfully!', type: 'success' });

                                // Reload scheduled posts
                                const updatedPosts = this._scheduledPostsStorage.loadScheduledPosts();
                                webviewView.webview.postMessage({
                                    command: 'updateScheduledPosts',
                                    scheduledPosts: updatedPosts
                                });
                            }
                        } catch (error: any) {
                            webviewView.webview.postMessage({ command: 'status', status: `Error deleting scheduled post: ${error.message}`, type: 'error' });
                        }
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

    private _recordShare(postId: string, platform: 'linkedin' | 'telegram', success: boolean, errorMessage?: string, postIdOnPlatform?: string): void {
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

    private async _loadConfiguration(webviewView: vscode.WebviewView): Promise<void> {
        try {
            const savedModel = this._context.globalState.get('selectedModel') as any;
            let apiKey = '';
            if (savedModel) {
                try {
                    apiKey = await this._context.secrets.get(`${savedModel.provider}ApiKey`) || '';
                } catch (error) {
                    console.warn('Failed to retrieve API key from secrets:', error);
                }
            }

            // Get social media tokens from secrets
            const savedLinkedInToken = await this._context.secrets.get('linkedinToken') || '';
            const savedTelegramBot = await this._context.secrets.get('telegramBot') || '';
            const savedTelegramChat = await this._context.secrets.get('telegramChat') || '';

            webviewView.webview.postMessage({
                command: 'updateConfiguration',
                selectedModel: savedModel ? { ...savedModel, apiKey } : savedModel,
                linkedinToken: savedLinkedInToken,
                telegramBot: savedTelegramBot,
                telegramChat: savedTelegramChat
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

        let totalPosts = history.length;
        let successfulShares = 0;
        let failedShares = 0;
        let linkedinShares = 0;
        let telegramShares = 0;

        for (const post of history) {
            for (const share of post.shares) {
                if (share.platform === 'linkedin') linkedinShares++;
                if (share.platform === 'telegram') telegramShares++;

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
            successRate
        };
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const indexPath = path.join(this._extensionUri.fsPath, 'media', 'index.html');
        let html = fs.readFileSync(indexPath, 'utf-8');

        // Replace resource paths with webview URIs
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'app.js'));

        html = html.replace('./style.css', cssUri.toString());
        html = html.replace('./app.js', jsUri.toString());

        return html;
    }
}

export function deactivate() {}
