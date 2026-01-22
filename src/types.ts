export interface PostData {
    text: string;
    media?: string[]; // Array to support multiple media files
}

export interface ShareRecord {
    platform: 'linkedin' | 'telegram' | 'x' | 'facebook' | 'discord' | 'reddit' | 'bluesky';
    timestamp: string;
    success: boolean;
    errorMessage?: string;
    postId?: string; // Platform-specific post ID if available
}

export interface HistoricalPost {
    id: string;
    timestamp: string;
    aiProvider: 'gemini' | 'openai' | 'xai';
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

// New status types for better state management
export type PostStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'retrying' | 'server-scheduled';

export interface ScheduledPost {
    id: string;
    scheduledTime: string; // ISO 8601 timestamp
    postData: PostData;
    aiProvider: 'gemini' | 'openai' | 'xai';
    aiModel: string;
    platforms: ('linkedin' | 'telegram' | 'x' | 'facebook' | 'discord' | 'reddit' | 'bluesky')[]; // Which platforms to post to
    status: PostStatus; // Updated status type
    schedulingType: 'server' | 'client'; // How this post is scheduled
    created: string; // When this scheduled post was created
    errorMessage?: string;
    postedTime?: string; // Actual time it was posted
    attempts?: number; // Number of retry attempts
    lastAttempt?: string; // Last attempt timestamp
    platformResults?: {
        linkedin?: {
            success: boolean;
            postId?: string;
            errorMessage?: string;
        };
        telegram?: {
            success: boolean;
            messageId?: string;
            errorMessage?: string;
        };
        x?: {
            success: boolean;
            postId?: string;
            errorMessage?: string;
        };
        facebook?: {
            success: boolean;
            postId?: string;
            errorMessage?: string;
        };
        discord?: {
            success: boolean;
            messageId?: string;
            errorMessage?: string;
        };
        reddit?: {
            success: boolean;
            postId?: string;
            errorMessage?: string;
            score?: number;
            comments?: number;
            permalink?: string;
        };
        bluesky?: {
            success: boolean;
            postId?: string;
            errorMessage?: string;
        };
    };
}

export interface LinkedInPostTarget {
    type: 'profile' | 'page';
    id?: string; // Organization ID for pages
    name?: string; // Organization name for pages
}

export interface SelectedModel {
    provider: 'gemini' | 'openai' | 'xai';
    model: string;
    apiKey?: string; // Optional since it can be empty for storage
}

export interface Message {
    command: string;
    selectedModel?: SelectedModel;
    linkedinToken?: string;
    linkedinTarget?: LinkedInPostTarget; // New: for LinkedIn profile/page posting
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
    post?: string;
    mediaPath?: string; // Webview URL for display in UI
    mediaFilePath?: string; // Filesystem path for operations
    fileName?: string;
    fileSize?: number;
    mediaFiles?: Array<{
        mediaPath: string;
        mediaFilePath: string;
        fileName: string;
        fileSize: number;
    }>;
    mediaFilePaths?: string[];
    postText?: string;
    postHistory?: HistoricalPost[];
    analytics?: AnalyticsSummary;
    // Status messages
    status?: string;
    type?: 'success' | 'error' | 'warning';
    showSupportAction?: boolean;
    // Reddit-specific fields
    redditTitle?: string;
    redditFlairId?: string;
    redditPostType?: 'self' | 'link';
    redditSpoiler?: boolean;
    // Scheduled posts
    scheduledPosts?: ScheduledPost[];
    scheduledTime?: string; // ISO string for scheduling
    selectedPlatforms?: ('linkedin' | 'telegram' | 'x' | 'facebook' | 'discord' | 'reddit' | 'bluesky')[];
    scheduledPostId?: string; // For edit/delete operations
    // Saved APIs
    platform?: string;
    savedApis?: ApiConfiguration[];
    apiId?: string;
    apiConfig?: ApiConfiguration;
    // Reddit token generation
    tokens?: {
        accessToken: string;
        refreshToken: string;
        clientId: string;
        clientSecret: string;
    };
    // Reddit post management
    posts?: RedditPost[];
    username?: string;
    limit?: number;
    postId?: string;
    newText?: string;
    // Model management
    provider?: 'gemini' | 'openai' | 'xai';
    geminiModels?: string[];
    openaiModels?: string[];
    xaiModels?: string[];
}

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

// API Configuration system types
export interface LinkedInApiConfig {
    linkedinToken: string;
}

export interface TelegramApiConfig {
    telegramBot: string;
    telegramChat: string;
}

export interface XApiConfig {
    xAccessToken: string;
    xAccessSecret: string;
}

export interface FacebookApiConfig {
    facebookToken: string;
    facebookPageToken?: string;
    facebookPageId?: string;
}

export interface DiscordApiConfig {
    discordWebhook: string;
}

export interface RedditApiConfig {
    redditAccessToken: string;
    redditRefreshToken: string;
}

export interface BlueskyApiConfig {
    blueskyIdentifier: string;
    blueskyPassword: string;
}

export type ApiCredentials = LinkedInApiConfig | TelegramApiConfig | XApiConfig | FacebookApiConfig | DiscordApiConfig | RedditApiConfig | BlueskyApiConfig;

export interface SavedApiConfiguration {
    id: string;
    name: string;
    platform: 'linkedin' | 'telegram' | 'x' | 'facebook' | 'discord' | 'reddit' | 'bluesky';
    created: string;
    lastUsed?: string;
    isDefault?: boolean; // Whether this is the default configuration for auto-fill
    credentials: ApiCredentials;
}

export interface MediaFile {
    mediaPath: string; // Webview URL for display
    mediaFilePath: string; // Filesystem path for operations
    fileName: string;
    fileSize: number;
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
