// ---------------------------------------------------------
// Core Types
// ---------------------------------------------------------

export type SocialPlatform = 'linkedin' | 'telegram' | 'x' | 'discord' | 'bluesky' | 'devto';
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

    discordShares: number;
    blueskyShares: number;
    devtoShares: number;
    successRate: number;
}

// ---------------------------------------------------------
// Scheduler Types
// ---------------------------------------------------------

export interface ScheduledPost {
    id: string;
    scheduled_at: string;
    text_preview: string;
    platforms: SocialPlatform[];
    status: string;
    has_media: boolean;
    tier: 'free' | 'basic' | 'pro' | 'max';
}

// ---------------------------------------------------------
// Platform Specific Types
// ---------------------------------------------------------

export interface LinkedInPostTarget {
    type: 'profile' | 'page';
    id?: string;
    name?: string;
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

    discordWebhookUrl?: string;

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

    // v3.1 — Drafts
    drafts?: Draft[];
    draft?: Draft;
    draftId?: string;
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


// ---------------------------------------------------------
// Configuration & Credentials Types
// ---------------------------------------------------------

export interface SchedulerCredentials {
    linkedinToken: string;
    telegramBot: string;
    telegramChat: string;
    xAccessToken: string;
    xAccessSecret: string;

    discordWebhookUrl: string;
    blueskyIdentifier: string;
    blueskyPassword: string;
}

export interface LinkedInApiConfig { linkedinToken: string; }
export interface TelegramApiConfig { telegramBot: string; telegramChat: string; }
export interface XApiConfig { xAccessToken: string; xAccessSecret: string; }

export interface DiscordApiConfig { discordWebhook: string; }

export interface BlueskyApiConfig { blueskyIdentifier: string; blueskyPassword: string; }

export type ApiCredentials =
    | LinkedInApiConfig
    | TelegramApiConfig
    | XApiConfig

    | DiscordApiConfig
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

export type BlogPlatform = 'devto';
export type DraftStatus = 'draft' | 'published' | 'unlisted';
export type WebViewPage = 'post' | 'publish' | 'analytics' | 'settings' | 'drafts';

export type DraftType = 'social' | 'article';

export interface Draft {
    id: string;
    type: DraftType;
    timestamp: string;
    platforms: SocialPlatform[];
    data: PostData | BlogPost;
    title?: string; // Descriptive title for the draft
    isRemote?: boolean;
    remoteId?: string;
}

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
    series?: string;
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

// ==========================================================
// v4.0 — SaaS Billing & Quota Types
// ==========================================================

export interface TierInfo {
    tier: 'free' | 'basic' | 'pro' | 'max';
    is_paid: boolean;
    posts_used: number;
    posts_quota: number;
    images_used: number;
    images_quota: number;
    subscription_ends_at: string | null;
}