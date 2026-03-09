// ---------------------------------------------------------
// Core Types
// ---------------------------------------------------------

export type SocialPlatform = 'linkedin' | 'telegram' | 'x' | 'facebook' | 'discord' | 'reddit' | 'bluesky';
export type AIProvider = 'gemini' | 'openai' | 'xai' | 'claude';
export type PostStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'retrying' | 'server-scheduled';

// ---------------------------------------------------------
// Post & Media Types
// ---------------------------------------------------------

export interface PostData {
    text: string;
    media?: string[]; // Array to support multiple media files
}

export interface MediaFile {
    mediaPath: string; // Webview URL for display
    mediaFilePath: string; // Filesystem path for operations
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
    postId?: string; // Platform-specific post ID if available
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
    successRate: number;
}

// ---------------------------------------------------------
// Scheduler Types
// ---------------------------------------------------------

export interface ScheduledPost {
    id: string;
    scheduledTime: string; // ISO 8601 timestamp
    postData: PostData;
    aiProvider: AIProvider;
    aiModel: string;
    platforms: SocialPlatform[]; // Which platforms to post to
    status: PostStatus;
    schedulingType: 'server' | 'client'; // How this post is scheduled
    created: string; // When this scheduled post was created
    errorMessage?: string;
    postedTime?: string; // Actual time it was posted
    attempts?: number; // Number of retry attempts
    lastAttempt?: string; // Last attempt timestamp
    platformResults?: {
        linkedin?: { success: boolean; postId?: string; errorMessage?: string; };
        telegram?: { success: boolean; messageId?: string; errorMessage?: string; };
        x?: { success: boolean; postId?: string; errorMessage?: string; };
        facebook?: { success: boolean; postId?: string; errorMessage?: string; };
        discord?: { success: boolean; messageId?: string; errorMessage?: string; };
        reddit?: { success: boolean; postId?: string; errorMessage?: string; score?: number; comments?: number; permalink?: string; };
        bluesky?: { success: boolean; postId?: string; errorMessage?: string; };
    };
}

// ---------------------------------------------------------
// Platform Specific Types
// ---------------------------------------------------------

export interface LinkedInPostTarget {
    type: 'profile' | 'page';
    id?: string; // Organization ID for pages
    name?: string; // Organization name for pages
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
    apiKey?: string; // Optional since it can be empty for storage
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
    
    // API Tokens & Credentials
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

export type ApiCredentials = LinkedInApiConfig | TelegramApiConfig | XApiConfig | FacebookApiConfig | DiscordApiConfig | RedditApiConfig | BlueskyApiConfig;

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