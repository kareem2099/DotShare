import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';
import { AccountStore } from './accounts';
import { OperationJournal, TargetResult } from './journal';
import { requestIdSchema } from './schema';
import { draftIdSchema } from './drafts';
import { PublicationReceipt } from '../platforms/runtime';
import { redactSensitiveText } from '../security/redaction';

/**
 * Engagement numbers for something DotShare already published, read with the
 * same account credentials (read-only: never posts, edits or deletes).
 * Telegram and Discord offer no per-message metrics to bots or webhooks.
 */

export const postStatsSchema = z.object({
    requestId: requestIdSchema.optional(),
    draftId: draftIdSchema.optional(),
}).strict().refine(value => Boolean(value.requestId) !== Boolean(value.draftId), 'Provide either requestId or draftId.');

export interface Metrics { likes?: number; reposts?: number; replies?: number; quotes?: number; bookmarks?: number; impressions?: number; views?: number; reactions?: number; comments?: number; }
export interface PostStats { id: string; url?: string; metrics?: Metrics; error?: string; }
export interface AccountStats { accountId: string; platform: string; posts: PostStats[]; unavailable?: string; }
export interface StatsResult { requestId: string; checkedAt: string; accounts: AccountStats[]; }

const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const clean = (metrics: Metrics): Metrics => Object.fromEntries(Object.entries(metrics).filter(([, value]) => value !== undefined)) as Metrics;

function reason(error: unknown, platform: string): string {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401) return 'The platform rejected the saved sign-in. Reconnect the account.';
    if (status === 403) return platform === 'x' ? 'Your X API plan or token does not allow reading post metrics.' : platform === 'linkedin' ? 'LinkedIn only shares post metrics with apps approved for read access (r_member_social).' : 'The platform denied access to these metrics.';
    if (status === 404) return 'The post was not found. It may have been deleted.';
    if (status === 429) return 'The platform rate-limited this request. Try again later.';
    return redactSensitiveText(error instanceof Error ? error.message : 'Could not read metrics.').slice(0, 200);
}

export class AgentStats {
    private readonly journal: OperationJournal;
    constructor(private readonly accounts: AccountStore, private readonly http: AxiosInstance = axios.create({ timeout: 15000, maxRedirects: 0 }),
        private readonly draftRequest: (draftId: string) => string | undefined = () => undefined) {
        this.journal = new OperationJournal(accounts.home, accounts.files);
    }

    async get(value: unknown): Promise<StatsResult> {
        const input = postStatsSchema.parse(value);
        const requestId = input.requestId || this.draftRequest(input.draftId!);
        if (!requestId) throw new Error('This draft has not been published yet.');
        const operation = this.journal.get(requestId);
        if (!operation) throw new Error('Operation not found. Use list_history to find the requestId.');
        if (operation.kind !== 'publish') throw new Error('Metrics are available for published posts only. Scheduled posts get receipts once DotSuite publishes them.');
        const accounts: AccountStats[] = [];
        for (const result of operation.results) accounts.push(await this.account(result));
        return { requestId, checkedAt: new Date().toISOString(), accounts };
    }

    private async account(result: TargetResult): Promise<AccountStats> {
        const base = { accountId: result.accountId, platform: result.platform };
        // LinkedIn's second receipt is the first comment, not a post.
        const receipts = result.platform === 'linkedin' ? result.receipts.slice(0, 1) : result.receipts;
        if (!receipts.length) return { ...base, posts: [], unavailable: 'Nothing was published to this account.' };
        if (result.platform === 'telegram' || result.platform === 'discord') return { ...base, posts: receipts.map(({ id, url }) => ({ id, url })), unavailable: `${result.platform === 'telegram' ? 'Telegram bots' : 'Discord webhooks'} can't read message metrics.` };
        try {
            const metrics = await this.read(result.platform, result.accountId, receipts);
            return { ...base, posts: receipts.map(({ id, url }) => metrics.has(id) ? { id, url, metrics: metrics.get(id) } : { id, url, error: 'Not returned by the platform. It may have been deleted.' }) };
        } catch (error) {
            return { ...base, posts: receipts.map(({ id, url }) => ({ id, url })), unavailable: reason(error, result.platform) };
        }
    }

    private async read(platform: string, accountId: string, receipts: PublicationReceipt[]): Promise<Map<string, Metrics>> {
        const metrics = new Map<string, Metrics>();
        switch (platform) {
            case 'x': {
                const { accessToken } = await this.accounts.freshCredentials(accountId);
                for (let i = 0; i < receipts.length; i += 100) {
                    const { data } = await this.http.get('https://api.x.com/2/tweets', { headers: { Authorization: `Bearer ${accessToken}` },
                        params: { ids: receipts.slice(i, i + 100).map(receipt => receipt.id).join(','), 'tweet.fields': 'public_metrics' } });
                    for (const tweet of data?.data || []) {
                        const m = tweet.public_metrics || {};
                        metrics.set(String(tweet.id), clean({ likes: count(m.like_count), reposts: count(m.retweet_count), replies: count(m.reply_count), quotes: count(m.quote_count), bookmarks: count(m.bookmark_count), impressions: count(m.impression_count) }));
                    }
                }
                return metrics;
            }
            case 'bluesky': {
                // Public AppView: no session or app password needed to read counts.
                for (let i = 0; i < receipts.length; i += 25) {
                    const uris = receipts.slice(i, i + 25).map(receipt => receipt.uri || receipt.id);
                    const params = new URLSearchParams(); uris.forEach(uri => params.append('uris', uri));
                    const { data } = await this.http.get(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?${params}`);
                    for (const post of data?.posts || []) {
                        metrics.set(String(post.uri), clean({ likes: count(post.likeCount), reposts: count(post.repostCount), replies: count(post.replyCount), quotes: count(post.quoteCount) }));
                    }
                }
                return metrics;
            }
            case 'mastodon': {
                const { instance, accessToken } = this.accounts.credentials(accountId);
                for (const receipt of receipts) {
                    const { data } = await this.http.get(`${instance}/api/v1/statuses/${encodeURIComponent(receipt.id)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
                    metrics.set(receipt.id, clean({ likes: count(data?.favourites_count), reposts: count(data?.reblogs_count), replies: count(data?.replies_count), quotes: count(data?.quotes_count) }));
                }
                return metrics;
            }
            case 'linkedin': {
                const { accessToken } = await this.accounts.freshCredentials(accountId);
                for (const receipt of receipts) {
                    const { data } = await this.http.get(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(receipt.id)}`, { headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' } });
                    metrics.set(receipt.id, clean({ likes: count(data?.likesSummary?.totalLikes), comments: count(data?.commentsSummary?.aggregatedTotalComments ?? data?.commentsSummary?.totalFirstLevelComments) }));
                }
                return metrics;
            }
            case 'devto': {
                const { apiKey } = this.accounts.credentials(accountId);
                const wanted = new Set(receipts.map(receipt => receipt.id));
                for (let page = 1; page <= 10 && metrics.size < wanted.size; page++) {
                    const { data } = await this.http.get('https://dev.to/api/articles/me/all', { headers: { 'api-key': apiKey }, params: { page, per_page: 100 } });
                    if (!Array.isArray(data) || !data.length) break;
                    for (const article of data) {
                        const id = String(article.id);
                        if (wanted.has(id)) metrics.set(id, clean({ views: count(article.page_views_count), reactions: count(article.public_reactions_count), comments: count(article.comments_count) }));
                    }
                }
                return metrics;
            }
        }
        throw new Error('This platform has no metrics support.');
    }
}
