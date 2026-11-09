import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { AccountStore } from './accounts';
import { StorageSecurityError } from '../security/private-files';
import { withFileLock } from '../security/locks';
import { AgentDrafts, draftContentSchema } from './drafts';
import { AgentPublisher } from './publisher';
import { accountIdSchema, platformSchema, overrideSchema } from './schema';
import { resolveAccountContent } from './preview';
import { TEMPLATE_PRESETS } from './template-presets';

export const templateIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const revisionSchema = z.number().int().positive();
const variableNameSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/).refine(name => !['constructor', 'prototype', '__proto__'].includes(name), 'Reserved variable name.');
const variableSchema = z.object({ description: z.string().max(500).optional(), type: z.enum(['text', 'url']).default('text'), default: z.string().max(100000).optional() }).strict();
const textSchema = z.string().max(100000);
const mediaSchema = z.array(z.string().min(1).max(4096)).max(10);
const partSchema = z.object({ text: textSchema, media: mediaSchema.default([]) }).strict();
const variantSchema = z.object({ text: textSchema.optional(), media: mediaSchema.optional(), posts: z.array(partSchema).min(1).max(100).optional() }).strict();
const contentSchema = z.object({
    text: textSchema.default(''), media: mediaSchema.default([]), posts: z.array(partSchema).min(1).max(100).optional(), autoSplit: z.boolean().default(false),
    article: z.object({
        title: z.string().min(1).max(1000), tags: z.array(z.string().max(1000)).max(4).default([]), published: z.boolean().default(true),
        canonicalUrl: z.string().max(4096).optional(), coverImage: z.string().max(4096).optional(),
        description: z.string().max(1000).optional(), series: z.string().max(1000).optional(),
    }).strict().optional(),
}).strict();
const definitionSchema = z.object({
    name: z.string().trim().min(1).max(200), description: z.string().max(1000).default(''), content: contentSchema,
    variables: z.record(variableNameSchema, variableSchema).default({}),
    platformVariants: z.partialRecord(platformSchema, variantSchema).default({}),
    accountVariants: z.record(accountIdSchema, variantSchema).default({}),
}).strict();
export const saveTemplateSchema = definitionSchema.extend({ id: templateIdSchema, expectedRevision: revisionSchema.optional() }).strict();
export const getTemplateSchema = z.object({ templateId: templateIdSchema }).strict();
export const deleteTemplateSchema = getTemplateSchema.extend({ expectedRevision: revisionSchema }).strict();
export const listTemplatesSchema = z.object({ query: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).default(20) }).strict();
export const renderTemplateSchema = getTemplateSchema.extend({
    expectedRevision: revisionSchema, values: z.record(variableNameSchema, z.string().max(100000)).default({}).refine(values => Object.keys(values).length <= 100, 'At most 100 values.'),
    accountIds: z.array(accountIdSchema).max(20).default([]),
}).strict();
export const createDraftFromTemplateSchema = renderTemplateSchema.extend({ title: z.string().trim().min(1).max(200).optional() }).strict();
const activeRecordSchema = z.object({ schemaVersion: z.literal(1), id: templateIdSchema, revision: revisionSchema, definition: definitionSchema,
    createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() }).strict();
const deletedRecordSchema = z.object({ schemaVersion: z.literal(1), id: templateIdSchema, revision: revisionSchema, deletedAt: z.iso.datetime() }).strict();
const recordSchema = z.union([activeRecordSchema, deletedRecordSchema]);
type Definition = z.infer<typeof definitionSchema>;
type ActiveRecord = z.infer<typeof activeRecordSchema>;
type StoredRecord = z.infer<typeof recordSchema>;
type Parameter = z.infer<typeof variableSchema> & { name: string; required: boolean };
export interface TemplateView extends Definition { id: string; revision: number; builtIn: boolean; createdAt?: string; updatedAt?: string; parameters: Parameter[]; }
const MAX_BYTES = 1024 * 1024;

function strings(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
}
function mapStrings(value: unknown, transform: (text: string) => string): unknown {
    if (typeof value === 'string') return transform(value);
    if (Array.isArray(value)) return value.map(item => mapStrings(item, transform));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, transform)]));
    return value;
}
const placeholder = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;
function parameters(definition: Definition): Parameter[] {
    const names = new Set<string>();
    for (const text of strings([definition.content, definition.platformVariants, definition.accountVariants])) {
        for (const match of text.matchAll(placeholder)) names.add(variableNameSchema.parse(match[1]));
        if (text.replace(placeholder, '').includes('{{') || text.replace(placeholder, '').includes('}}')) throw new Error('Invalid placeholder. Use {{variable_name}} only; expressions and template code are not supported.');
    }
    if (names.size > 100) throw new Error('A template supports at most 100 variables.');
    for (const name of Object.keys(definition.variables)) if (!names.has(name)) throw new Error(`Declared variable "${name}" is not used in the template.`);
    return [...names].sort().map(name => {
        const spec = Object.prototype.hasOwnProperty.call(definition.variables, name) ? definition.variables[name] : { type: 'text' as const };
        if (spec.default !== undefined && spec.type === 'url') validateUrl(spec.default, name);
        return { name, ...spec, required: spec.default === undefined };
    });
}
function validateUrl(value: string, name: string): void {
    try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || value.trim() !== value) throw new Error(); }
    catch { throw new Error(`Variable "${name}" must be an HTTPS URL without credentials.`); }
}
function checkSize(value: unknown): void {
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES) throw new Error('Template or rendered content exceeds 1 MiB.');
}

/** Local, versioned recipes. Rendering never evaluates code, reads secrets or contacts platforms. */
export class AgentTemplates {
    private readonly directory: string;
    private readonly presets: Map<string, ActiveRecord>;
    constructor(private readonly accounts = new AccountStore(), private readonly drafts = new AgentDrafts(new AgentPublisher(accounts))) {
        this.directory = path.join(accounts.home, 'templates');
        this.presets = new Map(TEMPLATE_PRESETS.map(preset => {
            const { id, ...value } = preset;
            const definition = definitionSchema.parse(value); parameters(definition);
            return [id, { schemaVersion: 1, id, revision: 1, definition, createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z' }];
        }));
    }
    private file(id: string): string { return path.join(this.directory, `${templateIdSchema.parse(id)}.json`); }
    private read(id: string): StoredRecord | undefined {
        const file = this.file(id);
        try {
            const record = recordSchema.parse(this.accounts.files.read(file));
            if (record.id !== id) throw new Error();
            if ('definition' in record) parameters(record.definition);
            return record;
        } catch (error) {
            if (error instanceof StorageSecurityError) throw error;
            if ((error as { code?: string }).code === 'ENOENT') return undefined;
            throw new Error('Template data is unreadable or inconsistent. Restore it from a trusted copy.');
        }
    }
    private view(record: ActiveRecord, builtIn: boolean): TemplateView {
        return { id: record.id, revision: record.revision, builtIn, ...record.definition, parameters: parameters(record.definition),
            ...(!builtIn && { createdAt: record.createdAt, updatedAt: record.updatedAt }) };
    }
    private locked<T>(id: string, action: () => T): T {
        this.accounts.files.directory('templates');
        return withFileLock(`${this.file(id)}.lock`, action, {
            busy: () => new Error('Template is busy or locked by another edit. Retry after it finishes.'),
        });
    }
    get(id: string): TemplateView {
        templateIdSchema.parse(id);
        const preset = this.presets.get(id);
        if (preset) return this.view(preset, true);
        const record = this.read(id);
        if (!record || 'deletedAt' in record) throw new Error('Template not found. Use list_templates or templates list.');
        return this.view(record, false);
    }
    list(value: unknown = {}) {
        const input = listTemplatesSchema.parse(value);
        const summaries = (template: TemplateView) => ({ id: template.id, name: template.name, description: template.description,
            revision: template.revision, builtIn: template.builtIn, parameters: template.parameters,
            platformVariants: Object.keys(template.platformVariants), accountVariants: Object.keys(template.accountVariants), updatedAt: template.updatedAt });
        const templates = [...this.presets.values()].map(record => summaries(this.view(record, true)));
        if (fs.existsSync(this.directory)) for (const name of fs.readdirSync(this.directory).filter(name => /^[a-z][a-z0-9-]{0,63}\.json$/.test(name))) {
            const record = this.read(name.slice(0, -5));
            if (record && !('deletedAt' in record)) templates.push(summaries(this.view(record, false)));
        }
        const query = input.query?.toLowerCase();
        return { templates: templates.filter(template => !query || `${template.id} ${template.name} ${template.description}`.toLowerCase().includes(query))
            .sort((a, b) => a.id.localeCompare(b.id)).slice(0, input.limit) };
    }
    save(value: unknown): TemplateView {
        const { id, expectedRevision, ...definition } = saveTemplateSchema.parse(value);
        if (id.startsWith('builtin-')) throw new Error('Built-in templates are read-only. Save a copy under a custom ID.');
        parameters(definition); checkSize(definition);
        return this.locked(id, () => {
            const previous = this.read(id);
            if (previous && 'deletedAt' in previous) throw new Error('This template ID was deleted. Choose a new ID to avoid stale revision conflicts.');
            if (previous ? expectedRevision !== previous.revision : expectedRevision !== undefined) throw new Error('Template revision changed or does not exist. Read it again; new templates must omit expectedRevision.');
            const now = new Date().toISOString();
            const record: ActiveRecord = { schemaVersion: 1, id, definition, revision: (previous?.revision || 0) + 1, createdAt: previous?.createdAt || now, updatedAt: now };
            if (Buffer.byteLength(JSON.stringify(record, null, 2)) > MAX_BYTES) throw new Error('Stored template exceeds 1 MiB.');
            this.accounts.files.write(this.file(id), record); return this.view(record, false);
        });
    }
    delete(value: unknown) {
        const input = deleteTemplateSchema.parse(value);
        if (input.templateId.startsWith('builtin-')) throw new Error('Built-in templates are read-only.');
        return this.locked(input.templateId, () => {
            const record = this.read(input.templateId);
            if (!record || 'deletedAt' in record) throw new Error('Template not found.');
            if (record.revision !== input.expectedRevision) throw new Error('Template revision changed. Read it again before deleting.');
            // Retain only a revision tombstone, so an old editor cannot recreate or overwrite this ID.
            this.accounts.files.write(this.file(input.templateId), { schemaVersion: 1, id: record.id, revision: record.revision + 1, deletedAt: new Date().toISOString() });
            return { templateId: record.id, deleted: true, draftsChanged: false };
        });
    }
    render(value: unknown) {
        const input = renderTemplateSchema.parse(value);
        const template = this.get(input.templateId);
        if (template.revision !== input.expectedRevision) throw new Error('Template revision changed. Read it again before rendering.');
        if (new Set(input.accountIds).size !== input.accountIds.length) throw new Error('Account IDs must be unique.');
        const errors: string[] = [];
        const known = new Set(template.parameters.map(parameter => parameter.name));
        for (const name of Object.keys(input.values)) if (!known.has(name)) errors.push(`Unknown variable "${name}". Check the template parameters.`);
        const values = Object.fromEntries(template.parameters.filter(parameter => parameter.default !== undefined).map(parameter => [parameter.name, parameter.default!]).concat(Object.entries(input.values)));
        const missingVariables = template.parameters.filter(parameter => !Object.prototype.hasOwnProperty.call(values, parameter.name)).map(parameter => parameter.name);
        if (missingVariables.length) errors.push(`Missing variables: ${missingVariables.join(', ')}.`);
        for (const parameter of template.parameters) if (parameter.type === 'url' && Object.prototype.hasOwnProperty.call(values, parameter.name)) {
            try { validateUrl(values[parameter.name], parameter.name); } catch (error) { errors.push((error as Error).message); }
        }
        const base = { templateId: template.id, templateRevision: template.revision, templateName: template.name, saved: false, published: false, missingVariables };
        if (errors.length) return { ...base, valid: false as const, errors };
        // Replace source placeholders once. Replacement values are literal data, never a second template.
        let renderedBytes = 0;
        const rendered = mapStrings({ content: template.content, platformVariants: template.platformVariants, accountVariants: template.accountVariants }, text => {
            renderedBytes += Buffer.byteLength(text);
            if (renderedBytes > MAX_BYTES) throw new Error('Rendered content exceeds 1 MiB.');
            return text.replace(placeholder, (match, name: string) => {
                renderedBytes += Buffer.byteLength(values[name]) - Buffer.byteLength(match);
                if (renderedBytes > MAX_BYTES) throw new Error('Rendered content exceeds 1 MiB.');
                return values[name];
            });
        }) as {
            content: unknown; platformVariants: Record<string, unknown>; accountVariants: Record<string, unknown>;
        };
        checkSize(rendered);
        const content = draftContentSchema.safeParse({ ...(rendered.content as object), accountIds: input.accountIds,
            overrides: Object.fromEntries(input.accountIds.flatMap(accountId => {
                const account = this.accounts.get(accountId);
                const variant = Object.prototype.hasOwnProperty.call(rendered.accountVariants, accountId) ? rendered.accountVariants[accountId] : rendered.platformVariants[account.platform];
                return variant === undefined ? [] : [[accountId, variant]];
            })) });
        // Validate inactive variants too, so a saved recipe does not hide invalid rendered structure.
        for (const variant of Object.values(rendered.platformVariants).concat(Object.values(rendered.accountVariants))) {
            const parsed = overrideSchema.safeParse(variant);
            if (!parsed.success) errors.push(...parsed.error.issues.map(issue => `Variant ${issue.path.join('.')}: ${issue.message}`));
        }
        if (!content.success) errors.push(...content.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`));
        if (!content.success || errors.length) return { ...base, valid: false as const, errors };
        checkSize(content.data);
        return { ...base, valid: true as const, errors: [], content: content.data,
            platformVariants: rendered.platformVariants, accountVariants: rendered.accountVariants,
            variants: input.accountIds.map(accountId => ({ accountId, platform: this.accounts.get(accountId).platform,
                source: Object.prototype.hasOwnProperty.call(rendered.accountVariants, accountId) ? 'account' : Object.prototype.hasOwnProperty.call(rendered.platformVariants, this.accounts.get(accountId).platform) ? 'platform' : 'base',
                ...resolveAccountContent(content.data, accountId) })),
            warnings: ['Rendering does not validate platform limits, read image files, upload or publish. Create a draft, review variants and run preview_draft before publishing.'] };
    }
    createDraft(value: unknown) {
        const { title, ...input } = createDraftFromTemplateSchema.parse(value);
        const rendered = this.render(input);
        if (!rendered.valid || !rendered.content) throw new Error(`No draft saved. ${rendered.errors.join(' ')}`);
        const draft = this.drafts.create({ title: title || rendered.templateName, content: rendered.content }, { id: rendered.templateId, revision: rendered.templateRevision });
        return { draft, variants: rendered.variants };
    }
}
