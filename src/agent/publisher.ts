import { AccountStore } from './accounts';
import { OperationJournal, fingerprint, fingerprints, Fingerprints, Operation } from './journal';
import { PostPlanner, PlannedTarget } from './preview';
import { PublishInput, publishSchema } from './schema';
import { PublicationObserver } from '../platforms/runtime';
import { shareToLinkedIn } from '../platforms/linkedin';
import { shareToTelegram } from '../platforms/telegram';
import { shareToX } from '../platforms/x';
import { shareToBlueSky } from '../platforms/bluesky';
import { shareToMastodon } from '../platforms/mastodon';
import { shareToDiscord } from '../platforms/discord';
import { shareToDevTo } from '../platforms/devto';
import { redactSensitiveText, assertNoKnownSecrets } from '../security/redaction';
import { PublicationSeal, accountMatches, stageAssets } from './publication-seal';

export type PublishClaim = { operation: Operation; replayed: boolean };
export type ClaimGuard = (begin: () => PublishClaim) => PublishClaim;

export type PublishAdapter = (target: PlannedTarget, credentials: Record<string, string>, input: PublishInput, report: PublicationObserver) => Promise<void>;

export const publishTarget: PublishAdapter = async (target, credentials, input, report) => {
    const first = target.posts[0];
    const thread = { text: first.text, posts: target.posts.map(({ text, media }) => ({ text, media })) };
    switch (target.platform) {
        case 'mastodon':
            await shareToMastodon(credentials.instance, credentials.accessToken, thread, report); return;
        case 'bluesky':
            await shareToBlueSky(credentials.identifier, credentials.password, thread, report); return;
        case 'x':
            await shareToX(credentials.accessToken, '', thread, { tokenProvider: async () => credentials.accessToken, onPublished: report }); return;
        case 'linkedin':
            await shareToLinkedIn(first, credentials.accessToken, undefined, report, { firstComment: target.firstComment }); return;
        case 'telegram':
            await shareToTelegram(first, credentials.botToken, credentials.chatId, undefined, undefined, report); return;
        case 'discord':
            await shareToDiscord(credentials.webhookUrl, first, report); return;
        case 'devto': {
            const result = await shareToDevTo(credentials.apiKey, { ...first, ...input.article });
            if (!result.id || !result.url) throw new Error('Dev.to returned no article receipt; inspect your articles before retrying.');
            report({ id: String(result.id), url: result.url }); return;
        }
    }
};

export function safeError(error: unknown): string {
    // Do not return Axios request configs, headers, webhook URLs, or response bodies.
    const message = error instanceof Error ? error.message : 'Operation failed.';
    return redactSensitiveText(message).slice(0, 1000);
}

export class AgentPublisher {
    readonly planner: PostPlanner;
    readonly journal: OperationJournal;
    constructor(readonly accounts = new AccountStore(), private readonly adapter: PublishAdapter = publishTarget, mediaRoots?: string[]) {
        this.planner = new PostPlanner(accounts, mediaRoots);
        this.journal = new OperationJournal(accounts.home, accounts.files);
    }

    async publish(value: unknown, signal?: AbortSignal): Promise<{ operation: Operation; replayed: boolean }> {
        const input = publishSchema.parse(value);
        const hash = fingerprints(input);
        if (this.journal.get(input.requestId)) return this.journal.begin(input.requestId, hash, 'publish');
        if (signal?.aborted) throw new Error('Cancelled before publishing.');
        const content = { ...input } as Partial<PublishInput>;
        delete content.requestId;
        const preview = await this.planner.preview(content);
        if (!preview.valid) throw new Error(preview.errors.join('\n'));
        // Resolve every credential before publishing anywhere: a locked keyring
        // or missing account must not cause a partial cross-platform release.
        const credentials = new Map(preview.targets.map(target => [target.accountId, this.accounts.credentials(target.accountId)]));
        assertNoKnownSecrets({ targets: preview.targets, article: input.article });
        if (signal?.aborted) throw new Error('Cancelled before publishing.');
        return this.execute(input, preview.targets, credentials, hash, signal);
    }

    /** Revalidate a saved preview, then send its exact parts and image bytes. */
    async publishPrepared(value: unknown, seal: PublicationSeal, guard: ClaimGuard, signal?: AbortSignal): Promise<PublishClaim> {
        const input = publishSchema.parse(value);
        const hash = fingerprints({ input, seal });
        const existing = this.journal.get(input.requestId);
        if (existing) return this.journal.begin(input.requestId, hash, 'publish');
        if (signal?.aborted) throw new Error('Cancelled before publishing.');
        const content = { ...input } as Partial<PublishInput>; delete content.requestId;
        const current = await this.planner.preview(content);
        if (!current.valid) throw new Error(current.errors.join('\n'));
        if (fingerprint(current.targets) !== fingerprint(seal.targets)) throw new Error('The platform plan or limits changed after preview. Preview the draft again before publishing.');
        const credentials = new Map(seal.targets.map(target => {
            const value = this.accounts.credentials(target.accountId);
            const expected = seal.accounts.find(account => account.accountId === target.accountId)?.fingerprint;
            if (!expected || !accountMatches(this.accounts, target.accountId, value, expected)) throw new Error('An account or its credentials changed after preview. Preview the draft again before publishing.');
            return [target.accountId, value];
        }));
        assertNoKnownSecrets({ targets: seal.targets, article: input.article });
        const staged = stageAssets(seal);
        try {
            if (signal?.aborted) throw new Error('Cancelled before publishing.');
            return await this.execute(input, staged.targets, credentials, hash, signal, seal.source, guard);
        } finally { staged.dispose(); }
    }

    private async execute(input: PublishInput, targets: PlannedTarget[], credentials: Map<string, Record<string, string>>, hash: Fingerprints, signal?: AbortSignal, source?: Operation['draft'], guard?: ClaimGuard): Promise<PublishClaim> {
        const begin = (): PublishClaim => this.journal.begin(input.requestId, hash, 'publish', targets.map(target => ({ accountId: target.accountId, platform: target.platform, status: 'pending', receipts: [] })), source);
        const claim = guard ? guard(begin) : begin();
        if (claim.replayed) return claim;
        const operation = claim.operation;
        for (let i = 0; i < targets.length; i++) {
            const result = operation.results[i];
            if (signal?.aborted) {
                result.status = 'cancelled';
                this.journal.save(operation);
                continue;
            }
            result.status = 'publishing';
            this.journal.save(operation);
            try {
                await this.adapter(targets[i], credentials.get(result.accountId)!, input, receipt => {
                    result.receipts.push(receipt);
                    this.journal.save(operation);
                    if (signal?.aborted) throw new Error('Cancelled after this receipt. Check published thread parts before taking further action.');
                });
                if (!result.receipts.length) throw new Error('Platform returned no publication receipt; verify the destination before retrying.');
                result.status = 'published';
            } catch (error) {
                result.status = 'uncertain';
                result.error = safeError(error);
                // Even a timeout might mean the server accepted the post. Never
                // automatically resend this action or the remaining thread parts.
            }
            this.journal.save(operation);
        }
        operation.status = operation.results.every(result => result.status === 'published') ? 'completed' : 'needs_review';
        this.journal.save(operation);
        return { operation, replayed: false };
    }
}
