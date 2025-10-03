export interface PostData {
    text: string;
    media?: string[]; // Array to support multiple media files
}

export interface ShareRecord {
    platform: 'linkedin' | 'telegram';
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
    successRate: number;
}

export interface ScheduledPost {
    id: string;
    scheduledTime: string; // ISO 8601 timestamp
    postData: PostData;
    aiProvider: 'gemini' | 'openai' | 'xai';
    aiModel: string;
    platforms: ('linkedin' | 'telegram')[]; // Which platforms to post to
    status: 'scheduled' | 'processing' | 'posted' | 'failed';
    created: string; // When this scheduled post was created
    errorMessage?: string;
    postedTime?: string; // Actual time it was posted
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
    };
}

export interface Message {
    command: string;
    geminiKey?: string;
    linkedinToken?: string;
    telegramBot?: string;
    telegramChat?: string;
    post?: string;
    mediaPath?: string; // Webview URL for display in UI
    mediaFilePath?: string; // Filesystem path for file operations
    fileName?: string;
    fileSize?: number;
    postHistory?: HistoricalPost[];
    analytics?: AnalyticsSummary;
    // Scheduled posts
    scheduledPosts?: ScheduledPost[];
    scheduledTime?: string; // ISO string for scheduling
    selectedPlatforms?: ('linkedin' | 'telegram')[];
    scheduledPostId?: string; // For edit/delete operations
}
