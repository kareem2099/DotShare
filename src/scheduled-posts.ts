import * as fs from 'fs';
import * as path from 'path';
import { ScheduledPost } from './types';

export class ScheduledPostsStorage {
    private static readonly SCHEDULED_POSTS_FILE = 'dotshare-scheduled-posts.json';
    private readonly filePath: string;

    constructor(storagePath: string) {
        this.filePath = path.join(storagePath, ScheduledPostsStorage.SCHEDULED_POSTS_FILE);
    }

    public loadScheduledPosts(): ScheduledPost[] {
        try {
            if (!fs.existsSync(this.filePath)) {
                return [];
            }
            const data = fs.readFileSync(this.filePath, 'utf8');
            const parsed = JSON.parse(data);
            return parsed.scheduledPosts || [];
        } catch (error) {
            console.error('Failed to load scheduled posts:', error);
            return [];
        }
    }

    public saveScheduledPosts(posts: ScheduledPost[]): void {
        try {
            const data = {
                scheduledPosts: posts,
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            console.error('Failed to save scheduled posts:', error);
            throw error;
        }
    }

    public addScheduledPost(post: ScheduledPost): void {
        const posts = this.loadScheduledPosts();
        posts.push(post);
        // Sort by scheduled time
        posts.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
        this.saveScheduledPosts(posts);
    }

    public updateScheduledPost(id: string, updates: Partial<ScheduledPost>): void {
        const posts = this.loadScheduledPosts();
        const index = posts.findIndex(p => p.id === id);
        if (index !== -1) {
            posts[index] = { ...posts[index], ...updates };
            this.saveScheduledPosts(posts);
        }
    }

    public removeScheduledPost(id: string): void {
        const posts = this.loadScheduledPosts();
        const filteredPosts = posts.filter(p => p.id !== id);
        this.saveScheduledPosts(filteredPosts);
    }

    public getScheduledPost(id: string): ScheduledPost | undefined {
        const posts = this.loadScheduledPosts();
        return posts.find(p => p.id === id);
    }

    public getPendingScheduledPosts(): ScheduledPost[] {
        const posts = this.loadScheduledPosts();
        return posts.filter(p => p.status === 'scheduled');
    }

    public getScheduledPostsDue(now: Date = new Date()): ScheduledPost[] {
        const posts = this.loadScheduledPosts();
        return posts.filter(p =>
            p.status === 'scheduled' &&
            new Date(p.scheduledTime) <= now
        );
    }
}

export function generateScheduledPostId(): string {
    return `scheduled-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
