import * as fs from 'fs';
import * as path from 'path';
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

export class ScheduledPostsStorage {
    private static readonly SCHEDULED_POSTS_FILE = 'dotshare-scheduled-posts.json';
    private readonly filePath: string;

    constructor(storagePath: string) {
        // Ensure storage directory exists
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
        this.filePath = path.join(storagePath, ScheduledPostsStorage.SCHEDULED_POSTS_FILE);
    }

    // --- Atomic File Operations ---

    private readData(): ScheduledPost[] {
        try {
            if (!fs.existsSync(this.filePath)) return [];
            const data = fs.readFileSync(this.filePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            Logger.error('Error reading scheduled posts:', error);
            return [];
        }
    }

    private writeDataAtomic(data: ScheduledPost[]): void {
        const tempPath = `${this.filePath}.tmp.${Date.now()}`;
        try {
            fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
            // Atomic rename - either succeeds completely or fails completely
            fs.renameSync(tempPath, this.filePath);
        } catch (error) {
            Logger.error('Error writing scheduled posts atomically:', error);
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            throw error;
        }
    }

    // --- Public API ---

    public loadScheduledPosts(): ScheduledPost[] {
        return this.readData();
    }

    public saveScheduledPosts(posts: ScheduledPost[]): void {
        this.writeDataAtomic(posts);
    }

    public addScheduledPost(post: ScheduledPost): void {
        const posts = this.readData();
        posts.push(post);
        // Sort by scheduled time
        posts.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
        this.writeDataAtomic(posts);
    }

    public updateScheduledPost(id: string, updates: Partial<ScheduledPost>): void {
        const posts = this.readData();
        const index = posts.findIndex(p => p.id === id);
        if (index !== -1) {
            posts[index] = { ...posts[index], ...updates };
            this.writeDataAtomic(posts);
        }
    }

    public removeScheduledPost(id: string): void {
        const posts = this.readData();
        const filteredPosts = posts.filter(p => p.id !== id);
        this.writeDataAtomic(filteredPosts);
    }

    public getScheduledPost(id: string): ScheduledPost | undefined {
        const posts = this.readData();
        return posts.find(p => p.id === id);
    }

    public getPendingScheduledPosts(): ScheduledPost[] {
        const posts = this.readData();
        return posts.filter(p => p.status === POST_STATUS.QUEUED);
    }

    public getScheduledPostsDue(now: Date = new Date()): ScheduledPost[] {
        const posts = this.readData();
        const nowTime = now.getTime();

        return posts.filter(p => {
            const scheduledDate = new Date(p.scheduledTime);
            const scheduledTime = scheduledDate.getTime();

            Logger.info(`[SCHEDULER DEBUG] Post ${p.id}: scheduled=${scheduledTime}, now=${nowTime}, due=${scheduledTime <= nowTime}`);

            return (p.status === POST_STATUS.QUEUED || p.status === POST_STATUS.RETRYING) && scheduledTime <= nowTime;
        });
    }

    // --- Recovery Logic ---

    public recoverStuckPosts(): void {
        const posts = this.readData();
        let changed = false;
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

        posts.forEach(post => {
            if (post.status === POST_STATUS.PROCESSING && post.lastAttempt) {
                const lastAttemptDate = new Date(post.lastAttempt);
                if (lastAttemptDate < tenMinutesAgo) {
                    Logger.warn(`[Recovery] Resetting stuck post ${post.id} from processing to queued`);
                    post.status = POST_STATUS.QUEUED; // Reset to queued
                    changed = true;
                }
            }
        });

        if (changed) {
            this.writeDataAtomic(posts);
        }
    }
}

export function generateScheduledPostId(): string {
    return `scheduled-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
