import { ScheduledPostsStorage } from './scheduled-posts';
import { shareToLinkedIn } from './linkedin';
import { shareToTelegram } from './telegram';
import { ScheduledPost } from './types';

export class Scheduler {
    private static readonly CHECK_INTERVAL = 5000; // Check every 5 seconds
    private intervalId?: NodeJS.Timeout;
    private storage: ScheduledPostsStorage;
    private credentialsGetter?: () => Promise<{
        linkedinToken?: string;
        telegramBot?: string;
        telegramChat?: string;
    }>;
    private credentials?: {
        linkedinToken?: string;
        telegramBot?: string;
        telegramChat?: string;
    };

    constructor(storagePath: string, credentials?: {
        linkedinToken?: string;
        telegramBot?: string;
        telegramChat?: string;
    }, credentialsGetter?: () => Promise<{
        linkedinToken?: string;
        telegramBot?: string;
        telegramChat?: string;
    }>) {
        this.storage = new ScheduledPostsStorage(storagePath);
        this.credentials = credentials;
        this.credentialsGetter = credentialsGetter;
    }

    public start(): void {
        console.log('Starting DotShare scheduler...');

        // Check immediately on start
        this.checkScheduledPosts();

        // Then check periodically
        this.intervalId = setInterval(() => {
            this.checkScheduledPosts();
        }, Scheduler.CHECK_INTERVAL);
    }

    public stop(): void {
        console.log('Stopping DotShare scheduler...');
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }

    private async checkScheduledPosts(): Promise<void> {
        try {
            const duePosts = this.storage.getScheduledPostsDue();
            if (duePosts.length === 0) {
                return;
            }

            console.log(`Found ${duePosts.length} scheduled posts due for execution`);

            for (const post of duePosts) {
                await this.executeScheduledPost(post);
            }
        } catch (error) {
            console.error('Error checking scheduled posts:', error);
        }
    }

    private async executeScheduledPost(post: ScheduledPost): Promise<void> {
        try {
            // Mark as processing
            this.storage.updateScheduledPost(post.id, {
                status: 'processing',
                postedTime: new Date().toISOString()
            });

            console.log(`Executing scheduled post: ${post.id}`);

            // Execute for each selected platform
            const platformResults: any = {};

            for (const platform of post.platforms) {
                try {
                    if (platform === 'linkedin') {
                        const linkedinToken = await this.getLinkedInToken();
                        if (linkedinToken) {
                            await shareToLinkedIn(post.postData, linkedinToken);
                            platformResults.linkedin = {
                                success: true,
                                postId: undefined // Could be enhanced to capture post ID
                            };
                        } else {
                            platformResults.linkedin = {
                                success: false,
                                errorMessage: 'LinkedIn token not configured'
                            };
                        }
                    } else if (platform === 'telegram') {
                        const telegramCredentials = await this.getTelegramCredentials();
                        if (telegramCredentials.botToken && telegramCredentials.chatId) {
                            await shareToTelegram(post.postData, telegramCredentials.botToken, telegramCredentials.chatId);
                            platformResults.telegram = {
                                success: true,
                                messageId: undefined // Could be enhanced to capture message ID
                            };
                        } else {
                            platformResults.telegram = {
                                success: false,
                                errorMessage: 'Telegram credentials not configured'
                            };
                        }
                    }
                } catch (error: any) {
                    console.error(`Failed to post to ${platform}:`, error);
                    platformResults[platform] = {
                        success: false,
                        errorMessage: error.message
                    };
                }
            }

            // Check if any platform succeeded
            const hasSuccess = Object.values(platformResults).some((result: any) => result.success);

            if (hasSuccess) {
                // Move to post history
                await this.moveToPostHistory(post, platformResults);

                // Remove from scheduled posts
                this.storage.removeScheduledPost(post.id);

                console.log(`Scheduled post ${post.id} successfully posted and moved to history`);
            } else {
                // All platforms failed
                const errorMessages = Object.values(platformResults)
                    .map((result: any) => result.errorMessage)
                    .filter(Boolean)
                    .join('; ');

                this.storage.updateScheduledPost(post.id, {
                    status: 'failed',
                    errorMessage: `All platforms failed: ${errorMessages}`,
                    platformResults
                });

                console.log(`Scheduled post ${post.id} failed to post on all platforms`);
            }

        } catch (error: any) {
            console.error(`Error executing scheduled post ${post.id}:`, error);

            this.storage.updateScheduledPost(post.id, {
                status: 'failed',
                errorMessage: error.message
            });
        }
    }

    private async moveToPostHistory(post: ScheduledPost, platformResults: any): Promise<void> {
        // This would be enhanced in the main extension to actually move to history
        // For now, just create a share record
        console.log(`Would move post ${post.id} to history with results:`, platformResults);
    }

    private async getLinkedInToken(): Promise<string | undefined> {
        if (this.credentialsGetter) {
            const freshCredentials = await this.credentialsGetter();
            return freshCredentials.linkedinToken;
        }
        return this.credentials?.linkedinToken;
    }

    private async getTelegramCredentials(): Promise<{botToken?: string, chatId?: string}> {
        if (this.credentialsGetter) {
            const freshCredentials = await this.credentialsGetter();
            return {
                botToken: freshCredentials.telegramBot,
                chatId: freshCredentials.telegramChat
            };
        }
        return {
            botToken: this.credentials?.telegramBot,
            chatId: this.credentials?.telegramChat
        };
    }
}
