import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ScheduledPostsStorage } from './scheduled-posts';
import { CredentialProvider, PlatformCredentials } from './credential-provider';
import { PostExecutor, PlatformResult } from './post-executor';
import { ScheduledPost, PostStatus } from './types';
import { Logger } from './utils/Logger';

// Post status constants for type safety
const POST_STATUS = {
    QUEUED: 'queued' as PostStatus,
    PROCESSING: 'processing' as PostStatus,
    COMPLETED: 'completed' as PostStatus,
    FAILED: 'failed' as PostStatus,
    RETRYING: 'retrying' as PostStatus,
    SERVER_SCHEDULED: 'server-scheduled' as PostStatus
} as const;

const CHECK_INTERVAL = 60 * 1000; // Check every minute (more reasonable interval)
const MAX_RETRIES = 3; // Maximum retry attempts

export class Scheduler {
    private intervalId?: NodeJS.Timeout;
    private storage: ScheduledPostsStorage;
    private credentialProvider: CredentialProvider;
    private postExecutor: PostExecutor;
    private isRunning = false;
    private lockFilePath: string;

    constructor(storagePath: string, credentials?: PlatformCredentials, credentialsGetter?: () => Promise<PlatformCredentials>) {
        this.storage = new ScheduledPostsStorage(storagePath);
        this.credentialProvider = new CredentialProvider(credentials, credentialsGetter);
        this.postExecutor = new PostExecutor(this.credentialProvider);
        this.lockFilePath = path.join(storagePath, 'scheduler.lock');
    }

    public start(): void {
        // Try to acquire lock
        if (!this.acquireLock()) {
            Logger.warn('Another scheduler instance is already running. Skipping start.');
            return;
        }

        Logger.info('Starting DotShare scheduler...');

        // Recover any stuck posts from previous runs
        this.storage.recoverStuckPosts();

        // Check immediately on start
        this.processQueue();

        // Then check periodically
        this.intervalId = setInterval(async () => {
            await this.processQueue();
        }, CHECK_INTERVAL);
    }

    public stop(): void {
        Logger.info('Stopping DotShare scheduler...');
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        this.releaseLock();
    }

    private acquireLock(): boolean {
        try {
            // Try to create lock file exclusively
            fs.writeFileSync(this.lockFilePath, process.pid.toString(), { flag: 'wx' });
            return true;
        } catch (error) {
            // Lock file already exists
            return false;
        }
    }

    private releaseLock(): void {
        try {
            if (fs.existsSync(this.lockFilePath)) {
                fs.unlinkSync(this.lockFilePath);
            }
        } catch (error) {
            Logger.error('Error releasing lock file:', error);
        }
    }

    private async processQueue(): Promise<void> {
        // Prevent overlapping executions
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            const duePosts = this.storage.getScheduledPostsDue();

            if (duePosts.length === 0) {
                return;
            }

            Logger.info(`Found ${duePosts.length} posts due for execution`);

            for (const post of duePosts) {
                await this.executePostWithRetry(post);
            }
        } catch (error) {
            Logger.error('Error in scheduler process loop:', error);
        } finally {
            this.isRunning = false;
        }
    }

    private async executePostWithRetry(post: ScheduledPost): Promise<void> {
        // Mark as processing immediately
        this.storage.updateScheduledPost(post.id, {
            status: POST_STATUS.PROCESSING,
            lastAttempt: new Date().toISOString(),
            attempts: (post.attempts || 0) + 1
        });

        try {
            Logger.info(`Executing scheduled post: ${post.id} (attempt ${post.attempts || 1})`);

            // Execute for each selected platform
            const platformResults: Record<string, PlatformResult> = {};

            for (const platform of post.platforms) {
                const result = await this.postExecutor.executePostForPlatform(platform, post.postData, post.scheduledTime);
                platformResults[platform] = result;
            }

            // Check if any platform succeeded
            const hasSuccess = Object.values(platformResults).some((result) =>
                result && typeof result === 'object' && 'success' in result && result.success === true
            );

            if (hasSuccess) {
                // Success - move to history and remove from scheduled
                await this.moveToPostHistory(post, platformResults);
                this.storage.removeScheduledPost(post.id);
                Logger.info(`Scheduled post ${post.id} completed successfully`);
            } else {
                // All platforms failed
                const errorMessages = Object.values(platformResults)
                    .map((result) => result && typeof result === 'object' && 'errorMessage' in result ? result.errorMessage : null)
                    .filter(Boolean)
                    .join('; ');

                // Check if we should retry
                const currentAttempts = (post.attempts || 0) + 1;
                if (currentAttempts < MAX_RETRIES) {
                    // Schedule retry with exponential backoff
                    const retryDelay = Math.pow(2, currentAttempts) * 60 * 1000; // 2, 4, 8 minutes
                    const retryTime = new Date(Date.now() + retryDelay);

                    this.storage.updateScheduledPost(post.id, {
                        status: POST_STATUS.RETRYING,
                        errorMessage: `Attempt ${currentAttempts} failed: ${errorMessages}`,
                        scheduledTime: retryTime.toISOString(),
                        platformResults
                    });

                    Logger.info(`Scheduled post ${post.id} failed, retrying in ${retryDelay / 1000 / 60} minutes`);
                } else {
                    // Max retries reached - mark as permanently failed
                    this.storage.updateScheduledPost(post.id, {
                        status: POST_STATUS.FAILED,
                        errorMessage: `Failed after ${MAX_RETRIES} attempts: ${errorMessages}`,
                        platformResults
                    });

                    Logger.error(`Scheduled post ${post.id} failed permanently after ${MAX_RETRIES} attempts`);

                    // Notify user in VS Code
                    vscode.window.showErrorMessage(
                        `DotShare: Scheduled post failed after ${MAX_RETRIES} attempts. Check the scheduled posts panel for details.`
                    );
                }
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error(`Unexpected error executing scheduled post ${post.id}:`, errorMessage);

            // Handle unexpected errors (network issues, etc.)
            const currentAttempts = (post.attempts || 0) + 1;
            if (currentAttempts < MAX_RETRIES) {
                // Retry for unexpected errors too
                const retryDelay = Math.pow(2, currentAttempts) * 60 * 1000;
                const retryTime = new Date(Date.now() + retryDelay);

                this.storage.updateScheduledPost(post.id, {
                    status: POST_STATUS.RETRYING,
                    errorMessage: `Unexpected error (attempt ${currentAttempts}): ${errorMessage}`,
                    scheduledTime: retryTime.toISOString()
                });

                Logger.info(`Scheduled post ${post.id} encountered unexpected error, retrying in ${retryDelay / 1000 / 60} minutes`);
            } else {
                // Give up
                this.storage.updateScheduledPost(post.id, {
                    status: POST_STATUS.FAILED,
                    errorMessage: `Failed after ${MAX_RETRIES} attempts with unexpected error: ${errorMessage}`
                });

                vscode.window.showErrorMessage(
                    `DotShare: Scheduled post encountered critical error. Check logs for details.`
                );
            }
        }
    }

    private async moveToPostHistory(post: ScheduledPost, platformResults: Record<string, unknown>): Promise<void> {
        // This would be enhanced in the main extension to actually move to history
        // For now, just log the successful execution
        Logger.info(`Moving post ${post.id} to history with results:`, platformResults);
    }
}
