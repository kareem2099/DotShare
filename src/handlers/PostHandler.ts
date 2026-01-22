import * as vscode from 'vscode';
import { HistoryService } from '../services/HistoryService';
import { AnalyticsService } from '../services/AnalyticsService';
import { PostData } from '../types';
import { ScheduledPostsStorage, generateScheduledPostId } from '../scheduled-posts';
import { Logger } from '../utils/Logger';

// Imports for posting functions
import { generatePost as generateGeminiPost } from '../gemini';
import { generatePost as generateOpenAIPost } from '../openai';
import { generatePost as generateXAIPost } from '../xai';
import { shareToLinkedIn } from '../linkedin';
import { shareToTelegram } from '../telegram';
import { shareToReddit } from '../reddit';

interface Message {
    command: string;
    [key: string]: unknown;
}

export class PostHandler {
    constructor(
        private view: vscode.WebviewView,
        private context: vscode.ExtensionContext,
        private historyService: HistoryService,
        private analyticsService: AnalyticsService
    ) {}

    public async handleMessage(message: Message): Promise<void> {
        const cmd = message.command;

        try {
            switch (cmd) {
                case 'generatePost':
                    await this.handleGeneratePost(message);
                    break;

                case 'shareToLinkedIn':
                    await this.handleShareToLinkedIn(message);
                    break;

                case 'shareToTelegram':
                    await this.handleShareToTelegram(message);
                    break;

                case 'shareToFacebook':
                    await this.handleShareToFacebook();
                    break;

                case 'shareToDiscord':
                    await this.handleShareToDiscord();
                    break;

                case 'shareToX':
                    await this.handleShareToX();
                    break;

                case 'shareToReddit':
                    await this.handleShareToReddit(message);
                    break;

                case 'shareToBlueSky':
                    await this.handleShareToBlueSky();
                    break;

                case 'share':
                    await this.handleUnifiedShare(message);
                    break;

                case 'loadPostHistory':
                    await this.handleLoadHistory();
                    break;

                case 'loadAnalytics':
                    await this.handleLoadAnalytics();
                    break;

                case 'schedulePost':
                    await this.handleSchedulePost(message);
                    break;

                case 'editScheduledPost':
                    await this.handleEditScheduledPost(message);
                    break;

                case 'openSupportLink':
                    // Open Buy Me a Coffee link in external browser
                    vscode.env.openExternal(vscode.Uri.parse('https://www.buymeacoffee.com/freerave'));
                    break;

                default:
                    Logger.info('PostHandler: Unhandled command:', cmd);
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Post error: ${errorMessage}`);
        }
    }

    private async handleGeneratePost(message: Message): Promise<void> {
        const selectedModel = message.selectedModel as { provider: string; apiKey: string; model: string } | undefined;
        if (!selectedModel || !selectedModel.apiKey) {
            vscode.window.showErrorMessage('API Key is required to generate posts.');
            return;
        }

        const { provider, apiKey, model } = selectedModel;
        let post: PostData | null = null;

        let retryCount = 0;
        const maxRetries = 1;
        while (retryCount <= maxRetries) {
            try {
                if (provider === 'gemini') post = await generateGeminiPost(apiKey, model);
                else if (provider === 'openai') post = await generateOpenAIPost(apiKey, model);
                else if (provider === 'xai') post = await generateXAIPost(apiKey, model);
                else {
                    this.sendError('Unsupported AI provider.');
                    return;
                }
                break;
            } catch (retryError: unknown) {
                retryCount++;
                if (retryCount > maxRetries) {
                    throw retryError;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (post) {
            this.historyService.savePost(provider as 'gemini' | 'openai' | 'xai', model, post);
            this.view.webview.postMessage({ command: 'updatePost', post: post.text });

            const history = this.historyService.getHistory();
            const analytics = this.analyticsService.calculate(history);
            this.view.webview.postMessage({ command: 'updateAnalytics', analytics });

            await this.context.secrets.store(`${provider}ApiKey`, apiKey);
            const modelForStorage = { provider, model, apiKey: '' };
            this.context.globalState.update('selectedModel', modelForStorage);
        }
    }

    private async handleShareToLinkedIn(message: Message): Promise<void> {
        const msg = message as { linkedinToken?: string; post?: string; mediaFilePaths?: string[] };
        const postText = msg.post || '';
        const mediaPaths = msg.mediaFilePaths || [];

        const linkedinPost: PostData = {
            text: postText,
            media: mediaPaths
        };

        await this.shareToLinkedInWithUpdate(linkedinPost, msg.linkedinToken, undefined);
    }

    private async handleShareToTelegram(message: Message): Promise<void> {
        const msg = message as { telegramBot?: string; telegramChat?: string; post?: string; mediaFilePaths?: string[] };
        const postText = msg.post || '';
        const mediaPaths = msg.mediaFilePaths || [];

        const telegramPost: PostData = {
            text: postText,
            media: mediaPaths
        };

        await this.shareToTelegramWithUpdate(telegramPost, msg.telegramBot, msg.telegramChat, undefined);
    }

    private async handleShareToFacebook(): Promise<void> {
        const facebookPost = this.historyService.getLastPost();
        if (!facebookPost) {
            this.sendError('No post generated. Generate first.');
            return;
        }

        const history = this.historyService.getHistory();
        const mostRecentPost = history[0];
        const postId = mostRecentPost?.id;

        await this.shareToFacebookWithUpdate(facebookPost, postId);
    }

    private async handleShareToDiscord(): Promise<void> {
        const discordPost = this.historyService.getLastPost();
        if (!discordPost) {
            this.sendError('No post generated. Generate first.');
            return;
        }

        const history = this.historyService.getHistory();
        const mostRecentPost = history[0];
        const postId = mostRecentPost?.id;

        await this.shareToDiscordWithUpdate(discordPost, postId);
    }

    private async handleShareToX(): Promise<void> {
        const xPost = this.historyService.getLastPost();
        if (!xPost) {
            this.sendError('No post generated. Generate first.');
            return;
        }

        const history = this.historyService.getHistory();
        const mostRecentPost = history[0];
        const postId = mostRecentPost?.id;

        await this.shareToXWithUpdate(xPost, postId);
    }

    private async handleShareToReddit(message: Message): Promise<void> {
        const msg = message as { redditAccessToken?: string; redditRefreshToken?: string; post?: string; mediaFilePaths?: string[] };
        const postText = msg.post || '';
        const mediaPaths = msg.mediaFilePaths || [];

        const redditPost: PostData = {
            text: postText,
            media: mediaPaths
        };

        await this.shareToRedditWithUpdate(redditPost, message, undefined);
    }

    private async handleShareToBlueSky(): Promise<void> {
        const blueskyPost = this.historyService.getLastPost();
        if (!blueskyPost) {
            this.sendError('No post generated. Generate first.');
            return;
        }

        const history = this.historyService.getHistory();
        const mostRecentPost = history[0];
        const postId = mostRecentPost?.id;

        await this.shareToBlueSkyWithUpdate(blueskyPost, postId);
    }

    private async handleUnifiedShare(message: Message): Promise<void> {
        const platforms = message.platforms as string[];
        const post = message.post as string;
        const mediaFilePaths = message.mediaFilePaths as string[] | undefined;

        if (!platforms || platforms.length === 0) {
            this.sendError('No platforms selected');
            return;
        }

        if (!post || !post.trim()) {
            this.sendError('Post content is required');
            return;
        }

        const postData: PostData = {
            text: post.trim(),
            media: mediaFilePaths || []
        };

        const history = this.historyService.getHistory();
        const mostRecentPost = history[0];
        const postId = mostRecentPost?.id;

        this.view.webview.postMessage({
            command: 'status',
            status: `Sharing to ${platforms.length} platform(s)...`,
            type: 'info'
        });

        await this.unifiedSharePost(platforms, postData, mediaFilePaths, postId);
    }

    private async handleLoadHistory(): Promise<void> {
        const postHistory = this.historyService.getHistory();
        const analytics = this.analyticsService.calculate(postHistory);

        this.view.webview.postMessage({
            command: 'updatePostHistory',
            postHistory: postHistory
        });

        this.view.webview.postMessage({
            command: 'updateAnalytics',
            analytics: analytics
        });
    }

    private async handleLoadAnalytics(): Promise<void> {
        const analytics = this.analyticsService.calculate(this.historyService.getHistory());
        this.view.webview.postMessage({
            command: 'updateAnalytics',
            analytics: analytics
        });
    }

    private async handleEditScheduledPost(message: Message): Promise<void> {
        const msg = message as unknown as {
            scheduledPostId: string;
            scheduledTime: string;
            selectedPlatforms: string[];
            postText?: string;
        };

        if (!msg.scheduledPostId || !msg.scheduledTime || !msg.selectedPlatforms || msg.selectedPlatforms.length === 0) {
            this.sendError('Invalid edit data: missing post ID, time or platforms');
            return;
        }

        const storagePath = this.context.globalStorageUri ? this.context.globalStorageUri.fsPath : this.context.extensionPath;
        const scheduledStorage = new ScheduledPostsStorage(storagePath);

        // Ensure scheduledTime has seconds for consistency
        const scheduledTimeLocal = msg.scheduledTime.length === 16 ? msg.scheduledTime + ':00' : msg.scheduledTime;

        // Check if scheduled time is in the future
        const scheduleDate = new Date(scheduledTimeLocal);
        const now = new Date();

        if (scheduleDate <= now) {
            this.sendError('Scheduled time must be in the future.');
            return;
        }

        try {
            // Update the scheduled post
            scheduledStorage.updateScheduledPost(msg.scheduledPostId, {
                scheduledTime: scheduledTimeLocal,
                platforms: msg.selectedPlatforms as ('linkedin' | 'telegram' | 'x' | 'facebook' | 'discord' | 'reddit' | 'bluesky')[],
                postData: msg.postText ? { text: msg.postText, media: [] } : undefined // Preserve existing media if not updating text
            });

            // Update UI
            const allScheduledPosts = scheduledStorage.loadScheduledPosts();
            this.view.webview.postMessage({
                command: 'updateScheduledPosts',
                scheduledPosts: allScheduledPosts
            });

            this.sendSuccess('Scheduled post updated successfully!');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.info('Error editing scheduled post:', errorMessage);
            this.sendError(`Failed to update scheduled post: ${errorMessage}`);
        }
    }

    private async handleSchedulePost(message: Message): Promise<void> {
        const msg = message as unknown as {
            scheduledTime: string;
            selectedPlatforms: string[];
            postText: string;
            mediaFilePaths?: string[];
        };

        if (!msg.scheduledTime || !msg.selectedPlatforms || msg.selectedPlatforms.length === 0) {
            this.sendError('Invalid schedule data: missing time or platforms');
            return;
        }

        if (!msg.postText || !msg.postText.trim()) {
            this.sendError('Cannot schedule empty post');
            return;
        }

        const scheduledDate = new Date(msg.scheduledTime);
        const postData = {
            text: msg.postText.trim(),
            media: msg.mediaFilePaths || []
        };

        // Ensure scheduledTime has seconds for consistency
        const scheduledTimeLocal = msg.scheduledTime.length === 16 ? msg.scheduledTime + ':00' : msg.scheduledTime;

        // Logging for debugging
        Logger.debug('Schedule post input', {
            userInput: msg.scheduledTime,
            localTimeString: scheduledTimeLocal,
            parsedDate: scheduledDate,
            unixTimestamp: Math.floor(scheduledDate.getTime() / 1000)
        });

        // Setup storage
        const storagePath = this.context.globalStorageUri ? this.context.globalStorageUri.fsPath : this.context.extensionPath;
        const scheduledStorage = new ScheduledPostsStorage(storagePath);

        // Separate platforms by scheduling capability
        const nativePlatforms = msg.selectedPlatforms.filter(p => p === 'telegram');
        const localPlatforms = msg.selectedPlatforms.filter(p => p !== 'telegram');

        try {
            // Handle Telegram (Server-side scheduling)
            if (nativePlatforms.length > 0) {
                Logger.info('[DotShare] Processing server-side scheduling for Telegram...');

                // Send to Telegram API immediately with schedule date
                await this.shareToTelegramWithUpdate(
                    postData,
                    undefined, // Use stored bot token
                    undefined, // Use stored chat id
                    undefined, // No postId yet
                    scheduledDate // Server scheduling
                );

                // Store record for UI display only
                const telegramPost = {
                    id: generateScheduledPostId(),
                    scheduledTime: scheduledTimeLocal,
                    postData: postData,
                    aiProvider: 'gemini' as const,
                    aiModel: 'gemini-2.5-flash',
                    platforms: ['telegram'] as ('linkedin' | 'telegram' | 'x' | 'facebook' | 'discord' | 'reddit' | 'bluesky')[],
                    status: 'server-scheduled' as const,
                    schedulingType: 'server' as const,
                    created: new Date().toISOString()
                };

                scheduledStorage.addScheduledPost(telegramPost);
            }

            // Handle other platforms (Client-side scheduling)
            if (localPlatforms.length > 0) {
                Logger.info('[DotShare] Processing client-side scheduling for:', localPlatforms.join(', '));

                const localPost = {
                    id: generateScheduledPostId(),
                    scheduledTime: scheduledTimeLocal,
                    postData: postData,
                    aiProvider: 'gemini' as const,
                    aiModel: 'gemini-2.5-flash',
                    platforms: localPlatforms as ('linkedin' | 'telegram' | 'x' | 'facebook' | 'discord' | 'reddit' | 'bluesky')[],
                    status: 'queued' as const,
                    schedulingType: 'client' as const,
                    created: new Date().toISOString()
                };

                scheduledStorage.addScheduledPost(localPost);
            }

            // Update UI
            const allScheduledPosts = scheduledStorage.loadScheduledPosts();
            this.view.webview.postMessage({
                command: 'updateScheduledPosts',
                scheduledPosts: allScheduledPosts
            });

            // Smart nudge: If user scheduled local posts, show support hint
            if (localPlatforms.length > 0) {
                this.view.webview.postMessage({
                    command: 'status',
                    status: `Post scheduled locally! (Keep VS Code open for delivery). Want Cloud Scheduling (24/7)? Support us! ☕`,
                    type: 'warning',
                    showSupportAction: true
                });
            } else {
                this.sendSuccess(`Post scheduled successfully for ${scheduledDate.toLocaleString()}`);
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.info('Error scheduling post:', errorMessage);
            this.sendError(`Failed to schedule post: ${errorMessage}`);
        }
    }

    // Helper methods for sharing to individual platforms
    private async shareToFacebookWithUpdate(post: PostData, _postId: string | undefined): Promise<void> {
        Logger.info('Facebook sharing not yet implemented', { post, postId: _postId });
    }

    private async shareToDiscordWithUpdate(post: PostData, _postId: string | undefined): Promise<void> {
        Logger.info('Discord sharing not yet implemented', { post, postId: _postId });
    }

    private async shareToXWithUpdate(post: PostData, _postId: string | undefined): Promise<void> {
        Logger.info('X/Twitter sharing not yet implemented', { post, postId: _postId });
    }

    private async shareToRedditWithUpdate(post: PostData, message: Message, postId: string | undefined): Promise<string | undefined> {
        try {
            const msg = message as { redditAccessToken?: string; redditRefreshToken?: string; post?: string; redditSubreddit?: string; redditTitle?: string; redditFlairId?: string; redditPostType?: string; redditSpoiler?: boolean };
            const credentials = {
                accessToken: msg.redditAccessToken || '',
                refreshToken: msg.redditRefreshToken || undefined
            };

            const redditPostData = {
                text: msg.post || '',
                media: post.media,
                subreddit: msg.redditSubreddit?.startsWith('r/') ? msg.redditSubreddit.substring(2) : msg.redditSubreddit || '',
                title: msg.redditTitle || '',
                flairId: msg.redditFlairId,
                isSelfPost: msg.redditPostType !== 'link',
                spoiler: msg.redditSpoiler
            };

            const postIdOnPlatform = await shareToReddit(credentials.accessToken, credentials.refreshToken, redditPostData);

            if (postId) {
                this.historyService.recordShare(postId, 'reddit', true, undefined, postIdOnPlatform);
            }

            this.sendSuccess('Successfully posted to Reddit!');
            return postIdOnPlatform;
        } catch (error: unknown) {
            Logger.info('Error sharing to Reddit:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (postId) {
                this.historyService.recordShare(postId, 'reddit', false, errorMessage);
            }

            throw new Error(`Reddit sharing failed: ${errorMessage}`);
        }
    }

    private async shareToLinkedInWithUpdate(post: PostData, linkedinToken: string | undefined, postId: string | undefined): Promise<void> {
        try {
            await shareToLinkedIn(post, linkedinToken || await this.context.secrets.get('linkedinToken') || '', {
                onSuccess: (message: string) => {
                    this.sendSuccess(message);
                    if (postId) {
                        this.historyService.recordShare(postId, 'linkedin', true);
                    }
                },
                onError: (message: string) => {
                    this.sendError(message);
                    if (postId) {
                        this.historyService.recordShare(postId, 'linkedin', false, message);
                    }
                }
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Error sharing to LinkedIn: ${errorMessage}`);
            if (postId) {
                this.historyService.recordShare(postId, 'linkedin', false, errorMessage);
            }
        }
    }

    private async shareToTelegramWithUpdate(post: PostData, telegramBot: string | undefined, telegramChat: string | undefined, postId: string | undefined, scheduleDate?: Date): Promise<void> {
        try {
            const bot = telegramBot || await this.context.secrets.get('telegramBot') || '';
            const chat = telegramChat || await this.context.secrets.get('telegramChat') || '';

            Logger.info(`DEBUG: Telegram sharing with bot: ${!!bot}, chat: ${!!chat}, post: ${post.text}, scheduled: ${!!scheduleDate}`);

            await shareToTelegram(post, bot, chat, {
                onSuccess: (message: string) => {
                    this.sendSuccess(message);
                    if (postId) {
                        this.historyService.recordShare(postId, 'telegram', true);
                    }
                },
                onError: (message: string) => {
                    this.sendError(message);
                    if (postId) {
                        this.historyService.recordShare(postId, 'telegram', false, message);
                    }
                }
            }, scheduleDate); // Pass the schedule date
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Error sharing to Telegram: ${errorMessage}`);
            if (postId) {
                this.historyService.recordShare(postId, 'telegram', false, errorMessage);
            }
        }
    }

    private async shareToBlueSkyWithUpdate(post: PostData, _postId: string | undefined): Promise<void> {
        Logger.info('BlueSky sharing not yet implemented', { post, postId: _postId });
    }

    private async unifiedSharePost(platforms: string[], post: PostData, mediaFilePaths: string[] = [], postId?: string): Promise<void> {
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

        for (const platform of platforms) {
            try {
                switch (platform) {
                    case 'linkedin':
                        await this.shareToLinkedInWithUpdate(post, undefined, postId);
                        results.linkedin = true;
                        break;
                    case 'telegram':
                        await this.shareToTelegramWithUpdate(post, undefined, undefined, postId);
                        results.telegram = true;
                        break;
                    case 'x':
                        await this.shareToXWithUpdate(post, postId);
                        results.x = true;
                        break;
                    case 'facebook':
                        await this.shareToFacebookWithUpdate(post, postId);
                        results.facebook = true;
                        break;
                    case 'discord':
                        await this.shareToDiscordWithUpdate(post, postId);
                        results.discord = true;
                        break;
                    case 'reddit': {
                        const redditMessage: Message = {
                            command: 'shareToReddit',
                            redditAccessToken: await this.context.secrets.get('redditAccessToken') || '',
                            redditRefreshToken: await this.context.secrets.get('redditRefreshToken') || '',
                            subreddit: 'test',
                            title: post.text?.substring(0, 300) || 'Post from DotShare',
                            post: post.text,
                            mediaFilePaths: mediaFilePaths
                        };
                        await this.shareToRedditWithUpdate(post, redditMessage, postId);
                        results.reddit = true;
                        break;
                    }
                    case 'bluesky':
                        await this.shareToBlueSkyWithUpdate(post, postId);
                        results.bluesky = true;
                        break;
                    default:
                        Logger.info(`Unknown platform: ${platform}`);
                }
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                Logger.info(`Error sharing to ${platform}:`, error);

                if (!firstError) {
                    firstError = `Error sharing to ${platform}: ${errorMessage}`;
                }

                if (postId) {
                    const platformKey = platform as keyof typeof results;
                    if (platformKey in results) {
                        this.historyService.recordShare(postId, platform as 'linkedin' | 'telegram' | 'facebook' | 'discord' | 'x' | 'reddit' | 'bluesky', false, errorMessage);
                    }
                }
            }
        }

        const successfulShares = Object.values(results).filter(success => success).length;

        if (platforms.length === 0) {
            this.sendError('No platforms selected');
        } else if (successfulShares === platforms.length) {
            this.sendSuccess(`Successfully shared to all ${platforms.length} platform(s)!`);
        } else if (successfulShares > 0) {
            this.view.webview.postMessage({
                command: 'status',
                status: `Shared to ${successfulShares}/${platforms.length} platform(s). Check for any errors above.`,
                type: 'warning'
            });
        } else {
            this.sendError(`Failed to share to any platforms. ${firstError || ''}`);
        }
    }

    private sendSuccess(message: string): void {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'success' });
    }

    private sendError(message: string): void {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'error' });
    }
}
