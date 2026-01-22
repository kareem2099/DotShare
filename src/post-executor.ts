import { shareToLinkedIn } from './linkedin';
import { shareToTelegram } from './telegram';
import { shareToX } from './x';
import { shareToFacebook } from './facebook';
import { shareToDiscord } from './discord';
import { shareToReddit } from './reddit';
import { shareToBlueSky } from './bluesky';
import { CredentialProvider } from './credential-provider';
import { PostData } from './types';
import { Logger } from './utils/Logger';

export interface PlatformResult {
    success: boolean;
    postId?: string;
    messageId?: string;
    tweetId?: string;
    postName?: string;
    postUri?: string;
    errorMessage?: string;
}

export class PostExecutor {
    private credentialProvider: CredentialProvider;

    constructor(credentialProvider: CredentialProvider) {
        this.credentialProvider = credentialProvider;
    }

    public async executePostForPlatform(
        platform: string,
        postData: PostData,
        scheduledTime?: string
    ): Promise<PlatformResult> {
        try {
            switch (platform) {
                case 'linkedin':
                    return await this.executeLinkedInPost(postData);
                case 'telegram':
                    return await this.executeTelegramPost(postData, scheduledTime);
                case 'x':
                    return await this.executeXPost(postData);
                case 'facebook':
                    return await this.executeFacebookPost(postData);
                case 'discord':
                    return await this.executeDiscordPost(postData);
                case 'reddit':
                    return await this.executeRedditPost(postData);
                case 'bluesky':
                    return await this.executeBlueSkyPost(postData);
                default:
                    return {
                        success: false,
                        errorMessage: `Unsupported platform: ${platform}`
                    };
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error(`Failed to post to ${platform}:`, errorMessage);
            return {
                success: false,
                errorMessage
            };
        }
    }

    private async executeLinkedInPost(postData: PostData): Promise<PlatformResult> {
        const linkedinToken = await this.credentialProvider.getLinkedInToken();
        if (!linkedinToken) {
            return {
                success: false,
                errorMessage: 'LinkedIn token not configured'
            };
        }

        await shareToLinkedIn(postData, linkedinToken);
        return {
            success: true,
            postId: undefined // Could be enhanced to capture post ID
        };
    }

    private async executeTelegramPost(postData: PostData, scheduledTime?: string): Promise<PlatformResult> {
        const credentials = await this.credentialProvider.getTelegramCredentials();
        if (!credentials.botToken || !credentials.chatId) {
            return {
                success: false,
                errorMessage: 'Telegram credentials not configured'
            };
        }

        const scheduleDate = scheduledTime ? new Date(scheduledTime) : undefined;
        await shareToTelegram(postData, credentials.botToken, credentials.chatId, undefined, scheduleDate);
        return {
            success: true,
            messageId: undefined // Could be enhanced to capture message ID
        };
    }

    private async executeXPost(postData: PostData): Promise<PlatformResult> {
        const credentials = await this.credentialProvider.getXCredentials();
        if (!credentials.accessToken || !credentials.accessSecret) {
            return {
                success: false,
                errorMessage: 'X/Twitter credentials not configured'
            };
        }

        await shareToX(credentials.accessToken, credentials.accessSecret, {
            text: postData.text,
            media: postData.media
        });
        return {
            success: true,
            tweetId: undefined // Could be enhanced to capture tweet ID
        };
    }

    private async executeFacebookPost(postData: PostData): Promise<PlatformResult> {
        const credentials = await this.credentialProvider.getFacebookCredentials();
        if (!credentials.token) {
            return {
                success: false,
                errorMessage: 'Facebook token not configured'
            };
        }

        const pageToken = credentials.pageToken || null;
        const pageId = credentials.pageId || undefined;

        await shareToFacebook(credentials.token, pageToken, {
            text: postData.text,
            media: postData.media,
            pageId
        });
        return {
            success: true,
            postId: undefined // Could be enhanced to capture post ID
        };
    }

    private async executeDiscordPost(postData: PostData): Promise<PlatformResult> {
        const webhookUrl = await this.credentialProvider.getDiscordWebhookUrl();
        if (!webhookUrl) {
            return {
                success: false,
                errorMessage: 'Discord webhook not configured'
            };
        }

        await shareToDiscord(webhookUrl, {
            text: postData.text,
            media: postData.media
        });
        return {
            success: true,
            messageId: undefined // Could be enhanced to capture message ID
        };
    }

    private async executeRedditPost(postData: PostData): Promise<PlatformResult> {
        const credentials = await this.credentialProvider.getRedditCredentials();
        if (!credentials.accessToken || !credentials.refreshToken) {
            return {
                success: false,
                errorMessage: 'Reddit credentials not configured'
            };
        }

        await shareToReddit(credentials.accessToken, credentials.refreshToken, {
            text: postData.text,
            media: postData.media,
            subreddit: 'test', // Default subreddit - could be enhanced to store per-post subreddit
            isSelfPost: true
        });
        return {
            success: true,
            postName: undefined // Could be enhanced to capture post name (t3_xxx)
        };
    }

    private async executeBlueSkyPost(postData: PostData): Promise<PlatformResult> {
        const credentials = await this.credentialProvider.getBlueSkyCredentials();
        if (!credentials.identifier || !credentials.password) {
            return {
                success: false,
                errorMessage: 'BlueSky credentials not configured'
            };
        }

        await shareToBlueSky(credentials.identifier, credentials.password, {
            text: postData.text,
            media: postData.media
        });
        return {
            success: true,
            postUri: undefined // Could be enhanced to capture post URI
        };
    }
}
