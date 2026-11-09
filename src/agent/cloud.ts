import axios, { AxiosInstance } from 'axios';
import { createHash } from 'crypto';
import * as os from 'os';
import { AccountStore } from './accounts';
import { DOTSUITE_CORE_API_URL } from '../constants';
import { fingerprints, OperationJournal, Operation } from './journal';
import { characterCount } from './preview';
import { PLATFORM_CONFIGS } from '../platforms/platform-config';
import { scheduleSchema, requestIdSchema } from './schema';
import { safeError } from './publisher';
import { assertNoKnownSecrets } from '../security/redaction';

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
            const id = response.data?.id || response.data?.post?.id;
            if (id) claim.operation.scheduledPostId = String(id);
            claim.operation.status = 'completed';
        } catch (error) {
            claim.operation.status = 'needs_review'; claim.operation.error = safeError(error);
        }
        this.journal.save(claim.operation);
        return claim;
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
