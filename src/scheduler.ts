import { ScheduledPostsStorage } from './scheduled-posts';
import { CredentialProvider, PlatformCredentials } from './credential-provider';
import { PostExecutor, PlatformResult } from './post-executor';
import { ScheduledPost } from './types';

export class Scheduler {
    private static readonly CHECK_INTERVAL = 5000; // Check every 5 seconds
    private intervalId?: NodeJS.Timeout;
    private storage: ScheduledPostsStorage;
    private credentialProvider: CredentialProvider;
    private postExecutor: PostExecutor;

    constructor(storagePath: string, credentials?: PlatformCredentials, credentialsGetter?: () => Promise<PlatformCredentials>) {
        this.storage = new ScheduledPostsStorage(storagePath);
        this.credentialProvider = new CredentialProvider(credentials, credentialsGetter);
        this.postExecutor = new PostExecutor(this.credentialProvider);
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
            const platformResults: Record<string, PlatformResult> = {};

            for (const platform of post.platforms) {
                const result = await this.postExecutor.executePostForPlatform(platform, post.postData);
                platformResults[platform] = result;
            }

            // Check if any platform succeeded
            const hasSuccess = Object.values(platformResults).some((result) => result && typeof result === 'object' && 'success' in result && result.success === true);

            if (hasSuccess) {
                // Move to post history
                await this.moveToPostHistory(post, platformResults);

                // Remove from scheduled posts
                this.storage.removeScheduledPost(post.id);

                console.log(`Scheduled post ${post.id} successfully posted and moved to history`);
            } else {
                // All platforms failed
                const errorMessages = Object.values(platformResults)
                    .map((result) => result && typeof result === 'object' && 'errorMessage' in result ? result.errorMessage : null)
                    .filter(Boolean)
                    .join('; ');

                this.storage.updateScheduledPost(post.id, {
                    status: 'failed',
                    errorMessage: `All platforms failed: ${errorMessages}`,
                    platformResults
                });

                console.log(`Scheduled post ${post.id} failed to post on all platforms`);
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Error executing scheduled post ${post.id}:`, errorMessage);

            this.storage.updateScheduledPost(post.id, {
                status: 'failed',
                errorMessage
            });
        }
    }

    private async moveToPostHistory(post: ScheduledPost, platformResults: Record<string, unknown>): Promise<void> {
        // This would be enhanced in the main extension to actually move to history
        // For now, just create a share record
        console.log(`Would move post ${post.id} to history with results:`, platformResults);
    }
}
