import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import * as os from 'os';
import { AccountStore } from './accounts';
import { DOTSUITE_CORE_API_URL } from '../constants';
import { fingerprints, OperationJournal, Operation } from './journal';
import { characterCount } from './preview';
import { PLATFORM_CONFIGS } from '../platforms/platform-config';
import { scheduleSchema, requestIdSchema, Platform } from './schema';
import { safeError } from './publisher';
import { assertNoKnownSecrets, redactSensitiveText } from '../security/redaction';

/** DotSuite answers with `post_id`; older responses used `id` or `post.id`. */
function scheduledId(data: unknown): string | undefined {
    const value = data as { post_id?: unknown; id?: unknown; post?: { id?: unknown } } | undefined;
    const id = value?.post_id ?? value?.id ?? value?.post?.id;
    return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
}

const CLOUD_IMAGE_MAX = 5 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

export interface XUsage { month: string; budget_micros: number; spent_micros: number; reserved_micros: number; remaining_micros: number; posts_today: number; daily_post_limit: number; prices: { post_micros: number; post_with_link_micros: number; media_micros: number } }
export interface XPublishResponse { status: 'published' | 'needs_review' | 'failed'; charged_micros: number; posts: { status: string; x_post_id?: string; url?: string; error?: string; charged_micros: number }[]; usage: XUsage }
export const usd = (micros: number): string => `$${(micros / 1_000_000).toFixed(micros % 10_000 === 0 ? 2 : 3)}`;

/** One cloud post for one platform, taken from a saved preview. */
export interface CloudDraftPost { platform: Platform; accountIds: string[]; text: string; media: string[]; }

export class AgentCloud {
    private readonly http: AxiosInstance;
    private readonly journal: OperationJournal;
    constructor(private readonly accounts: AccountStore, baseURL = process.env.DOTSUITE_API_URL || DOTSUITE_CORE_API_URL) {
        const url = new URL(baseURL);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('DotSuite API URL must use HTTPS without credentials or query parameters.');
        this.http = axios.create({ baseURL: url.href.replace(/\/$/, ''), timeout: 30000, maxRedirects: 0 });
        this.journal = new OperationJournal(accounts.home, accounts.files);
    }
    private auth() {
        return { headers: { Authorization: `Bearer ${this.accounts.cloudToken()}`, 'X-Machine-Id': createHash('sha256').update(`${os.hostname()}:${os.userInfo().username}`).digest('hex') } };
    }
    async connections(): Promise<string[]> {
        const response = await this.http.get('/v1/oauth/connections', this.auth());
        if (!Array.isArray(response.data?.connected_platforms)) throw new Error('DotSuite returned an invalid connections response.');
        return response.data.connected_platforms;
    }
    async list(): Promise<unknown[]> {
        const response = await this.http.get('/v1/posts?status=pending', this.auth());
        const posts = Array.isArray(response.data) ? response.data : response.data?.posts;
        if (!Array.isArray(posts)) throw new Error('DotSuite returned an invalid scheduled posts response.');
        return posts;
    }
    async schedule(value: unknown): Promise<{ operation: Operation; replayed: boolean }> {
        const input = scheduleSchema.parse(value);
        const hash = fingerprints(input);
        if (this.journal.get(input.requestId)) return this.journal.begin(input.requestId, hash, 'schedule');
        if (Date.parse(input.scheduledAt) <= Date.now() + 60000) throw new Error('Schedule at least one minute in the future, including a timezone.');
        if (new Set(input.platforms).size !== input.platforms.length) throw new Error('Platforms must be unique.');
        for (const platform of input.platforms) {
            const limit = platform === 'telegram' && input.mediaUrls.length ? 1024 : PLATFORM_CONFIGS[platform].maxChars;
            if (characterCount(input.text, platform) > limit) throw new Error(`Scheduled text exceeds the ${platform} limit of ${limit}. Cloud threads are not supported.`);
            if (input.mediaUrls.length > PLATFORM_CONFIGS[platform].maxMediaCount) throw new Error(`Too many scheduled images for ${platform}.`);
        }
        for (const ref of input.mediaUrls) { const url = new URL(ref); if (url.username || url.password) throw new Error('Media URLs must not contain credentials.'); }
        const connected = await this.connections();
        if (input.platforms.some(platform => !connected.includes(platform))) throw new Error('Connect all requested platforms in the DotSuite dashboard first. Local accounts are separate from cloud accounts.');
        const auth = this.auth();
        assertNoKnownSecrets({ text: input.text, mediaUrls: input.mediaUrls });
        const claim = this.journal.begin(input.requestId, hash, 'schedule');
        if (claim.replayed) return claim;
        try {
            const response = await this.http.post('/v1/posts/schedule', {
                text: input.text, media_urls: input.mediaUrls, platforms: input.platforms,
                has_video: false, scheduled_at: input.scheduledAt,
            }, auth);
            const id = scheduledId(response.data);
            if (id) claim.operation.scheduledPostId = String(id);
            claim.operation.status = 'completed';
        } catch (error) {
            claim.operation.status = 'needs_review'; claim.operation.error = safeError(error);
        }
        this.journal.save(claim.operation);
        return claim;
    }
    /** Uploads a local image to DotSuite storage for scheduled posts; returns its public HTTPS URL. */
    async uploadImage(file: string): Promise<string> {
        const bytes = fs.readFileSync(file);
        if (bytes.length > CLOUD_IMAGE_MAX) throw new Error(`${path.basename(file)} is over 5 MB, the DotSuite upload limit for scheduled images.`);
        const form = new FormData();
        form.append('file', new Blob([bytes], { type: IMAGE_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' }), path.basename(file));
        const response = await this.http.post('/v1/media/upload', form, this.auth());
        const url = response.data?.media_url;
        if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('DotSuite returned an invalid media URL.');
        return url;
    }

    /**
     * Schedules a previewed draft: one cloud post per platform, each with that
     * platform's own text and images. Local images are uploaded first, so a failed
     * upload schedules nothing; after the claim, each platform's result is recorded.
     */
    async scheduleDraft(input: { requestId: string; scheduledAt: string; posts: CloudDraftPost[]; source: NonNullable<Operation['draft']> },
        guard: (begin: () => { operation: Operation; replayed: boolean }) => { operation: Operation; replayed: boolean }): Promise<{ operation: Operation; replayed: boolean }> {
        requestIdSchema.parse(input.requestId);
        const hash = fingerprints({ requestId: input.requestId, scheduledAt: input.scheduledAt, source: input.source, posts: input.posts.map(post => ({ ...post, media: post.media.map(file => path.basename(file)) })) });
        const begin = (): { operation: Operation; replayed: boolean } => this.journal.begin(input.requestId, hash, 'schedule',
            input.posts.flatMap(post => post.accountIds.map(accountId => ({ accountId, platform: post.platform, status: 'pending' as const, receipts: [] }))), input.source);
        if (this.journal.get(input.requestId)) return guard(begin);
        if (Date.parse(input.scheduledAt) <= Date.now() + 60000) throw new Error('Schedule at least one minute in the future, including a timezone.');
        const connected = await this.connections();
        const missing = input.posts.map(post => post.platform).filter(platform => !connected.includes(platform));
        if (missing.length) throw new Error(`Connect ${missing.join(', ')} in the DotSuite dashboard first (dotsuite.dev → DotShare → Connected Accounts). Local accounts are separate from cloud accounts.`);
        assertNoKnownSecrets({ posts: input.posts.map(post => post.text) });
        const uploaded = new Map<string, string>();
        for (const file of new Set(input.posts.flatMap(post => post.media))) uploaded.set(file, await this.uploadImage(file));
        const auth = this.auth();
        const claim = guard(begin);
        if (claim.replayed) return claim;
        for (const post of input.posts) {
            const results = claim.operation.results.filter(result => result.platform === post.platform);
            results.forEach(result => { result.status = 'publishing'; });
            this.journal.save(claim.operation);
            try {
                const response = await this.http.post('/v1/posts/schedule', {
                    text: post.text, media_urls: post.media.map(file => uploaded.get(file)!), platforms: [post.platform],
                    has_video: false, scheduled_at: input.scheduledAt,
                }, auth);
                const id = scheduledId(response.data);
                if (!id) throw new Error('DotSuite returned no scheduled post ID; check list_scheduled_posts before retrying.');
                results.forEach(result => { result.status = 'scheduled'; result.receipts.push({ id }); });
            } catch (error) {
                results.forEach(result => { result.status = 'uncertain'; result.error = safeError(error); });
            }
            this.journal.save(claim.operation);
        }
        claim.operation.status = claim.operation.results.every(result => result.status === 'scheduled') ? 'completed' : 'needs_review';
        this.journal.save(claim.operation);
        return claim;
    }

    /** This month's X budget on DotSuite (DotSuite pays X per post through its app). */
    async xUsage(): Promise<XUsage> {
        const response = await this.http.get('/v1/x/usage', this.auth());
        return response.data as XUsage;
    }

    /** What these X posts would cost, without publishing. */
    async xEstimate(posts: { text: string; media_urls: string[] }[]): Promise<{ estimated_micros: number; affordable: boolean; usage: XUsage; posts: { kind: string; estimated_micros: number }[] }> {
        const response = await this.http.post('/v1/x/estimate', { posts }, this.auth());
        return response.data;
    }

    /** Publishes through DotSuite, which charges the plan's X budget. Idempotent by requestId. */
    async xPublish(requestId: string, posts: { text: string; media_urls: string[] }[]): Promise<XPublishResponse> {
        try {
            const response = await this.http.post('/v1/x/posts', { request_id: requestId, posts }, { ...this.auth(), timeout: 600000 });
            return response.data as XPublishResponse;
        } catch (error) {
            const data = axios.isAxiosError(error) ? error.response?.data as { error?: string } | undefined : undefined;
            throw new Error(data?.error ? redactSensitiveText(data.error) : safeError(error));
        }
    }

    async cancel(requestId: string, postId: string): Promise<{ operation: Operation; replayed: boolean }> {
        requestIdSchema.parse(requestId);
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(postId)) throw new Error('Invalid scheduled post ID.');
        const hash = fingerprints({ requestId, postId });
        if (this.journal.get(requestId)) return this.journal.begin(requestId, hash, 'cancel');
        const auth = this.auth();
        const claim = this.journal.begin(requestId, hash, 'cancel');
        if (claim.replayed) return claim;
        try {
            await this.http.delete(`/v1/posts/${encodeURIComponent(postId)}`, auth);
            claim.operation.status = 'completed'; claim.operation.scheduledPostId = postId;
        } catch (error) {
            claim.operation.status = 'needs_review'; claim.operation.error = safeError(error);
        }
        this.journal.save(claim.operation);
        return claim;
    }
}
