import { shareToLinkedIn } from '../platforms/linkedin';
import { shareToTelegram } from '../platforms/telegram';
import { shareToX } from '../platforms/x';
import { shareToFacebook } from '../platforms/facebook';
import { shareToDiscord } from '../platforms/discord';
import { shareToReddit } from '../platforms/reddit';
import { shareToBlueSky } from '../platforms/bluesky';
import { CredentialProvider } from '../storage/credential-provider';
import { PostData } from '../types';
import { Logger } from '../utils/Logger';

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

    // ─────────────────────────────────────────────────────────────────────────

    private async executeLinkedInPost(postData: PostData): Promise<PlatformResult> {
        const token = await this.credentialProvider.getLinkedInToken();
        if (!token) {
            return { success: false, errorMessage: 'LinkedIn token not configured' };
        }

        await shareToLinkedIn(postData, token);
        return { success: true };
    }

    private async executeTelegramPost(postData: PostData, scheduledTime?: string): Promise<PlatformResult> {
        const { botToken, chatId } = await this.credentialProvider.getTelegramCredentials();
        if (!botToken || !chatId) {
            return { success: false, errorMessage: 'Telegram credentials not configured' };
        }

        const scheduleDate = scheduledTime ? new Date(scheduledTime) : undefined;
        await shareToTelegram(postData, botToken, chatId, undefined, scheduleDate);
        return { success: true };
    }

    private async executeXPost(postData: PostData): Promise<PlatformResult> {
        const { accessToken, accessSecret } = await this.credentialProvider.getXCredentials();
        if (!accessToken) {
            return { success: false, errorMessage: 'X/Twitter credentials not configured' };
        }

        await shareToX(accessToken, accessSecret || '', {
            text: postData.text,
            media: postData.media
        });
        return { success: true };
    }

    private async executeFacebookPost(postData: PostData): Promise<PlatformResult> {
        const { token, pageToken, pageId } = await this.credentialProvider.getFacebookCredentials();
        if (!token) {
            return { success: false, errorMessage: 'Facebook token not configured' };
        }

        await shareToFacebook(token, pageToken || null, {
            text: postData.text,
            media: postData.media,
            pageId
        });
        return { success: true };
    }

    private async executeDiscordPost(postData: PostData): Promise<PlatformResult> {
        const webhookUrl = await this.credentialProvider.getDiscordWebhookUrl();
        if (!webhookUrl) {
            return { success: false, errorMessage: 'Discord webhook not configured' };
        }

        await shareToDiscord(webhookUrl, {
            text: postData.text,
            media: postData.media
        });
        return { success: true };
    }

    private async executeRedditPost(postData: PostData): Promise<PlatformResult> {
        const { accessToken, refreshToken } = await this.credentialProvider.getRedditCredentials();
        if (!accessToken) {
            return { success: false, errorMessage: 'Reddit credentials not configured' };
        }

        const subreddit = await this.credentialProvider.getRedditSubreddit();
        if (!subreddit) {
            return {
                success: false,
                errorMessage: 'Reddit subreddit not configured. Go to Settings to set your target community.'
            };
        }

        const cleanSubreddit = subreddit.startsWith('r/') ? subreddit.substring(2) : subreddit;

        const postName = await shareToReddit(
            accessToken,
            refreshToken || undefined,
            {
                text:       postData.text,
                media:      postData.media,
                subreddit:  cleanSubreddit,
                title:      postData.text.substring(0, 300),
                isSelfPost: true
            }
        );

        return { success: true, postName: postName || undefined };
    }

    private async executeBlueSkyPost(postData: PostData): Promise<PlatformResult> {
        const { identifier, password } = await this.credentialProvider.getBlueSkyCredentials();
        if (!identifier || !password) {
            return { success: false, errorMessage: 'BlueSky credentials not configured' };
        }

        const postUri = await shareToBlueSky(identifier, password, {
            text: postData.text,
            media: postData.media
        });

        return { success: true, postUri: postUri || undefined };
    }
}