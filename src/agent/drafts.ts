import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { AgentPublisher, safeError } from './publisher';
import { fingerprint, Operation } from './journal';
import { StorageSecurityError } from '../security/private-files';
import { accountIdSchema, platformSchema, postSchema, requestIdSchema, overrideSchema } from './schema';
import { PublicationSeal, sealAssets, sealAccounts } from './publication-seal';
import { Preview, resolveAccountContent, characterCount } from './preview';
import { PLATFORM_CONFIGS } from '../platforms/platform-config';

export const draftIdSchema = z.uuid();
export const draftStatusSchema = z.enum(['Draft', 'Preview', 'Publishing', 'Published', 'NeedsReview', 'SavedRemotely']);
const revisionSchema = z.number().int().positive();
export const draftContentSchema = postSchema.extend({ accountIds: z.array(accountIdSchema).max(20).default([]) });
const patchSchema = z.object({
    accountIds: z.array(accountIdSchema).max(20).optional(), text: z.string().max(100000).optional(),
    media: z.array(z.string().min(1).max(4096)).max(10).optional(), autoSplit: z.boolean().optional(),
    posts: postSchema.shape.posts.nullable(), overrides: postSchema.shape.overrides.unwrap().nullable().optional(),
    article: postSchema.shape.article.nullable(),
}).strict();
export const createDraftSchema = z.object({ title: z.string().trim().min(1).max(200).default('Untitled draft'), content: draftContentSchema }).strict();
export const getDraftSchema = z.object({ draftId: draftIdSchema }).strict();
export const updateDraftSchema = getDraftSchema.extend({
    expectedRevision: revisionSchema, title: z.string().trim().min(1).max(200).optional(), patch: patchSchema.optional(),
}).refine(value => value.title !== undefined || (value.patch !== undefined && Object.keys(value.patch).length > 0), 'Provide a title or content patch.');
export const previewDraftSchema = getDraftSchema.extend({ expectedRevision: revisionSchema });
export const publishDraftSchema = previewDraftSchema.extend({ previewId: z.uuid(), requestId: requestIdSchema });
export const listDraftsSchema = z.object({ status: draftStatusSchema.optional(), limit: z.number().int().min(1).max(100).default(20) }).strict();
export const setDraftVariantSchema = previewDraftSchema.extend({ accountId: accountIdSchema, variant: overrideSchema.nullable() }).strict();
const sourceTemplateSchema = z.object({ id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), revision: revisionSchema }).strict();
const targetSchema = z.object({
    accountId: accountIdSchema, platform: platformSchema, characterLimit: z.number().positive(), maxMedia: z.number().nonnegative(),
    posts: z.array(z.object({ text: z.string(), media: z.array(z.string()), characters: z.number().nonnegative() }).strict()).min(1).max(100),
}).strict();
const previewSchema = z.object({ valid: z.boolean(), targets: z.array(targetSchema), errors: z.array(z.string()), warnings: z.array(z.string()) }).strict();
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const snapshotSchema = z.object({
    id: z.uuid(), revision: revisionSchema, createdAt: z.iso.datetime(), contentHash: hashSchema,
    plan: previewSchema,
    assets: z.array(z.object({ path: z.string(), sha256: hashSchema }).strict()),
    accounts: z.array(z.object({ accountId: accountIdSchema, fingerprint: hashSchema }).strict()),
}).strict();
const recordSchema = z.object({
    schemaVersion: z.literal(1), id: draftIdSchema, title: z.string().min(1).max(200), revision: revisionSchema,
    status: draftStatusSchema, content: draftContentSchema, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
    preview: snapshotSchema.optional(), validation: previewSchema.optional(),
    sourceTemplate: sourceTemplateSchema.optional(),
    publication: z.object({ requestId: requestIdSchema, revision: revisionSchema, previewId: z.uuid() }).strict().optional(),
}).strict();
type DraftRecord = z.infer<typeof recordSchema>;
export interface DraftView extends Omit<DraftRecord, 'preview' | 'publication'> {
    published: boolean;
    preview?: Pick<NonNullable<DraftRecord['preview']>, 'id' | 'revision' | 'createdAt' | 'plan'>;
    publication?: NonNullable<DraftRecord['publication']> & { operation?: Operation; deliveries?: { accountId: string; platform: string; status: string; receipts: Operation['results'][number]['receipts'] }[]; };
}
const MAX_CONTENT_BYTES = 1024 * 1024;

/** Persisted local drafts. Synchronous locks cover commits, never network requests. */
export class AgentDrafts {
    private readonly directory: string;
    constructor(private readonly publisher = new AgentPublisher()) { this.directory = path.join(publisher.accounts.home, 'drafts'); }
    private file(id: string): string { return path.join(this.directory, `${draftIdSchema.parse(id)}.json`); }
    private read(id: string): DraftRecord {
        const file = this.file(id);
        try {
            const record = recordSchema.parse(this.publisher.accounts.files.read(file));
            if (record.id !== id) throw new Error();
            if (record.preview && (record.preview.revision !== record.revision || record.preview.contentHash !== fingerprint(record.content) || !record.preview.plan.valid)) throw new Error();
            if (record.status !== 'Draft' && !record.preview) throw new Error();
            if (record.publication && (!record.preview || record.publication.revision !== record.revision || record.publication.previewId !== record.preview.id)) throw new Error();
            if (['Publishing', 'Published', 'NeedsReview', 'SavedRemotely'].includes(record.status) && !record.publication) throw new Error();
            return record;
        } catch (error) {
            if (error instanceof StorageSecurityError) throw error;
            if ((error as { code?: string }).code === 'ENOENT') throw new Error('Draft not found. Use list_drafts or drafts list to find its ID.');
            throw new Error('Draft data is unreadable or inconsistent. Inspect its operation before attempting any publication.');
        }
    }
    private locked<T>(id: string, action: () => T): T {
        this.publisher.accounts.files.directory('drafts');
        const lock = `${this.file(id)}.lock`;
        let fd: number;
        try { fd = fs.openSync(lock, 'wx', 0o600); }
        catch { throw new Error('Draft is busy or locked. Retry after the other edit finishes; inspect a stale lock before removing it.'); }
        try { return action(); } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
    }
    private save(record: DraftRecord): void { record.updatedAt = new Date().toISOString(); this.publisher.accounts.files.write(this.file(record.id), record); }
    private operation(record: DraftRecord): Operation | undefined {
        if (!record.publication) return undefined;
        const operation = this.publisher.journal.get(record.publication.requestId);
        if (operation && (operation.kind !== 'publish' || !operation.draft || fingerprint(operation.draft) !== fingerprint({ draftId: record.id, revision: record.revision, previewId: record.publication.previewId }))) {
            throw new Error('The operation belongs to a different action. Inspect the draft and operation before publishing again.');
        }
        return operation;
    }
    private stage(record: DraftRecord, operation?: Operation): DraftRecord['status'] {
        if (!operation) return record.status;
        if (operation.status === 'completed') return record.content.article?.published === false && record.preview?.plan.targets.every(target => target.platform === 'devto') ? 'SavedRemotely' : 'Published';
        return operation.status === 'needs_review' ? 'NeedsReview' : 'Publishing';
    }
    private view(record: DraftRecord): DraftView {
        const operation = this.operation(record);
        const { preview, publication, ...rest } = record;
        const status = this.stage(record, operation);
        return { ...rest, status, published: status === 'Published',
            ...(preview && { preview: { id: preview.id, revision: preview.revision, createdAt: preview.createdAt, plan: preview.plan } }),
            ...(publication && { publication: { ...publication, ...(operation && { operation, deliveries: operation.results.map(target => ({
                accountId: target.accountId, platform: target.platform,
                status: target.status === 'published' ? target.platform === 'devto' && record.content.article?.published === false ? 'SavedRemotely' : 'Published' : target.status,
                receipts: target.receipts,
            })) }) } }) };
    }
    get(id: string): DraftView { return this.view(this.read(id)); }
    list(value: unknown = {}): { drafts: Record<string, unknown>[] } {
        const input = listDraftsSchema.parse(value);
        if (!fs.existsSync(this.directory)) return { drafts: [] };
        const records = fs.readdirSync(this.directory).filter(name => /^[a-f0-9-]+\.json$/i.test(name)).map(name => {
            const record = this.get(name.slice(0, -5));
            return { id: record.id, title: record.title, revision: record.revision, status: record.status, published: record.published,
                accountIds: record.content.accountIds, createdAt: record.createdAt, updatedAt: record.updatedAt,
                ...(record.publication && { requestId: record.publication.requestId, deliveries: record.publication.deliveries, receipts: record.publication.operation?.results.flatMap(target => target.receipts) || [] }) };
        }).filter(record => !input.status || record.status === input.status).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, input.limit);
        return { drafts: records };
    }
    create(value: unknown, sourceTemplate?: z.infer<typeof sourceTemplateSchema>): DraftView {
        const input = createDraftSchema.parse(value);
        this.contentSize(input.content);
        const now = new Date().toISOString();
        const record: DraftRecord = { schemaVersion: 1, id: randomUUID(), title: input.title, revision: 1, status: 'Draft', content: input.content, createdAt: now, updatedAt: now };
        if (sourceTemplate) record.sourceTemplate = sourceTemplateSchema.parse(sourceTemplate);
        this.publisher.accounts.files.write(this.file(record.id), record, true);
        return this.view(record);
    }
    variants(id: string) {
        const draft = this.get(id);
        return { draftId: draft.id, revision: draft.revision, status: draft.status, published: draft.published,
            variants: draft.content.accountIds.map(accountId => {
                const account = this.publisher.accounts.get(accountId);
                const content = resolveAccountContent(draft.content, accountId);
                const savedPreview = draft.preview?.plan.targets.find(target => target.accountId === accountId);
                return { accountId, platform: account.platform, name: account.name,
                    source: Object.prototype.hasOwnProperty.call(draft.content.overrides, accountId) ? 'account' : 'base',
                    ...content, ...(draft.content.article && { article: draft.content.article }),
                    characterCounts: (content.posts || [{ text: content.text }]).map(part => characterCount(part.text, account.platform)),
                    characterLimit: savedPreview?.characterLimit ?? PLATFORM_CONFIGS[account.platform].maxChars,
                    limitSource: savedPreview ? 'saved-preview' : 'platform-default',
                    ...(savedPreview && { savedPreview }),
                };
            }), warnings: ['This is a content view, not a publication preview. Run preview_draft after edits to validate actual platform limits, media and account access.'] };
    }
    setVariant(value: unknown): DraftView {
        const input = setDraftVariantSchema.parse(value);
        const draft = this.get(input.draftId);
        if (!draft.content.accountIds.includes(input.accountId)) throw new Error('Choose an account already selected in this draft. Use update_draft to change accountIds.');
        const overrides = { ...draft.content.overrides };
        if (input.variant === null) delete overrides[input.accountId];
        else overrides[input.accountId] = input.variant;
        return this.update({ draftId: input.draftId, expectedRevision: input.expectedRevision, patch: { overrides } });
    }
    private contentSize(content: unknown): void {
        if (Buffer.byteLength(JSON.stringify(content)) > MAX_CONTENT_BYTES) throw new Error('Draft content exceeds 1 MiB. Use a smaller draft.');
    }
    private revision(record: DraftRecord, expected: number): void {
        if (record.revision !== expected) throw new Error(`Draft revision changed (current: ${record.revision}). Read the draft again before editing, previewing or publishing.`);
    }
    private editable(record: DraftRecord): void {
        if (record.publication) throw new Error('This draft has a publication attempt. Inspect its operation; do not edit or republish it with a new request ID. Create a new draft only for a separately authorized action.');
    }
    update(value: unknown): DraftView {
        const input = updateDraftSchema.parse(value);
        return this.locked(input.draftId, () => {
            const record = this.read(input.draftId); this.revision(record, input.expectedRevision); this.editable(record);
            const content = { ...record.content, ...input.patch };
            if (content.posts === null) delete content.posts;
            if (content.article === null) delete content.article;
            if (content.overrides === null) content.overrides = {};
            record.content = draftContentSchema.parse(content); this.contentSize(record.content);
            if (input.title !== undefined) record.title = input.title;
            record.revision++; record.status = 'Draft'; delete record.preview; delete record.validation;
            this.save(record); return this.view(record);
        });
    }
    async preview(value: unknown): Promise<DraftView> {
        const input = previewDraftSchema.parse(value);
        const initial = this.read(input.draftId); this.revision(initial, input.expectedRevision); this.editable(initial);
        let plan: Preview;
        let snapshot: DraftRecord['preview'];
        try {
            const content = postSchema.parse(initial.content);
            const accountsBefore = sealAccounts(this.publisher.accounts, content.accountIds.map(accountId => ({ accountId })));
            plan = await this.publisher.planner.preview(content);
            if (Buffer.byteLength(JSON.stringify(plan)) > 2 * 1024 * 1024) throw new Error('Preview exceeds 2 MiB. Reduce the number of accounts or thread parts.');
            if (plan.valid) {
                const accounts = sealAccounts(this.publisher.accounts, plan.targets);
                if (fingerprint(accountsBefore) !== fingerprint(accounts)) throw new Error('Accounts changed while preparing the preview. Preview the draft again.');
                snapshot = { id: randomUUID(), revision: initial.revision, createdAt: new Date().toISOString(), contentHash: fingerprint(initial.content),
                    plan, assets: sealAssets(plan.targets), accounts };
            }
        } catch (error) { plan = { valid: false, targets: [], errors: [safeError(error)], warnings: [] }; }
        return this.locked(initial.id, () => {
            const record = this.read(initial.id); this.revision(record, initial.revision); this.editable(record);
            if (snapshot) { record.preview = snapshot; record.status = 'Preview'; delete record.validation; }
            else { delete record.preview; record.validation = plan; record.status = 'Draft'; }
            this.save(record); return this.view(record);
        });
    }
    async publish(value: unknown, signal?: AbortSignal): Promise<{ draft: DraftView; replayed: boolean }> {
        const input = publishDraftSchema.parse(value);
        const record = this.locked(input.draftId, () => {
            const record = this.read(input.draftId); this.revision(record, input.expectedRevision);
            if (!record.preview || record.preview.id !== input.previewId) throw new Error('A current saved preview is required. Preview the draft again before publishing.');
            if (record.publication && record.publication.requestId !== input.requestId) throw new Error('This draft already has a publication request. Reuse the same requestId; inspect its results before taking further action.');
            if (!record.publication && this.publisher.journal.get(input.requestId)) throw new Error('requestId already belongs to another action.');
            if (!record.publication) { record.publication = { requestId: input.requestId, revision: record.revision, previewId: input.previewId }; record.status = 'Publishing'; this.save(record); }
            return record;
        });
        const preview = record.preview!;
        const seal: PublicationSeal = { source: { draftId: record.id, revision: record.revision, previewId: preview.id }, targets: preview.plan.targets, assets: preview.assets, accounts: preview.accounts };
        try {
            const result = await this.publisher.publishPrepared({ ...record.content, requestId: input.requestId }, seal, begin => this.locked(record.id, () => {
                const current = this.read(record.id);
                if (current.revision !== record.revision || current.publication?.requestId !== input.requestId || current.preview?.id !== preview.id) throw new Error('Draft changed while preparing publication. Preview it again.');
                return begin();
            }), signal);
            const draft = this.locked(record.id, () => {
                const current = this.read(record.id); current.status = this.stage(current, result.operation); this.save(current); return this.view(current);
            });
            return { draft, replayed: result.replayed };
        } catch (error) {
            this.locked(record.id, () => {
                const current = this.read(record.id);
                if (current.publication?.requestId !== input.requestId) return;
                const operation = this.operation(current);
                if (operation) current.status = this.stage(current, operation);
                else {
                    current.status = 'Draft'; delete current.preview; delete current.publication;
                    current.validation = { valid: false, targets: [], errors: [safeError(error)], warnings: [] };
                }
                this.save(current);
            });
            throw error;
        }
    }
}
