import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HistoryService } from '../services/HistoryService';
import { AnalyticsService } from '../services/AnalyticsService';
import { MediaService } from '../services/MediaService';
import { PostData } from '../types';
import { ScheduledPostsStorage, generateScheduledPostId } from '../core/scheduled-posts';
import { Logger } from '../utils/Logger';
import { PLATFORM_CONFIGS } from '../platforms/platform-config';

// Imports for posting functions
import { generatePost as generateGeminiPost } from '../ai/gemini';
import { generatePost as generateOpenAIPost } from '../ai/openai';
import { generatePost as generateXAIPost } from '../ai/xai';
import { shareToLinkedIn } from '../platforms/linkedin';
import { shareToTelegram } from '../platforms/telegram';
import { shareToReddit } from '../platforms/reddit';
import { shareToX } from '../platforms/x';
import { shareToFacebook } from '../platforms/facebook';
import { shareToBlueSky } from '../platforms/bluesky';
import { shareToDevTo } from '../platforms/devto';
import { shareToMedium } from '../platforms/medium';
import { parseFrontMatter } from '../utils/frontmatter-parser';
import { validateDevTo, validateMedium, formatValidationSummary } from '../utils/blog-validator';
import { generatePost as generateClaudePost } from '../ai/claude';
import { DraftsService } from '../services/DraftsService';
import { fetchDevToArticles, updateDevToArticle } from '../platforms/devto';
import { Draft, BlogPost } from '../types';

interface Message {
    command: string;
    [key: string]: unknown;
}

export class PostHandler {
    constructor(
        private view: vscode.WebviewView,
        private context: vscode.ExtensionContext,
        private historyService: HistoryService,
        private analyticsService: AnalyticsService,
        private mediaService: MediaService,
        private draftsService: DraftsService
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
                    await this.handleShareToFacebook(message);
                    break;

                case 'shareToDiscord':
                    await this.handleShareToDiscord(message);
                    break;

                case 'shareToX':
                    await this.handleShareToX(message);
                    break;

                case 'shareToReddit':
                    await this.handleShareToReddit(message);
                    break;

                case 'shareToBlueSky':
                    await this.handleShareToBlueSky(message);
                    break;

                case 'shareToDevTo':
                    await this.handleShareToDevTo(message);
                    break;

                case 'shareToMedium':
                    await this.handleShareToMedium(message);
                    break;

                case 'shareBlog':
                    await this.handleShareBlog(message);
                    break;

                case 'shareThread':
                    await this.handleShareThread(message);
                    break;

                case 'readMarkdownFile':
                    await this.handleReadMarkdownFile();
                    break;

                case 'loadScheduledPosts':
                    await this.handleLoadScheduledPosts();
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
                    vscode.env.openExternal(vscode.Uri.parse('https://www.buymeacoffee.com/freerave'));
                    break;
                
                // Drafts Commands
                case 'saveLocalDraft':
                    await this.handleSaveLocalDraft(message);
                    break;
                case 'updateLocalDraft':
                    await this.handleUpdateLocalDraft(message);
                    break;
                case 'listLocalDrafts':
                    await this.handleListLocalDrafts();
                    break;
                case 'deleteLocalDraft':
                    await this.handleDeleteLocalDraft(message);
                    break;
                case 'loadLocalDraft':
                    await this.handleLoadLocalDraft(message);
                    break;
                case 'fetchDevToDrafts':
                    await this.handleFetchDevToDrafts();
                    break;
                case 'updateDevToArticle':
                    await this.handleUpdateDevToArticle(message);
                    break;
                case 'resetBlogMarkdown':
                    await this.handleResetBlogMarkdown();
                    break;

                default:
                    Logger.info('[PostHandler] Unhandled command:', cmd);
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Post error: ${errorMessage}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Generate Post
    // ─────────────────────────────────────────────────────────────────────────

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
                if (provider === 'gemini')      post = await generateGeminiPost(apiKey, model);
                else if (provider === 'openai') post = await generateOpenAIPost(apiKey, model);
                else if (provider === 'xai')    post = await generateXAIPost(apiKey, model);
                else if (provider === 'claude') post = await generateClaudePost(apiKey, model);
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

    // ─────────────────────────────────────────────────────────────────────────
    // Individual Platform Handlers — all receive post data from message
    // ─────────────────────────────────────────────────────────────────────────

    private async handleShareToLinkedIn(message: Message): Promise<void> {
        const msg = message as { linkedinToken?: string; post?: string; mediaFilePaths?: string[] };
        const postData: PostData = { text: msg.post || '', media: msg.mediaFilePaths || [] };
        await this.shareToLinkedInWithUpdate(postData, msg.linkedinToken, undefined);
    }

    private async handleShareToTelegram(message: Message): Promise<void> {
        const msg = message as { telegramBot?: string; telegramChat?: string; post?: string; mediaFilePaths?: string[] };
        const postData: PostData = { text: msg.post || '', media: msg.mediaFilePaths || [] };
        await this.shareToTelegramWithUpdate(postData, msg.telegramBot, msg.telegramChat, undefined);
    }

    private async handleShareToFacebook(message: Message): Promise<void> {
        const msg = message as { post?: string; mediaFilePaths?: string[] };
        const postData: PostData = { text: msg.post || '', media: msg.mediaFilePaths || [] };
        const history = this.historyService.getHistory();
        await this.shareToFacebookWithUpdate(postData, history[0]?.id);
    }

    private async handleShareToDiscord(message: Message): Promise<void> {
        const msg = message as { post?: string; mediaFilePaths?: string[] };
        const postData: PostData = { text: msg.post || '', media: msg.mediaFilePaths || [] };
        const history = this.historyService.getHistory();
        await this.shareToDiscordWithUpdate(postData, history[0]?.id);
    }

    private async handleShareToX(message: Message): Promise<void> {
        const msg = message as { post?: string; mediaFilePaths?: string[] };
        const postData: PostData = { text: msg.post || '', media: msg.mediaFilePaths || [] };
        const history = this.historyService.getHistory();
        await this.shareToXWithUpdate(postData, history[0]?.id);
    }

    private async handleShareToReddit(message: Message): Promise<void> {
        const msg = message as { post?: string; mediaFilePaths?: string[] };
        const postData: PostData = { text: msg.post || '', media: msg.mediaFilePaths || [] };
        await this.shareToRedditWithUpdate(postData, message, undefined);
    }

    private async handleShareToBlueSky(message: Message): Promise<void> {
        const msg = message as { post?: string; mediaFilePaths?: string[] };
        const postData: PostData = { text: msg.post || '', media: msg.mediaFilePaths || [] };
        const history = this.historyService.getHistory();
        await this.shareToBlueSkyWithUpdate(postData, history[0]?.id);
    }

    private async handleShareToDevTo(message: Message): Promise<void> {
        const msg = message as { post?: string; mediaFilePaths?: string[]; title?: string; tags?: string[]; published?: boolean };
        const postData: PostData = { text: msg.post || '', media: msg.mediaFilePaths || [] };
        const history = this.historyService.getHistory();
        await this.shareToDevToWithUpdate(postData, message, history[0]?.id);
    }

    private async handleShareToMedium(message: Message): Promise<void> {
        const msg = message as { post?: string; mediaFilePaths?: string[]; title?: string; tags?: string[]; publishStatus?: string };
        const postData: PostData = { text: msg.post || '', media: msg.mediaFilePaths || [] };
        const history = this.historyService.getHistory();
        await this.shareToMediumWithUpdate(postData, message, history[0]?.id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Unified Share
    // ─────────────────────────────────────────────────────────────────────────

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

        const postData: PostData = { text: post.trim(), media: mediaFilePaths || [] };
        const history = this.historyService.getHistory();

        this.view.webview.postMessage({
            command: 'status',
            status: `Sharing to ${platforms.length} platform(s)...`,
            type: 'info'
        });

        const redditMetadata = message.redditMetadata as Record<string, unknown> | undefined;
        await this.unifiedSharePost(platforms, postData, mediaFilePaths, history[0]?.id, { redditMetadata });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Analytics & History
    // ─────────────────────────────────────────────────────────────────────────

    private async handleLoadHistory(): Promise<void> {
        const postHistory = this.historyService.getHistory();
        const analytics = this.analyticsService.calculate(postHistory);

        this.view.webview.postMessage({ command: 'updatePostHistory', postHistory });
        this.view.webview.postMessage({ command: 'updateAnalytics', analytics });
    }

    private async handleLoadAnalytics(): Promise<void> {
        const analytics = this.analyticsService.calculate(this.historyService.getHistory());
        this.view.webview.postMessage({ command: 'updateAnalytics', analytics });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Scheduled Posts
    // ─────────────────────────────────────────────────────────────────────────

    private async handleLoadScheduledPosts(): Promise<void> {
        const storagePath = this.context.globalStorageUri?.fsPath ?? this.context.extensionPath;
        const scheduledStorage = new ScheduledPostsStorage(storagePath);
        const allScheduledPosts = scheduledStorage.loadScheduledPosts();
        this.view.webview.postMessage({ command: 'updateScheduledPosts', scheduledPosts: allScheduledPosts });
    }

    private async handleEditScheduledPost(message: Message): Promise<void> {
        const msg = message as unknown as {
            scheduledPostId: string;
            scheduledTime: string;
            selectedPlatforms: string[];
            postText?: string;
        };

        if (!msg.scheduledPostId || !msg.scheduledTime || !msg.selectedPlatforms?.length) {
            this.sendError('Invalid edit data: missing post ID, time or platforms');
            return;
        }

        const scheduledTimeLocal = msg.scheduledTime.length === 16 ? msg.scheduledTime + ':00' : msg.scheduledTime;
        const scheduleDate = new Date(scheduledTimeLocal);

        if (scheduleDate <= new Date()) {
            this.sendError('Scheduled time must be in the future.');
            return;
        }

        const storagePath = this.context.globalStorageUri?.fsPath ?? this.context.extensionPath;
        const scheduledStorage = new ScheduledPostsStorage(storagePath);

        try {
            scheduledStorage.updateScheduledPost(msg.scheduledPostId, {
                scheduledTime: scheduledTimeLocal,
                platforms: msg.selectedPlatforms as ('linkedin' | 'telegram' | 'x' | 'facebook' | 'discord' | 'reddit' | 'bluesky')[],
                postData: msg.postText ? { text: msg.postText, media: [] } : undefined
            });

            const allScheduledPosts = scheduledStorage.loadScheduledPosts();
            this.view.webview.postMessage({ command: 'updateScheduledPosts', scheduledPosts: allScheduledPosts });
            this.sendSuccess('Scheduled post updated successfully!');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
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

        if (!msg.scheduledTime || !msg.selectedPlatforms?.length) {
            this.sendError('Invalid schedule data: missing time or platforms');
            return;
        }

        if (!msg.postText?.trim()) {
            this.sendError('Cannot schedule empty post');
            return;
        }

        const scheduledTimeLocal = msg.scheduledTime.length === 16 ? msg.scheduledTime + ':00' : msg.scheduledTime;
        const scheduledDate = new Date(scheduledTimeLocal);
        const postData = { text: msg.postText.trim(), media: msg.mediaFilePaths || [] };

        Logger.debug('[PostHandler] Schedule post input', {
            userInput: msg.scheduledTime,
            localTimeString: scheduledTimeLocal,
            parsedDate: scheduledDate,
            unixTimestamp: Math.floor(scheduledDate.getTime() / 1000)
        });

        const storagePath = this.context.globalStorageUri?.fsPath ?? this.context.extensionPath;
        const scheduledStorage = new ScheduledPostsStorage(storagePath);

        // Telegram supports server-side scheduling, others are client-side
        const nativePlatforms = msg.selectedPlatforms.filter(p => p === 'telegram');
        const localPlatforms  = msg.selectedPlatforms.filter(p => p !== 'telegram');

        try {
            if (nativePlatforms.length > 0) {
                await this.shareToTelegramWithUpdate(postData, undefined, undefined, undefined, scheduledDate);
                scheduledStorage.addScheduledPost({
                    id: generateScheduledPostId(),
                    scheduledTime: scheduledTimeLocal,
                    postData,
                    aiProvider: 'gemini' as const,
                    aiModel: 'gemini-2.5-flash',
                    platforms: ['telegram'] as ('linkedin' | 'telegram' | 'x' | 'facebook' | 'discord' | 'reddit' | 'bluesky')[],
                    status: 'server-scheduled' as const,
                    schedulingType: 'server' as const,
                    created: new Date().toISOString()
                });
            }

            if (localPlatforms.length > 0) {
                scheduledStorage.addScheduledPost({
                    id: generateScheduledPostId(),
                    scheduledTime: scheduledTimeLocal,
                    postData,
                    aiProvider: 'gemini' as const,
                    aiModel: 'gemini-2.5-flash',
                    platforms: localPlatforms as ('linkedin' | 'telegram' | 'x' | 'facebook' | 'discord' | 'reddit' | 'bluesky')[],
                    status: 'queued' as const,
                    schedulingType: 'client' as const,
                    created: new Date().toISOString()
                });
            }

            const allScheduledPosts = scheduledStorage.loadScheduledPosts();
            this.view.webview.postMessage({ command: 'updateScheduledPosts', scheduledPosts: allScheduledPosts });

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
            this.sendError(`Failed to schedule post: ${errorMessage}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Markdown / Blog
    // ─────────────────────────────────────────────────────────────────────────

    private async handleReadMarkdownFile(): Promise<void> {
        let markdownEditor: vscode.TextEditor | undefined;

        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const doc = activeEditor.document;
            if (doc.languageId === 'markdown' || doc.fileName.endsWith('.md')) {
                markdownEditor = activeEditor;
            }
        }

        if (!markdownEditor) {
            for (const editor of vscode.window.visibleTextEditors) {
                const doc = editor.document;
                if (doc.languageId === 'markdown' || doc.fileName.endsWith('.md')) {
                    markdownEditor = editor;
                    break;
                }
            }
        }

        if (!markdownEditor) {
            this.sendError('No Markdown file found. Please open a .md file in the editor.');
            return;
        }

        const text = markdownEditor.document.getText();
        const parsed = parseFrontMatter(text);

        this.view.webview.postMessage({ command: 'updatePost', post: parsed.body });

        if (parsed.hasFrontmatter && parsed.frontmatter) {
            this.view.webview.postMessage({ command: 'updateBlogFrontmatter', frontmatter: parsed.frontmatter });
            this.view.webview.postMessage({ command: 'status', status: 'Markdown file loaded with frontmatter!', type: 'info' });
        } else {
            this.view.webview.postMessage({ command: 'status', status: 'Markdown file loaded successfully!', type: 'info' });
        }

        this.view.webview.postMessage({ command: 'revealBlogPublisher' });
    }

    private async handleShareBlog(message: Message): Promise<void> {
        const msg = message as unknown as {
            platforms: string[];
            post?: string;
            title?: string;
            tags?: string[];
            description?: string;
            coverImage?: string;
            canonicalUrl?: string;
            series?: string;
            publishStatus?: 'draft' | 'published' | 'unlisted';
            published?: boolean;
        };

        const platforms = msg.platforms || [];
        if (platforms.length === 0) {
            this.sendError('No blog platforms selected');
            return;
        }

        const history = this.historyService.getHistory();
        const postText = msg.post || history[0]?.postData?.text || '';

        if (!postText.trim()) {
            this.sendError('No content to publish. Write or generate a post first.');
            return;
        }

        this.view.webview.postMessage({
            command: 'status',
            status: `Publishing to ${platforms.length} blog platform(s)...`,
            type: 'info'
        });

        const postData: PostData = { text: postText, media: history[0]?.postData?.media || [] };

        const blogMessage = {
            ...message,
            post: postText,
            title: msg.title,
            tags: msg.tags,
            description: msg.description,
            coverImage: msg.coverImage,
            canonicalUrl: msg.canonicalUrl,
            series: msg.series,
            publishStatus: msg.publishStatus === 'published' ? 'public' : (msg.publishStatus || 'draft'),
            published: msg.publishStatus === 'published'
        };

        let successCount = 0;
        const errors: string[] = [];

        for (const platform of platforms) {
            try {
                if (platform === 'devto') {
                    await this.shareToDevToWithUpdate(postData, blogMessage, undefined);
                    successCount++;
                } else if (platform === 'medium') {
                    await this.shareToMediumWithUpdate(postData, blogMessage, undefined);
                    successCount++;
                } else {
                    Logger.info(`[PostHandler] Unknown blog platform: ${platform}`);
                }
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push(errorMessage);
                Logger.error(`[PostHandler] Error publishing to ${platform}:`, error);
            }
        }

        // blogShareComplete is fired per-platform on success (with URL).
        // Only send a status message when there are failures to report.
        if (successCount === 0 && errors.length > 0) {
            this.sendError(errors.join(' | '));
        } else if (errors.length > 0) {
            this.view.webview.postMessage({
                command: 'status',
                status: `Published to ${successCount}/${platforms.length} platforms. Failed: ${errors.join(', ')}`,
                type: 'warning'
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Platform-specific share helpers
    // ─────────────────────────────────────────────────────────────────────────

    private async shareToLinkedInWithUpdate(post: PostData, linkedinToken: string | undefined, postId: string | undefined): Promise<void> {
        try {
            const token = linkedinToken || await this.context.secrets.get('linkedinToken') || '';
            await shareToLinkedIn(post, token, {
                onSuccess: (msg: string) => {
                    this.sendSuccess(msg);
                    if (postId) this.historyService.recordShare(postId, 'linkedin', true);
                },
                onError: (msg: string) => {
                    if (postId) this.historyService.recordShare(postId, 'linkedin', false, msg);
                    throw new Error(msg);
                }
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (postId) this.historyService.recordShare(postId, 'linkedin', false, errorMessage);
            throw new Error(`Error sharing to LinkedIn: ${errorMessage}`);
        }
    }

    private async shareToTelegramWithUpdate(
        post: PostData,
        telegramBot: string | undefined,
        telegramChat: string | undefined,
        postId: string | undefined,
        scheduleDate?: Date
    ): Promise<void> {
        try {
            const bot  = telegramBot  || await this.context.secrets.get('telegramBot')  || '';
            const chat = telegramChat || await this.context.secrets.get('telegramChat') || '';

            await shareToTelegram(post, bot, chat, {
                onSuccess: (msg: string) => {
                    this.sendSuccess(msg);
                    if (postId) this.historyService.recordShare(postId, 'telegram', true);
                },
                onError: (msg: string) => {
                    if (postId) this.historyService.recordShare(postId, 'telegram', false, msg);
                    throw new Error(msg);
                }
            }, scheduleDate);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (postId) this.historyService.recordShare(postId, 'telegram', false, errorMessage);
            throw new Error(`Error sharing to Telegram: ${errorMessage}`);
        }
    }

    private async shareToFacebookWithUpdate(post: PostData, postId: string | undefined): Promise<void> {
        try {
            const facebookToken     = await this.context.secrets.get('facebookToken')     || '';
            const facebookPageToken = await this.context.secrets.get('facebookPageToken') || null;
            const facebookPageId    = await this.context.secrets.get('facebookPageId')    || undefined;

            await shareToFacebook(facebookToken, facebookPageToken, { ...post, pageId: facebookPageId });

            this.sendSuccess('Successfully posted to Facebook!');
            if (postId) this.historyService.recordShare(postId, 'facebook', true);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (postId) this.historyService.recordShare(postId, 'facebook', false, errorMessage);
            throw new Error(`Error sharing to Facebook: ${errorMessage}`);
        }
    }

    private async shareToDiscordWithUpdate(post: PostData, postId: string | undefined): Promise<void> {
        // TODO: implement Discord webhook sharing
        Logger.info('[PostHandler] Discord sharing not yet implemented', { post, postId });
        this.sendError('Discord sharing coming soon!');
    }

    private async shareToXWithUpdate(post: PostData, postId: string | undefined): Promise<void> {
        try {
            const xAccessToken  = await this.context.secrets.get('xAccessToken')  || '';
            const xAccessSecret = await this.context.secrets.get('xAccessSecret') || '';

            await shareToX(xAccessToken, xAccessSecret, post);

            this.sendSuccess('Successfully posted to X!');
            if (postId) this.historyService.recordShare(postId, 'x', true);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (postId) this.historyService.recordShare(postId, 'x', false, errorMessage);
            throw new Error(`Error sharing to X: ${errorMessage}`);
        } finally {
            this.view.webview.postMessage({ command: 'shareComplete' });
        }
    }

    private async shareToRedditWithUpdate(post: PostData, message: Message, postId: string | undefined): Promise<string | undefined> {
        try {
            const msg = message as {
                redditAccessToken?: string;
                redditRefreshToken?: string;
                post?: string;
                redditSubreddit?: string;
                redditTitle?: string;
                redditFlairId?: string;
                redditPostType?: string;
                redditSpoiler?: boolean;
            };

            const redditPostData = {
                text:       msg.post || post.text,
                media:      post.media,
                subreddit:  msg.redditSubreddit || '',
                title:      msg.redditTitle,
                flairId:    msg.redditFlairId,
                isSelfPost: msg.redditPostType !== 'link',
                spoiler:    msg.redditSpoiler
            };

            const postIdOnPlatform = await shareToReddit(redditPostData);

            if (postId) this.historyService.recordShare(postId, 'reddit', true, undefined, postIdOnPlatform);

            // v3.1.0: append AutoMod silent-removal disclaimer to success toast
            const subredditLabel = msg.redditSubreddit
                ? ` to ${msg.redditSubreddit.startsWith('r/') ? msg.redditSubreddit : `r/${msg.redditSubreddit}`}`
                : '';
            this.sendSuccess(
                `Successfully posted${subredditLabel}! ` +
                `⚠️ Note: AutoModerator may silently remove posts that don't meet account age or karma requirements — check the subreddit rules if your post doesn't appear.`
            );

            return postIdOnPlatform;
        } catch (error: unknown) {
            // Properly extract error message from any error type
            let errorMessage = 'Unknown error';
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            } else if (error && typeof error === 'object') {
                const obj = error as Record<string, unknown>;
                if (obj.message && typeof obj.message === 'string') {
                    errorMessage = obj.message;
                } else {
                    errorMessage = String(obj);
                }
            }
            
            if (postId) this.historyService.recordShare(postId, 'reddit', false, errorMessage);
            throw new Error(`Reddit sharing failed: ${errorMessage}`);
        }
    }

    private async shareToBlueSkyWithUpdate(post: PostData, postId: string | undefined): Promise<void> {
        try {
            const identifier = (await this.context.secrets.get('blueskyIdentifier') || '').trim();
            const password   = (await this.context.secrets.get('blueskyPassword')   || '').trim();

            if (!identifier || !password) {
                throw new Error('BlueSky credentials not configured. Go to Settings to add them.');
            }

            await shareToBlueSky(identifier, password, post);

            this.sendSuccess('Successfully posted to Bluesky!');
            if (postId) this.historyService.recordShare(postId, 'bluesky', true);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (postId) this.historyService.recordShare(postId, 'bluesky', false, errorMessage);
            throw new Error(`Error sharing to Bluesky: ${errorMessage}`);
        } finally {
            this.view.webview.postMessage({ command: 'shareComplete' });
        }
    }

    private async shareToDevToWithUpdate(post: PostData, message: Message, postId: string | undefined): Promise<void> {
        try {
            const msg = message as {
                post?: string;
                mediaFilePaths?: string[];
                title?: string;
                tags?: string[];
                published?: boolean;
                description?: string;
                coverImage?: string;
                canonicalUrl?: string;
                series?: string;
            };

            const devtoApiKey = await this.context.secrets.get('devtoApiKey') || '';
            if (!devtoApiKey) {
                throw new Error('Dev.to API Key not configured. Go to Settings to add it.');
            }

            // ── Pre-publish validation ────────────────────────────────────────
            const bodyText = msg.post || post.text;
            const validation = validateDevTo({
                title:       msg.title,
                body:        bodyText,
                tags:        msg.tags,
                description: msg.description,
            });

            // Surface each warning as an individual info toast
            for (const issue of validation.issues.filter(i => i.severity === 'warning')) {
                this.view.webview.postMessage({ command: 'status', status: issue.message, type: 'warning' });
            }

            // Block on errors — throw so handleShareBlog correctly records failure
            if (!validation.valid) {
                const errors = validation.issues
                    .filter(i => i.severity === 'error')
                    .map(i => i.message)
                    .join(' | ');
                throw new Error(errors);
            }
            // ─────────────────────────────────────────────────────────────────

            const result = await shareToDevTo(devtoApiKey, {
                text:         bodyText,
                media:        msg.mediaFilePaths || post.media,
                title:        msg.title,
                tags:         validation.sanitizedTags ?? msg.tags,
                description:  msg.description,
                coverImage:   msg.coverImage,
                published:    msg.published,
                canonicalUrl: msg.canonicalUrl,
                series:       msg.series
            });

            if (postId) this.historyService.recordShare(postId, 'devto', true, undefined, result.id.toString());
            this.view.webview.postMessage({ command: 'blogShareComplete', url: result.url, platform: 'devto' });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (postId) this.historyService.recordShare(postId, 'devto', false, errorMessage);
            throw new Error(`Error sharing to Dev.to: ${errorMessage}`);
        }
    }

    private async shareToMediumWithUpdate(post: PostData, message: Message, postId: string | undefined): Promise<void> {
        try {
            const msg = message as {
                post?: string;
                mediaFilePaths?: string[];
                title?: string;
                tags?: string[];
                publishStatus?: string;
                canonicalUrl?: string;
            };

            const mediumAccessToken = await this.context.secrets.get('mediumAccessToken') || '';
            if (!mediumAccessToken) {
                throw new Error('Medium Access Token not configured. Go to Settings to add it.');
            }

            // ── Pre-publish validation ────────────────────────────────────────
            const bodyText = msg.post || post.text;
            const validation = validateMedium({
                title: msg.title,
                body:  bodyText,
                tags:  msg.tags,
            });

            // Surface each warning as an individual info toast
            for (const issue of validation.issues.filter(i => i.severity === 'warning')) {
                this.view.webview.postMessage({ command: 'status', status: issue.message, type: 'warning' });
            }

            // Block on errors — throw so handleShareBlog correctly records failure
            if (!validation.valid) {
                const errors = validation.issues
                    .filter(i => i.severity === 'error')
                    .map(i => i.message)
                    .join(' | ');
                throw new Error(errors);
            }
            // ─────────────────────────────────────────────────────────────────

            await shareToMedium(mediumAccessToken, {
                text:          bodyText,
                media:         msg.mediaFilePaths || post.media,
                title:         msg.title,
                tags:          validation.sanitizedTags ?? msg.tags,
                publishStatus: msg.publishStatus as 'public' | 'draft' | 'unlisted' | 'published' | undefined,
                canonicalUrl:  msg.canonicalUrl
            });

            if (postId) this.historyService.recordShare(postId, 'medium', true);
            this.view.webview.postMessage({ command: 'blogShareComplete', platform: 'medium' });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (postId) this.historyService.recordShare(postId, 'medium', false, errorMessage);
            throw new Error(`Error sharing to Medium: ${errorMessage}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Unified Share (multi-platform)
    // ─────────────────────────────────────────────────────────────────────────

    private async unifiedSharePost(
        platforms: string[],
        post: PostData,
        mediaFilePaths: string[] = [],
        postId?: string,
        metadata?: { redditMetadata?: Record<string, unknown> }
    ): Promise<void> {
        // Ensure all media paths are merged into the post object
        if (mediaFilePaths.length > 0) {
            post.media = Array.from(new Set([...(post.media || []), ...mediaFilePaths]));
        }

        let successCount = 0;
        const errors: string[] = [];

        for (const platform of platforms) {
            try {
                switch (platform) {
                    case 'linkedin':
                        await this.shareToLinkedInWithUpdate(post, undefined, postId);
                        break;
                    case 'telegram':
                        await this.shareToTelegramWithUpdate(post, undefined, undefined, postId);
                        break;
                    case 'x':
                        await this.shareToXWithUpdate(post, postId);
                        break;
                    case 'facebook':
                        await this.shareToFacebookWithUpdate(post, postId);
                        break;
                    case 'discord':
                        await this.shareToDiscordWithUpdate(post, postId);
                        break;
                    case 'reddit': {
                        const redditMeta = metadata?.redditMetadata || {};
                        const redditMessage: Message = {
                            command: 'shareToReddit',
                            redditAccessToken:  await this.context.secrets.get('redditAccessToken')  || '',
                            redditRefreshToken: await this.context.secrets.get('redditRefreshToken') || '',
                            redditSubreddit:    (redditMeta.subreddit as string) || await this.context.secrets.get('redditSubreddit') || '',
                            redditTitle:        (redditMeta.title as string)     || post.text.substring(0, 300),
                            redditFlairId:      (redditMeta.flair as string)     || '',
                            redditPostType:     (redditMeta.postType as string)  || 'self',
                            redditSpoiler:      (redditMeta.spoiler as boolean)  || false,
                            post:               post.text,
                            mediaFilePaths
                        };
                        await this.shareToRedditWithUpdate(post, redditMessage, postId);
                        break;
                    }
                    case 'bluesky':
                        await this.shareToBlueSkyWithUpdate(post, postId);
                        break;
                    case 'devto': {
                        const devtoMsg: Message = { 
                            command: 'shareToDevTo', 
                            post: post.text, 
                            mediaFilePaths,
                            title: post.text.split('\n')[0].substring(0, 100),
                            published: false
                        };
                        await this.shareToDevToWithUpdate(post, devtoMsg, postId);
                        break;
                    }
                    case 'medium': {
                        const mediumMsg: Message = { 
                            command: 'shareToMedium', 
                            post: post.text, 
                            mediaFilePaths, 
                            title: post.text.split('\n')[0].substring(0, 100),
                            publishStatus: 'public' 
                        };
                        await this.shareToMediumWithUpdate(post, mediumMsg, postId);
                        break;
                    }
                    default:
                        Logger.info(`[PostHandler] Unknown platform: ${platform}`);
                        continue;
                }
                successCount++;
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push(`${platform}: ${errorMessage}`);
                Logger.error(`[PostHandler] Error sharing to ${platform}:`, error);
                if (postId) {
                    this.historyService.recordShare(
                        postId,
                        platform as 'linkedin' | 'telegram' | 'facebook' | 'discord' | 'x' | 'reddit' | 'bluesky' | 'devto' | 'medium',
                        false,
                        errorMessage
                    );
                }
            }
        }

        if (successCount === platforms.length) {
            this.sendSuccess(`Successfully shared to all ${platforms.length} platform(s)!`);
        } else if (successCount > 0) {
            this.view.webview.postMessage({
                command: 'status',
                status: `Shared to ${successCount}/${platforms.length} platform(s). Errors: ${errors.join(' | ')}`,
                type: 'warning'
            });
        } else {
            this.sendError(`Failed to share to any platforms. ${errors.join(' | ')}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Thread Sharing
    // ─────────────────────────────────────────────────────────────────────────

    private async handleShareThread(message: Message): Promise<void> {
        const platform = message.platform as string;
        const posts    = message.posts as Array<{ text: string; mediaBase64?: string; mediaType?: string; mediaFilePaths?: string[] }>;

        // Use platform-config to validate thread support
        const platformConfig = PLATFORM_CONFIGS[platform];
        if (!platformConfig || !platformConfig.supportsThreads) {
            this.sendError(`Thread posting is not supported for "${platform}"`);
            this.view.webview.postMessage({ command: 'shareComplete' });
            return;
        }

        if (!posts || posts.length === 0) {
            this.sendError('No posts provided for thread');
            this.view.webview.postMessage({ command: 'shareComplete' });
            return;
        }

        this.view.webview.postMessage({
            command: 'status',
            status: `Sharing thread (${posts.length} posts) to ${platformConfig.name}...`,
            type: 'info'
        });

        const tempMediaPaths: string[] = [];

        try {
            // Process each post in the thread to handle its specific media
            const processedPosts: Array<{ text: string; media?: string[] }> = [];

            for (let i = 0; i < posts.length; i++) {
                const currentPost = posts[i];
                let postMedia: string[] | undefined;

                if (currentPost.mediaFilePaths?.length) {
                    const validPaths = (currentPost.mediaFilePaths as string[]).filter(p => fs.existsSync(p));
                    if (validPaths.length > 0) postMedia = validPaths;
                } else if (currentPost.mediaBase64 && currentPost.mediaType) {
                    const ext = currentPost.mediaType.split('/')[1] || 'png';
                    const tempFileName = `thread_media_${i}_${Date.now()}.${ext}`;
                    const tempPath = path.join(os.tmpdir(), tempFileName);
                    const buffer = Buffer.from(currentPost.mediaBase64, 'base64');
                    fs.writeFileSync(tempPath, buffer);
                    tempMediaPaths.push(tempPath);
                    postMedia = [tempPath];
                }

                processedPosts.push({
                    text: currentPost.text,
                    media: postMedia
                });
            }

            if (platform === 'x') {
                const xAccessToken  = await this.context.secrets.get('xAccessToken')  || '';
                const xAccessSecret = await this.context.secrets.get('xAccessSecret') || '';
                // Pass structured posts to x platform handler
                await shareToX(xAccessToken, xAccessSecret, { text: '', posts: processedPosts });

            } else if (platform === 'bluesky') {
                const identifier = (await this.context.secrets.get('blueskyIdentifier') || '').trim();
                const password   = (await this.context.secrets.get('blueskyPassword')   || '').trim();

                if (!identifier || !password) {
                    this.sendError('BlueSky credentials not configured. Go to Settings to add them.');
                    this.view.webview.postMessage({ command: 'shareComplete' });
                    return;
                }

                // Images come compressed and optimized from the frontend (Webview Canvas)
                await shareToBlueSky(identifier, password, { text: '', posts: processedPosts });
            }

            this.sendSuccess(`Thread shared to ${platformConfig.name}!`);
            this.view.webview.postMessage({ command: 'shareComplete' });

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Thread sharing failed: ${errorMessage}`);
            this.view.webview.postMessage({ command: 'shareComplete' });
        } finally {
            // Cleanup all temp files
            for (const tempPath of tempMediaPaths) {
                try {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                } catch (e) {
                    Logger.info('[PostHandler] Failed to clean up temp media file:', e);
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Drafts Management
    // ─────────────────────────────────────────────────────────────────────────

    private async handleSaveLocalDraft(message: Message): Promise<void> {
        const draft = message.draft as Omit<Draft, 'id' | 'timestamp'>;
        if (!draft) {
            this.sendError('Draft data is required.');
            return;
        }

        // Guard: never save a remote draft as a new local copy
        if ((draft as Draft).isRemote) {
            this.sendError('Cannot save a remote draft locally. Use "Update" instead.');
            return;
        }

        // Upsert: if draftId is passed, update instead of creating a new draft
        const existingId = message.draftId as string | undefined;
        if (existingId) {
            const updated = this.draftsService.updateDraft(existingId, draft);
            if (updated) {
                this.sendInfo('Draft updated!');
                this.view.webview.postMessage({ command: 'draftLoaded', draft: updated });
            } else {
                this.sendError('Draft not found for update.');
            }
        } else {
            const saved = this.draftsService.saveDraft(draft);
            this.sendInfo('Draft saved locally!');
            this.view.webview.postMessage({ command: 'draftLoaded', draft: saved });
        }

        await this.handleListLocalDrafts();
    }

    private async handleUpdateLocalDraft(message: Message): Promise<void> {
        const draftId = message.draftId as string;
        const updates = message.draft as Partial<Draft>;

        if (!draftId || !updates) {
            this.sendError('Draft ID and update data are required.');
            return;
        }

        const updated = this.draftsService.updateDraft(draftId, updates);
        if (updated) {
            this.sendInfo('Draft updated!');
            this.view.webview.postMessage({ command: 'draftLoaded', draft: updated });
            await this.handleListLocalDrafts();
        } else {
            this.sendError('Draft not found.');
        }
    }

    private async handleListLocalDrafts(): Promise<void> {
        const drafts = this.draftsService.getDrafts();
        this.view.webview.postMessage({ command: 'draftsLoaded', drafts });
    }

    private async handleDeleteLocalDraft(message: Message): Promise<void> {
        const draftId = message.draftId as string;
        if (!draftId) {
            this.sendError('Draft ID is required.');
            return;
        }

        const existing = this.draftsService.getDraft(draftId);
        if (!existing) {
            this.sendError('Draft not found.');
            return;
        }

        this.draftsService.deleteDraft(draftId);
        this.sendInfo('Draft deleted.');
        await this.handleListLocalDrafts();
    }

    private async handleLoadLocalDraft(message: Message): Promise<void> {
        const draftId = message.draftId as string;
        if (!draftId) return;
        const draft = this.draftsService.getDraft(draftId);
        if (draft) {
            this.view.webview.postMessage({ command: 'draftLoaded', draft });
            this.sendInfo('Draft loaded!');

            // If it's an article draft, try to inject it into the active/visible Markdown editor
            if (draft.type === 'article') {
                const mdEditor = vscode.window.visibleTextEditors.find(e => e.document.languageId === 'markdown');
                if (mdEditor) {
                    let fm = '---\n';
                    const data = draft.data as BlogPost;
                    fm += `title: ${draft.title || data.title || 'Untitled'}\n`;
                    if (data.tags && data.tags.length > 0) {
                        fm += `tags: [${data.tags.join(', ')}]\n`;
                    }
                    fm += `published: ${data.status === 'published' ? 'true' : 'false'}\n`;
                    if (data.description) fm += `description: ${data.description}\n`;
                    if (data.coverImage) fm += `cover_image: ${data.coverImage}\n`;
                    if (data.canonicalUrl) fm += `canonical_url: ${data.canonicalUrl}\n`;
                    if (data.series) fm += `series: ${data.series}\n`;
                    fm += '---\n';
                    const postData = draft.data as { text?: string };
                    fm += data.bodyMarkdown || postData.text || '';

                    const doc = mdEditor.document;
                    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
                    
                    mdEditor.edit(editBuilder => {
                        editBuilder.replace(fullRange, fm);
                    });
                }
            }
        } else {
            this.sendError('Draft not found.');
        }
    }

    private async handleFetchDevToDrafts(): Promise<void> {
        const devtoApiKey = await this.context.secrets.get('devtoApiKey') || '';
        if (!devtoApiKey) {
            this.sendError('Dev.to API Key not configured.');
            return;
        }
        
        try {
            const articles = await fetchDevToArticles(devtoApiKey);
            const draftsArr = articles.filter(a => !a.published).map(a => {
                const mapped: Draft = {
                    id: `devto_${a.id}`,
                    type: 'article',
                    timestamp: a.published_at || new Date().toISOString(),
                    platforms: ['devto'],
                    title: a.title,
                    isRemote: true,
                    remoteId: a.id?.toString(),
                    data: {
                        title: a.title,
                        bodyMarkdown: a.body_markdown || '',
                        tags: a.tags || [],
                        status: a.published ? 'published' : 'draft',
                        platformId: 'devto',
                        url: a.url,
                        canonicalUrl: a.canonical_url,
                        coverImage: a.cover_image,
                        description: a.description
                    } as BlogPost
                };
                return mapped;
            });
            
            this.view.webview.postMessage({ 
                command: 'remoteDraftsLoaded', 
                platform: 'devto', 
                drafts: draftsArr 
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Error fetching Dev.to drafts: ${errorMessage}`);
        }
    }

    private async handleUpdateDevToArticle(message: Message): Promise<void> {
        const devtoApiKey = await this.context.secrets.get('devtoApiKey') || '';
        if (!devtoApiKey) {
            this.sendError('Dev.to API Key not configured.');
            return;
        }
        
        const remoteId = message.remoteId as string;
        const data = message.data as Partial<BlogPost>;
        
        if (!remoteId || !data) return;
        
        try {
            const result = await updateDevToArticle(devtoApiKey, parseInt(remoteId, 10), {
                text:         data.bodyMarkdown ?? '',
                title:        data.title,
                tags:         data.tags,
                published:    data.status === 'published',
                description:  data.description,
                coverImage:   data.coverImage,
                canonicalUrl: data.canonicalUrl,
                series:       data.series
            });
            
            this.sendSuccess(`Successfully updated article on Dev.to! URL: ${result.url}`);
            await this.handleFetchDevToDrafts();
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Error updating Dev.to article: ${errorMessage}`);
        }
    }

    private async handleResetBlogMarkdown(): Promise<void> {
        const mdEditor = vscode.window.visibleTextEditors.find(e => e.document.languageId === 'markdown');
        if (mdEditor) {
            const doc = mdEditor.document;
            const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
            
            const boilerplate = `---
title: add ur title
tags: [add, tags, max, 4]
published: false
description: add ur description
---
Start writing your article here...
`;
            
            mdEditor.edit(editBuilder => {
                editBuilder.replace(fullRange, boilerplate);
            });
            this.sendSuccess('Markdown boilerplate reset!');
            
            // Push empty state to frontend
            this.view.webview.postMessage({
                command: 'updateBlogFrontmatter',
                frontmatter: {
                    title: 'add ur title',
                    tags: ['add', 'tags', 'max', '4'],
                    published: false,
                    description: 'add ur description'
                }
            });
            this.view.webview.postMessage({
                command: 'updatePost',
                post: 'Start writing your article here...'
            });
        } else {
            this.sendError('No active markdown file found to reset.');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private sendSuccess(message: string): void {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'success' });
    }

    private sendInfo(message: string): void {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'info' });
    }

    private sendError(message: string): void {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'error' });
    }
}