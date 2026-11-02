import * as vscode from 'vscode';
import { DOTSUITE_WEB_URL } from '../constants';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HistoryService } from '../services/HistoryService';
import { AnalyticsService } from '../services/AnalyticsService';
import { MediaService } from '../services/MediaService';
import { PostData, SocialPlatform } from '../types';

import { Logger } from '../utils/Logger';
import { PLATFORM_CONFIGS } from '../platforms/platform-config';
import { MASTODON_CONSENT_KEY, SchedulerClient } from '../services/SchedulerClient';
import { DotShareAuth } from '../services/DotShareAuth';
import { AI_PROVIDERS } from '../security/credentials';
import { rememberSecret, redactSensitiveText } from '../security/redaction';


// Imports for posting functions
import { generatePost as generateGeminiPost, generateCustomContent as generateGeminiCustom, getAvailableModels as getGeminiModels } from '../ai/gemini';
import { generatePost as generateOpenAIPost, generateCustomContent as generateOpenAICustom, getAvailableModels as getOpenAIModels } from '../ai/openai';
import { generatePost as generateXAIPost, generateCustomContent as generateXAICustom, getAvailableModels as getXAIModels } from '../ai/xai';
import { generatePost as generateClaudePost, generateCustomContent as generateClaudeCustom, getAvailableModels as getClaudeModels } from '../ai/claude';
import { generatePost as generateDeepSeekPost, generateCustomContent as generateDeepSeekCustom, getAvailableModels as getDeepSeekModels } from '../ai/deepseek';
import { ProjectContextService } from '../services/ProjectContextService';
import { ReleaseGenerationService } from '../ai/ReleaseGenerationService';
import { ReleaseGenerationRequest, GeneratedPlatformContent, ReleaseSourceType, UserCtaLink } from '../types/dotshare-ai';
import { DotShareWebView } from '../ui/DotShareWebView';
import { shareToLinkedIn } from '../platforms/linkedin';
import { shareToTelegram } from '../platforms/telegram';

import { shareToX } from '../platforms/x';

import { shareToBlueSky } from '../platforms/bluesky';
import { shareToMastodon } from '../platforms/mastodon';
import { shareToDevTo } from '../platforms/devto';

import { parseFrontMatter } from '../utils/frontmatter-parser';
import { resolveThreadMedia } from '../utils/thread-media';
import { validateDevTo } from '../utils/blog-validator';
import { DraftsService } from '../services/DraftsService';
import { fetchDevToArticles, updateDevToArticle } from '../platforms/devto';
import { Draft, BlogPost } from '../types';

interface Message {
    command: string;
    [key: string]: unknown;
}

export class PostHandler {
    private releaseGenerationInProgress = false;
    constructor(
        private view: vscode.WebviewView,
        private context: vscode.ExtensionContext,
        private historyService: HistoryService,
        private analyticsService: AnalyticsService,
        _mediaService: MediaService,
        private draftsService: DraftsService
    ) { }

    public async handleMessage(message: Message): Promise<void> {
        const cmd = message.command;

        try {
            switch (cmd) {
                case 'applyModelSelection': {
                    const provider = typeof message.provider === 'string' ? message.provider.trim() : '';
                    const apiKey = typeof message.apiKey === 'string' ? message.apiKey.trim() : '';
                    const model = typeof message.model === 'string' ? message.model.trim() : '';

                    if (!AI_PROVIDERS.includes(provider as typeof AI_PROVIDERS[number]) || !model) {
                        this.sendError('Provider and model are required.');
                        break;
                    }

                    // New key supplied -> update SecretStorage
                    if (apiKey) {
                        await this.context.secrets.store(`${provider}ApiKey`, apiKey);
                    } else {
                        // Empty UI field is okay only if a key already exists
                        const storedKey = await this.context.secrets.get(`${provider}ApiKey`);
                        if (!storedKey) {
                            this.sendError(`API key is required for ${provider}.`);
                            break;
                        }
                    }

                    await this.context.globalState.update(`selected_${provider}_model`, model);
                    await this.context.globalState.update('last_selected_ai_provider', provider);
                    this.view.webview.postMessage({ command: 'aiModelSelectionApplied', provider, model, hasSavedKey: true });
                    break;
                }

                case 'generatePost':
                    await this.handleGeneratePost(message);
                    break;

                case 'shareToLinkedIn':
                    await this.handleShareToLinkedIn(message);
                    break;

                case 'shareToTelegram':
                    await this.handleShareToTelegram(message);
                    break;



                case 'shareToDiscord':
                    await this.handleShareToDiscord(message);
                    break;

                case 'shareToX':
                    await this.handleShareToX(message);
                    break;


                case 'shareToBlueSky':
                    await this.handleShareToBlueSky(message);
                    break;

                case 'shareToDevTo':
                    await this.handleShareToDevTo(message);
                    break;



                case 'shareBlog':
                    await this.handleShareBlog(message);
                    break;

                case 'shareThread':
                    await this.handleShareThread(message);
                    break;

                case 'scheduleBlog':
                    // Rust backend scheduler doesn't yet support blog metadata (title, tags, etc).
                    this.sendSuccess('☁️ Blog scheduling (Dev.to) will be available in the next DotSuite Cloud update!');
                    break;

                case 'scheduleThread':
                    // Rust backend doesn't yet support multi-post thread scheduling.
                    this.sendSuccess('☁️ Thread scheduling will be available in the next DotSuite Cloud update!');
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

                case 'cancelScheduledPost':
                    await this.handleCancelScheduledPost(message);
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

                case 'loadOAuthConnections':
                    await this.handleLoadOAuthConnections();
                    break;

                // DotShare AI Release Commands
                case 'extractReleaseContext':
                    await this.handleExtractReleaseContext(message);
                    break;
                case 'generateReleasePost':
                    await this.handleGenerateReleasePost(message);
                    break;
                case 'fetchAiModels':
                    await this.handleFetchAiModels(message);
                    break;
                case 'loadUserCtaLinks':
                    await this.handleLoadUserCtaLinks();
                    break;
                case 'saveUserCtaLinks':
                    await this.handleSaveUserCtaLinks(message);
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
    // DotShare AI — Release & Update Handlers
    // ─────────────────────────────────────────────────────────────────────────

    private async handleLoadUserCtaLinks(): Promise<void> {
        try {
            const links = this.context.globalState.get<UserCtaLink[]>('dotshare.userCtaLinks') || [];
            this.view.webview.postMessage({
                command: 'userCtaLinksLoaded',
                links
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            Logger.error('[PostHandler] Load user CTA links error', msg);
        }
    }

    private async handleSaveUserCtaLinks(message: Message): Promise<void> {
        try {
            const rawLinks = message.links as UserCtaLink[] | undefined;
            if (!Array.isArray(rawLinks)) return;

            // Validate, deduplicate, and sanitize links: only http/https, trimmed url, no destructive normalization
            const seenUrls = new Set<string>();
            const sanitizedLinks: UserCtaLink[] = [];

            for (const link of rawLinks) {
                if (!link || typeof link.url !== 'string' || typeof link.label !== 'string') continue;
                const trimmedUrl = link.url.trim();
                const trimmedLabel = link.label.trim();
                const lower = trimmedUrl.toLowerCase();

                if ((lower.startsWith('http://') || lower.startsWith('https://')) && trimmedLabel.length > 0) {
                    if (!seenUrls.has(trimmedUrl)) {
                        seenUrls.add(trimmedUrl);
                        sanitizedLinks.push({
                            id: link.id || String(Date.now() + Math.random()),
                            label: trimmedLabel,
                            url: trimmedUrl,
                            emoji: link.emoji?.trim() || undefined
                        });
                    }
                }
            }

            await this.context.globalState.update('dotshare.userCtaLinks', sanitizedLinks);

            // Broadcast to all active panels
            DotShareWebView.postMessage({
                command: 'userCtaLinksUpdated',
                links: sanitizedLinks
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            Logger.error('[PostHandler] Save user CTA links error', msg);
            this.sendError(`Failed to save CTA links: ${msg}`);
        }
    }

    private async handleExtractReleaseContext(message: Message): Promise<void> {
        try {
            const sources = message.sources as ReleaseSourceType[] | undefined;
            const topicQuery = message.topicQuery as string | undefined;
            const includeActiveEditor = message.includeActiveEditor as boolean | undefined;

            const context = await ProjectContextService.buildContext(undefined, {
                sources,
                topicQuery,
                includeActiveEditor,
                scope: message.scope === 'working_tree' ? 'working_tree' : 'release',
                releaseTag: typeof message.releaseTag === 'string' ? message.releaseTag : undefined
            });
            this.view.webview.postMessage({
                command: 'releaseContextExtracted',
                requestId: message.requestId,
                context
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            Logger.error('[PostHandler] Extract release context error', msg);
            this.view.webview.postMessage({ command: 'releaseContextExtractionFailed', requestId: message.requestId });
            this.sendError(`Failed to extract project context: ${msg}`);
        }
    }

    private async handleFetchAiModels(message: Message): Promise<void> {
        const provider = message.provider as string;
        if (!AI_PROVIDERS.includes(provider as typeof AI_PROVIDERS[number])) throw new Error('Unknown AI provider');
        const savedKey = await this.context.secrets.get(`${provider}ApiKey`);
        let apiKey = message.apiKey as string | undefined;
        if (!apiKey) {
            apiKey = (await this.context.secrets.get(`${provider}ApiKey`)) || '';
        }

        rememberSecret(apiKey || '');
        let models: string[] = [];
        try {
            if (provider === 'gemini') {
                models = await getGeminiModels(apiKey);
            } else if (provider === 'openai') {
                models = await getOpenAIModels(apiKey);
            } else if (provider === 'claude') {
                models = await getClaudeModels(apiKey);
            } else if (provider === 'xai') {
                models = await getXAIModels(apiKey);
            } else if (provider === 'deepseek') {
                models = await getDeepSeekModels(apiKey);
            }

            this.view.webview.postMessage({
                command: 'aiModelsLoaded',
                provider,
                models,
                hasSavedKey: !!savedKey,
                requestId: message.requestId,
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            Logger.error('[PostHandler] Fetch AI models error', msg);
            this.view.webview.postMessage({ command: 'aiModelsLoaded', provider, models: [], hasSavedKey: !!savedKey, requestId: message.requestId });
        }
    }

    private async handleGenerateReleasePost(message: Message): Promise<void> {
        if (this.releaseGenerationInProgress) {
            this.sendError('Article generation is already in progress.');
            return;
        }
        const request = message.request as ReleaseGenerationRequest | undefined;
        const selectedModel = message.selectedModel as { provider: string; apiKey?: string; model?: string } | undefined;

        let provider = selectedModel?.provider || this.context.globalState.get<string>('last_selected_ai_provider') || 'gemini';
        let apiKey = selectedModel?.apiKey;
        let model = selectedModel?.model || this.context.globalState.get<string>(`selected_${provider}_model`);

        if (!apiKey) {
            apiKey = (await this.context.secrets.get(`${provider}ApiKey`)) || '';
        }
        rememberSecret(apiKey);

        // Fallback search across other providers if current provider has no key
        if (!apiKey && !selectedModel?.provider) {
            const providers = ['gemini', 'openai', 'claude', 'xai', 'deepseek'];
            for (const p of providers) {
                const storedKey = await this.context.secrets.get(`${p}ApiKey`);
                if (storedKey) {
                    provider = p;
                    apiKey = storedKey;
                    model = this.context.globalState.get<string>(`selected_${p}_model`);
                    break;
                }
            }
        }

        if (!apiKey) {
            vscode.window.showErrorMessage('API Key is required for DotShare AI generation. Please configure your key in "AI Keys".');
            this.sendError('API Key is required for DotShare AI generation.');
            return;
        }

        if (!model) {
            vscode.window.showErrorMessage(`No AI model selected for ${provider}. Open AI Keys and choose a model.`);
            this.sendError(`No AI model selected for ${provider}. Open AI Keys and choose a model.`);
            return;
        }

        if (!request || !request.context || !request.targetPlatforms || request.targetPlatforms.length === 0) {
            vscode.window.showErrorMessage('At least one target platform is required.');
            return;
        }

        const platform = request.targetPlatforms[0]; // Primary platform requested
        this.releaseGenerationInProgress = true;

        try {
            // Cached webview evidence is preview only. Rebuild from the selected release snapshot.
            const userTopic = request.topicQuery || request.customPrompt;
            request.context = await ProjectContextService.buildContext(undefined, {
                sources: request.sources,
                scope: request.scope || request.context.scope || 'release',
                releaseTag: request.releaseTag || request.context.releaseTag,
                topicQuery: userTopic,
                includeActiveEditor: request.includeActiveEditor,
                maxSnippets: request.tone === 'full_markdown_article' ? 8 : 6
            });
            const generated = await ReleaseGenerationService.generate(request, platform, async (prompt, maxTokens) => {
                const options = { model: model!, maxTokens };
                if (provider === 'gemini') return generateGeminiCustom(apiKey!, prompt, options);
                if (provider === 'openai') return generateOpenAICustom(apiKey!, prompt, options);
                if (provider === 'claude') return generateClaudeCustom(apiKey!, prompt, options);
                if (provider === 'xai') return generateXAICustom(apiKey!, prompt, options);
                if (provider === 'deepseek') return generateDeepSeekCustom(apiKey!, prompt, options);
                throw new Error('Unsupported AI provider.');
            });
            const generatedText = generated.text;

            if (request.targetPlatforms.length > 1) {
                Logger.info(`[DotShare AI] Generated for primary platform (${platform}). Multi-platform batch publishing is scheduled for v3.6.0.`);
            }

            const result: GeneratedPlatformContent = {
                platform,
                rawContent: generatedText,
                charCount: generatedText.length,
                qualityWarnings: generated.warnings,
                isThread: request.threadMode && platform === 'x'
            };

            // Format thread parts if applicable
            if (result.isThread && generatedText.includes('---TWEET---')) {
                result.threadParts = generatedText
                    .split('---TWEET---')
                    .map(t => t.trim())
                    .filter(Boolean);
            }

            // Parse frontmatter if Dev.to article or full markdown tone
            if (platform === 'devto' || request.tone === 'full_markdown_article') {
                const fm = parseFrontMatter(generatedText);

                // Sanitize tags for Dev.to: max 4 tags, lowercase alphanumeric only
                let cleanTags: string[] = [];
                if (fm.frontmatter?.tags && Array.isArray(fm.frontmatter.tags)) {
                    cleanTags = fm.frontmatter.tags
                        .map(t => String(t).toLowerCase().replace(/[^a-z0-9]/g, '').trim())
                        .filter(Boolean)
                        .slice(0, 4);
                }
                if (cleanTags.length === 0) {
                    cleanTags = ['webdev', 'programming', 'opensource'];
                }

                let articleTitle = fm.frontmatter?.title?.trim();
                if (!articleTitle) {
                    const headingMatch = generatedText.match(/^#\s+(.+)$/m);
                    if (headingMatch) {
                        articleTitle = headingMatch[1].trim();
                    } else {
                        articleTitle = `${request.context.projectName} ${request.context.version ? `v${request.context.version}` : 'Update'}`;
                    }
                }

                result.frontmatter = {
                    title: articleTitle,
                    tags: cleanTags,
                    description: fm.frontmatter?.description || request.context.projectDescription || '',
                    published: fm.frontmatter?.published ?? false
                };

                // Populate rawContent with clean markdown body (without YAML frontmatter delimiter)
                if (fm.hasFrontmatter && fm.body.trim()) {
                    let cleanBody = fm.body.trim();
                    // Strip duplicate leading # H1 title if present, so title lives exclusively in the title field below
                    cleanBody = cleanBody.replace(/^#\s+[^\r\n]+(?:\r?\n)+/, '').trim();
                    result.rawContent = cleanBody;
                }

                // Dev.to Post-Generation Hygiene Validator:
                if (platform === 'devto') {
                    // 1. Strip redundant trailing hashtags line (e.g. "**Tags:** #tag1 #tag2" or "#tag1 #tag2")
                    result.rawContent = result.rawContent
                        .replace(/(?:\r?\n)+[ \t]*(?:---[ \t]*)?(?:(?:\*\*|__)?tags:?(?:\*\*|__)?\s*)?(?:#[a-zA-Z0-9_-]+[ \t]*)+$/i, '')
                        .trim();

                    // 2. Clean up any accidental prompt leakage phrases
                    result.rawContent = result.rawContent
                        .replace(/Per the ground-truth diff summary,?\s*/gi, '')
                        .replace(/According to the ground-truth context,?\s*/gi, '');
                }

                result.charCount = result.rawContent.length;
            }

            this.view.webview.postMessage({
                command: 'releasePostGenerated',
                result
            });
            this.sendSuccess(`✨ DotShare AI generated post for ${platform.toUpperCase()}!`);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            Logger.error('[PostHandler] DotShare AI generate error', msg);
            this.sendError(`DotShare AI generation failed: ${msg}`);
        } finally {
            this.releaseGenerationInProgress = false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Generate Post
    // ─────────────────────────────────────────────────────────────────────────

    private async handleGeneratePost(message: Message): Promise<void> {
        const selectedModel = message.selectedModel as { provider: string; apiKey?: string; model: string } | undefined;
        if (!selectedModel || !AI_PROVIDERS.includes(selectedModel.provider as typeof AI_PROVIDERS[number])) {
            this.sendError('Select an AI provider and model.');
            return;
        }
        const { provider, model } = selectedModel;
        const apiKey = selectedModel.apiKey || await this.context.secrets.get(`${provider}ApiKey`);
        if (!apiKey) {
            this.sendError('API Key is required to generate posts.');
            return;
        }
        rememberSecret(apiKey);
        let post: PostData | null = null;

        let retryCount = 0;
        const maxRetries = 1;
        while (retryCount <= maxRetries) {
            try {
                if (provider === 'gemini') post = await generateGeminiPost(apiKey, model);
                else if (provider === 'openai') post = await generateOpenAIPost(apiKey, model);
                else if (provider === 'xai') post = await generateXAIPost(apiKey, model);
                else if (provider === 'claude') post = await generateClaudePost(apiKey, model);
                else if (provider === 'deepseek') post = await generateDeepSeekPost(apiKey, model);
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

        await this.unifiedSharePost(platforms, postData, mediaFilePaths, history[0]?.id);
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
        const pendingPosts = await SchedulerClient.getPendingPosts(this.context);
        this.view.webview.postMessage({ command: 'updateScheduledPosts', scheduledPosts: pendingPosts });
    }

    private async handleLoadOAuthConnections(): Promise<void> {
        // ── One-time consent gate ─────────────────────────────────────────────
        // Before uploading any local credentials to the cloud, the user must
        // explicitly agree that their keys will be encrypted and stored server-side.
        const CONSENT_KEY = 'dotshare.cloudCredentialsConsentGiven';
        const consentGiven = this.context.globalState.get<boolean>(CONSENT_KEY, false);

        if (!consentGiven) {
            const answer = await vscode.window.showInformationMessage(
                '☁️ DotSuite Cloud Scheduling',
                {
                    modal: true,
                    detail:
                        'To enable Cloud Scheduling, DotShare needs to securely sync your platform API keys ' +
                        'to the DotSuite server.\n\n' +
                        'The server receives your keys to run scheduled posts. Local SecretStorage does not protect server-side copies.\n' +
                        '🗑️ You can revoke access at any time from the DotSuite Dashboard.\n' +
                        'Sync applies to Telegram, Dev.to, Bluesky, Mastodon, LinkedIn and X.\n\n' +
                        'By clicking "I Agree", you consent to this secure key sync.',
                },
                'I Agree',
                'Cancel'
            );

            if (answer !== 'I Agree') {
                Logger.info('[PostHandler] User declined cloud credentials consent.');
                this.view.webview.postMessage({ command: 'SET_CONNECTIONS', platforms: [] });
                return;
            }

            // Persist consent so we never ask again on this machine
            await this.context.globalState.update(CONSENT_KEY, true);
            await this.context.globalState.update(MASTODON_CONSENT_KEY, true);
            Logger.info('[PostHandler] Cloud credentials consent granted by user.');
        } else if (
            this.context.globalState.get<boolean>(MASTODON_CONSENT_KEY) === undefined &&
            await this.context.secrets.get('mastodonToken')
        ) {
            // Consent given before Mastodon existed doesn't cover its token. Ask once, and
            // remember a refusal: the other platforms keep working either way.
            const answer = await vscode.window.showInformationMessage(
                '☁️ Schedule Mastodon posts in the cloud?',
                {
                    modal: true,
                    detail:
                        'This syncs your Mastodon access token and instance URL to the DotSuite server, ' +
                        'which uses them to run scheduled posts. Local SecretStorage does not protect server-side copies.\n' +
                        '🗑️ You can revoke access at any time from your Mastodon account settings.',
                },
                'I Agree',
                'Not Now'
            );
            await this.context.globalState.update(MASTODON_CONSENT_KEY, answer === 'I Agree');
        }
        // ─────────────────────────────────────────────────────────────────────

        // Sync local credentials to backend first (fire and forget to not block UI immediately)
        // We await it here so the subsequent getConnections includes them if newly added.
        try {
            const platformsToSync = ['telegram', 'devto', 'bluesky', 'mastodon', 'linkedin', 'x'] as SocialPlatform[];
            await SchedulerClient.syncLocalCredentials(this.context, platformsToSync);
        } catch (err) {
            Logger.warn('[PostHandler] Failed to sync local credentials', err);
        }

        // Fail-silent: if the user hasn't logged in yet, we get [] and the
        // webview will disable cloud-schedule buttons for all platforms.
        const platforms = await SchedulerClient.getConnections(this.context);
        this.view.webview.postMessage({ command: 'SET_CONNECTIONS', platforms });
    }

    private async handleCancelScheduledPost(message: Message): Promise<void> {
        const msg = message as unknown as { scheduledPostId: string };

        if (!msg.scheduledPostId) {
            this.sendError('Invalid cancel request: missing post ID');
            return;
        }

        const success = await SchedulerClient.cancelPost(this.context, msg.scheduledPostId);

        if (success) {
            this.sendSuccess('Scheduled post cancelled successfully!');
            await this.handleLoadScheduledPosts();
        } else {
            this.sendError('Failed to cancel scheduled post. Please check your connection or login status.');
        }
    }

    private async handleSchedulePost(message: Message): Promise<void> {
        const msg = message as unknown as {
            scheduledTime: string;
            platforms: string[];
            postText: string;
            mediaFilePaths?: string[];
        };

        if (!msg.scheduledTime || !msg.platforms?.length) {
            this.sendError('Invalid schedule data: missing time or platforms');
            return;
        }

        if (!msg.postText?.trim()) {
            this.sendError('Cannot schedule empty post');
            return;
        }

        // ── Auth Gate ─────────────────────────────────────────────────────────
        const token = await DotShareAuth.getToken(this.context);
        if (!token) {
            // Inform the webview so it unlocks the composer
            this.view.webview.postMessage({
                command: 'status',
                status: '🔑 You need to connect to DotSuite Cloud first. Opening login page…',
                type: 'warning'
            });

            // Open the DotSuite web app login page with VS Code intent
            const BASE_URL = DOTSUITE_WEB_URL;
            const scheme = vscode.env.uriScheme;
            const DOTSUITE_LOGIN_URL = `${BASE_URL}/en/login?intent=vscode&scheme=${scheme}`;
            await vscode.env.openExternal(vscode.Uri.parse(DOTSUITE_LOGIN_URL));

            // Note: Scheduling will resume after the user logs in and the extension URI handler catches the token
            return;
        }
        // ─────────────────────────────────────────────────────────────────────

        // Expected format for the backend (ISO 8601 string)
        let scheduledTimeLocal = msg.scheduledTime;
        if (scheduledTimeLocal.length === 16) {
            // Convert "YYYY-MM-DDTHH:mm" to ISO string if needed, 
            // but JS Date handles it locally. We'll send ISO string to Rust.
            scheduledTimeLocal = new Date(scheduledTimeLocal + ':00').toISOString();
        }

        const postData = { text: msg.postText.trim(), media: msg.mediaFilePaths || [] };

        const result = await SchedulerClient.schedulePost(
            this.context,
            postData,
            msg.platforms as ('linkedin' | 'telegram' | 'x' | 'discord' | 'bluesky' | 'mastodon')[],
            scheduledTimeLocal
        );

        if (result.success) {
            this.sendSuccess('Post scheduled successfully in the Cloud! ☁️');
            await this.handleLoadScheduledPosts();
        } else {
            if (result.errorCode === 'MISSING_OAUTH_CREDENTIALS') {
                const action = 'Open Dashboard';
                vscode.window.showErrorMessage(
                    '☁️ Cloud Scheduling requires secure OAuth. Please open the DotSuite Dashboard to connect your social accounts.',
                    action
                ).then(selection => {
                    if (selection === action) {
                        const BASE_URL = DOTSUITE_WEB_URL;
                        const scheme = vscode.env.uriScheme;
                        const DOTSUITE_LOGIN_URL = `${BASE_URL}/en/login?intent=vscode&scheme=${scheme}`;
                        vscode.env.openExternal(vscode.Uri.parse(DOTSUITE_LOGIN_URL));
                    }
                });
                // Send specific missing platforms message to webview toast
                this.sendError(`Failed to schedule post: ${result.message}`);
            } else {
                this.sendError(`Failed to schedule post: ${result.message || 'Unknown error'}`);
            }
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
            mediaFilePaths?: string[];  // ← Include uploaded image URLs from webview
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

        const postData: PostData = { text: postText, media: msg.mediaFilePaths || history[0]?.postData?.media || [] };

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
            const bot = telegramBot || await this.context.secrets.get('telegramBot') || '';
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



    private async shareToDiscordWithUpdate(post: PostData, postId: string | undefined): Promise<void> {
        // TODO: implement Discord webhook sharing
        Logger.info('[PostHandler] Discord sharing not yet implemented', { post, postId });
        this.sendError('Discord sharing coming soon!');
    }

    private async shareToXWithUpdate(post: PostData, postId: string | undefined): Promise<void> {
        try {
            const xAccessToken = await this.context.secrets.get('xAccessToken') || '';
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


    private async shareToBlueSkyWithUpdate(post: PostData, postId: string | undefined): Promise<void> {
        try {
            const identifier = (await this.context.secrets.get('blueskyIdentifier') || '').trim();
            const password = (await this.context.secrets.get('blueskyPassword') || '').trim();

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

    private async shareToMastodonWithUpdate(post: PostData, postId: string | undefined): Promise<void> {
        try {
            const instance = (await this.context.secrets.get('mastodonInstance') || '').trim();
            const token = (await this.context.secrets.get('mastodonToken') || '').trim();

            if (!instance || !token) {
                throw new Error('Mastodon credentials not configured. Go to Settings to add them.');
            }

            await shareToMastodon(instance, token, post);

            this.sendSuccess('Successfully posted to Mastodon!');
            if (postId) this.historyService.recordShare(postId, 'mastodon', true);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (postId) this.historyService.recordShare(postId, 'mastodon', false, errorMessage);
            throw new Error(`Error sharing to Mastodon: ${errorMessage}`);
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
                title: msg.title,
                body: bodyText,
                tags: msg.tags,
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
                text: bodyText,
                media: msg.mediaFilePaths || post.media,
                title: msg.title,
                tags: validation.sanitizedTags ?? msg.tags,
                description: msg.description,
                coverImage: msg.coverImage,
                published: msg.published,
                canonicalUrl: msg.canonicalUrl,
                series: msg.series
            });

            if (postId) this.historyService.recordShare(postId, 'devto', true, undefined, result.id.toString());
            this.view.webview.postMessage({ command: 'blogShareComplete', url: result.url, platform: 'devto' });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (postId) this.historyService.recordShare(postId, 'devto', false, errorMessage);
            throw new Error(`Error sharing to Dev.to: ${errorMessage}`);
        }
    }



    // ─────────────────────────────────────────────────────────────────────────
    // Unified Share (multi-platform)
    // ─────────────────────────────────────────────────────────────────────────

    private async unifiedSharePost(
        platforms: string[],
        post: PostData,
        mediaFilePaths: string[] = [],
        postId?: string
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

                    case 'discord':
                        await this.shareToDiscordWithUpdate(post, postId);
                        break;
                    case 'bluesky':
                        await this.shareToBlueSkyWithUpdate(post, postId);
                        break;
                    case 'mastodon':
                        await this.shareToMastodonWithUpdate(post, postId);
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
                        platform as SocialPlatform,
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
        const posts = message.posts as Array<{ text: string; mediaBase64?: string; mediaType?: string; mediaFilePaths?: string[] }>;

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
                    postMedia = await resolveThreadMedia(currentPost.mediaFilePaths, tempMediaPaths);
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
                const xAccessToken = await this.context.secrets.get('xAccessToken') || '';
                const xAccessSecret = await this.context.secrets.get('xAccessSecret') || '';
                // Pass structured posts to x platform handler
                await shareToX(xAccessToken, xAccessSecret, { text: '', posts: processedPosts });

            } else if (platform === 'bluesky') {
                const identifier = (await this.context.secrets.get('blueskyIdentifier') || '').trim();
                const password = (await this.context.secrets.get('blueskyPassword') || '').trim();

                if (!identifier || !password) {
                    this.sendError('BlueSky credentials not configured. Go to Settings to add them.');
                    this.view.webview.postMessage({ command: 'shareComplete' });
                    return;
                }

                // Images come compressed and optimized from the frontend (Webview Canvas)
                await shareToBlueSky(identifier, password, { text: '', posts: processedPosts });

            } else if (platform === 'mastodon') {
                const instance = (await this.context.secrets.get('mastodonInstance') || '').trim();
                const token = (await this.context.secrets.get('mastodonToken') || '').trim();

                if (!instance || !token) {
                    this.sendError('Mastodon credentials not configured. Go to Settings to add them.');
                    this.view.webview.postMessage({ command: 'shareComplete' });
                    return;
                }

                await shareToMastodon(instance, token, { text: '', posts: processedPosts });
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
                text: data.bodyMarkdown ?? '',
                title: data.title,
                tags: data.tags,
                published: data.status === 'published',
                description: data.description,
                coverImage: data.coverImage,
                canonicalUrl: data.canonicalUrl,
                series: data.series
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
        this.view.webview.postMessage({ command: 'status', status: redactSensitiveText(message), type: 'error' });
    }
}