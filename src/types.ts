// ---------------------------------------------------------
// Core Types
// ---------------------------------------------------------

export type SocialPlatform = 'linkedin' | 'telegram' | 'x' | 'facebook' | 'discord' | 'reddit' | 'bluesky' | 'devto' | 'medium';
export type AIProvider = 'gemini' | 'openai' | 'xai' | 'claude';
export type PostStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'retrying' | 'server-scheduled';

// ---------------------------------------------------------
// Post & Media Types
// ---------------------------------------------------------

export interface PostData {
    text: string;
    media?: string[];
}

export interface MediaFile {
    mediaPath: string;
    mediaFilePath: string;
    fileName: string;
    fileSize: number;
}

// ---------------------------------------------------------
// History & Analytics Types
// ---------------------------------------------------------

export interface ShareRecord {
    platform: SocialPlatform;
    timestamp: string;
    success: boolean;
    errorMessage?: string;
    postId?: string;
}

export interface HistoricalPost {
    id: string;
    timestamp: string;
    aiProvider: AIProvider;
    aiModel: string;
    postData: PostData;
    shares: ShareRecord[];
}

export interface AnalyticsSummary {
    totalPosts: number;
    successfulShares: number;
    failedShares: number;
    linkedinShares: number;
    telegramShares: number;
    xShares: number;
    facebookShares: number;
    discordShares: number;
    redditShares: number;
    blueskyShares: number;
    devtoShares: number;
    mediumShares: number;
    successRate: number;
}

// ---------------------------------------------------------
// Scheduler Types
// ---------------------------------------------------------

export interface ScheduledPost {
    id: string;
    scheduledTime: string;
    postData: PostData;
    aiProvider: AIProvider;
    aiModel: string;
    platforms: SocialPlatform[];
    status: PostStatus;
    schedulingType: 'server' | 'client';
    created: string;
    errorMessage?: string;
    postedTime?: string;
    attempts?: number;
    lastAttempt?: string;
    platformResults?: {
        linkedin?: { success: boolean; postId?: string; errorMessage?: string; };
        telegram?: { success: boolean; messageId?: string; errorMessage?: string; };
        x?: { success: boolean; postId?: string; errorMessage?: string; };
        facebook?: { success: boolean; postId?: string; errorMessage?: string; };
        discord?: { success: boolean; messageId?: string; errorMessage?: string; };
        reddit?: { success: boolean; postId?: string; errorMessage?: string; score?: number; comments?: number; permalink?: string; };
        bluesky?: { success: boolean; postId?: string; errorMessage?: string; };
        devto?:   { success: boolean; url?: string; errorMessage?: string; };
        medium?:  { success: boolean; url?: string; errorMessage?: string; };
    };
}

// ---------------------------------------------------------
// Platform Specific Types
// ---------------------------------------------------------

export interface LinkedInPostTarget {
    type: 'profile' | 'page';
    id?: string;
    name?: string;
}

export interface RedditPost {
    id: string;
    title: string;
    subreddit: string;
    score: number;
    permalink: string;
    created: number;
}

export interface AccountOption {
    id: string;
    name: string;
    isDefault?: boolean;
    lastUsed?: string;
}

// ---------------------------------------------------------
// AI Model Types
// ---------------------------------------------------------

export interface SelectedModel {
    provider: AIProvider;
    model: string;
    apiKey?: string;
}

export interface GeminiModel {
    name: string;
    supportedGenerationMethods?: string[];
    description?: string;
    version?: string;
}

export interface GeminiModelsResponse {
    models: GeminiModel[];
}

export interface XAIResponse {
    choices: Array<{ message: { content: string } }>;
}

export interface XAIModelsResponse {
    data: { id: string }[];
}

// ---------------------------------------------------------
// Webview Message Types
// ---------------------------------------------------------

export interface Message {
    command: string;
    selectedModel?: SelectedModel;

    // Credentials
    linkedinToken?: string;
    linkedinTarget?: LinkedInPostTarget;
    telegramBot?: string;
    telegramChat?: string;
    xAccessToken?: string;
    xAccessSecret?: string;
    facebookToken?: string;
    facebookPageToken?: string;
    facebookPageId?: string;
    discordWebhookUrl?: string;
    redditAccessToken?: string;
    redditRefreshToken?: string;
    redditSubreddit?: string;
    redditClientId?: string;
    redditClientSecret?: string;
    redditUsername?: string;
    redditPassword?: string;
    redditApiName?: string;
    blueskyIdentifier?: string;
    blueskyPassword?: string;
    
    // Post Content & Media
    post?: string;
    mediaPath?: string; 
    mediaFilePath?: string; 
    fileName?: string;
    fileSize?: number;
    mediaFiles?: MediaFile[];
    mediaFilePaths?: string[];
    postText?: string;
    
    // History & Analytics
    postHistory?: HistoricalPost[];
    analytics?: AnalyticsSummary;
    
    // Status & UI
    status?: string;
    type?: 'success' | 'error' | 'warning';
    showSupportAction?: boolean;
    
    // Reddit Specific
    redditTitle?: string;
    redditFlairId?: string;
    redditPostType?: 'self' | 'link';
    redditSpoiler?: boolean;
    
    // Scheduling
    scheduledPosts?: ScheduledPost[];
    scheduledTime?: string; 
    selectedPlatforms?: SocialPlatform[];
    scheduledPostId?: string; 
    
    // Configurations
    platform?: string;
    savedApis?: ApiConfiguration[];
    apiId?: string;
    apiConfig?: ApiConfiguration;
    
    // Reddit Token Flow
    tokens?: {
        accessToken: string;
        refreshToken: string;
        clientId: string;
        clientSecret: string;
    };
    
    // Reddit Management
    posts?: RedditPost[];
    username?: string;
    limit?: number;
    postId?: string;
    newText?: string;
    
    // Model Management
    provider?: AIProvider;
    geminiModels?: string[];
    openaiModels?: string[];
    xaiModels?: string[];
    claudeModels?: string[];

    // v3.0 — navigate command
    page?: WebViewPage;

    // v3.0 — blog file content (loadFile response)
    frontmatter?: FrontMatter;
    body?: string;
    raw?: string;
}

// ---------------------------------------------------------
// Error Types
// ---------------------------------------------------------

export interface APIError {
    message: string;
    code?: string | number;
}

export interface LinkedInError {
    serviceErrorCode: number;
    message: string;
    status: number;
}

export interface RedditError {
    error?: {
        message: string;
        type: string;
    };
    errors?: Array<[string, string, string?]>;
}

// ---------------------------------------------------------
// Configuration & Credentials Types
// ---------------------------------------------------------

export interface SchedulerCredentials {
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
    redditSubreddit: string;
    blueskyIdentifier: string;
    blueskyPassword: string;
}

export interface LinkedInApiConfig { linkedinToken: string; }
export interface TelegramApiConfig { telegramBot: string; telegramChat: string; }
export interface XApiConfig { xAccessToken: string; xAccessSecret: string; }
export interface FacebookApiConfig { facebookToken: string; facebookPageToken?: string; facebookPageId?: string; }
export interface DiscordApiConfig { discordWebhook: string; }
export interface RedditApiConfig { redditAccessToken: string; redditRefreshToken: string; }
export interface BlueskyApiConfig { blueskyIdentifier: string; blueskyPassword: string; }

export type ApiCredentials =
    | LinkedInApiConfig
    | TelegramApiConfig
    | XApiConfig
    | FacebookApiConfig
    | DiscordApiConfig
    | RedditApiConfig
    | BlueskyApiConfig;

export interface SavedApiConfiguration {
    id: string;
    name: string;
    platform: SocialPlatform;
    created: string;
    lastUsed?: string;
    isDefault?: boolean;
    credentials: ApiCredentials;
}

export interface ApiConfiguration {
    id: string;
    name: string;
    platform: string;
    credentials: {
        [key: string]: string;
    };
    created: string;
    lastUsed?: string;
    isDefault?: boolean;
}

// ==========================================================
// v3.0 — Blog / Publisher Types
// ==========================================================

export type BlogPlatform = 'devto' | 'medium';
export type DraftStatus = 'draft' | 'published' | 'unlisted';
export type WebViewPage = 'post' | 'publish' | 'analytics' | 'settings';

/** YAML frontmatter parsed from .md files */
export interface FrontMatter {
    title?: string;
    tags?: string[];
    canonical_url?: string;
    description?: string;
    published?: boolean;
    date?: string;
    cover_image?: string;
    series?: string;
}

/** A blog article ready for publishing */
export interface BlogPost {
    id?: string;
    title: string;
    bodyMarkdown: string;
    tags: string[];
    canonicalUrl?: string;
    description?: string;
    coverImage?: string;
    status: DraftStatus;
    platformId: BlogPlatform;
    publishedAt?: string;
    url?: string;
}

/** Per-platform publish target */
export interface PublishTarget {
    platformId: BlogPlatform;
    status: DraftStatus;
    canonicalUrl?: string;
}

/** Result after a publish attempt */
export interface PublishResult {
    platformId: BlogPlatform;
    success: boolean;
    url?: string;
    id?: string;
    error?: string;
}

// Dev.to API shapes
export interface DevToArticle {
    id?: number;
    title: string;
    body_markdown: string;
    tags: string[];         // max 4
    canonical_url?: string;
    description?: string;
    published: boolean;
    cover_image?: string;
}

export interface DevToArticleResponse {
    id: number;
    title: string;
    url: string;
    published: boolean;
    published_at?: string;
}

// Medium API shapes
export interface MediumPost {
    title: string;
    contentFormat: 'markdown' | 'html';
    content: string;
    tags?: string[];        // max 5
    canonicalUrl?: string;
    publishStatus: 'public' | 'draft' | 'unlisted';
    notifyFollowers?: boolean;
}

export interface MediumPostResponse {
    id: string;
    title: string;
    url: string;
    publishStatus: string;
    publishedAt?: number;
}

export interface MediumUser {
    id: string;
    username: string;
    name: string;
    url: string;
}

// ==========================================================
// v3.0 — WebView State (WEBVIEW_STATE / StateManager)
// ==========================================================

export interface WebViewState {
    activePage: WebViewPage;
    socialPostDraft: string;
    blogPostDraft: Partial<BlogPost>;
    publishTargets: PublishTarget[];
    selectedPlatforms: SocialPlatform[];
    lastUpdated: string;
}