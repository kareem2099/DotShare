import { z } from 'zod';

export const platformSchema = z.enum(['linkedin', 'telegram', 'x', 'discord', 'bluesky', 'mastodon', 'devto']);
export type Platform = z.infer<typeof platformSchema>;
export const accountIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
export const requestIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/)
    .describe('Stable unique ID for this user-authorized action. Reuse it on retries; never change it to bypass an uncertain result.');
const mediaArraySchema = z.array(z.string().min(1).max(4096)).max(10);
const mediaSchema = mediaArraySchema.default([]);
const partSchema = z.object({ text: z.string().max(100000), media: mediaSchema }).strict();
/** LinkedIn's comment length limit. */
export const FIRST_COMMENT_MAX = 1250;
const firstCommentSchema = z.string().trim().min(1).max(FIRST_COMMENT_MAX)
    .describe('LinkedIn only: posted as the first comment right after the post, e.g. the article link. Ignored on other platforms.');
export const overrideSchema = z.object({
    text: z.string().max(100000).optional(),
    media: mediaArraySchema.optional(),
    posts: z.array(partSchema).min(1).max(100).optional(),
    firstComment: firstCommentSchema.optional(),
}).strict();
export const postSchema = z.object({
    accountIds: z.array(accountIdSchema).min(1).max(20),
    text: z.string().max(100000).default(''),
    media: mediaSchema,
    posts: z.array(partSchema).min(1).max(100).optional().describe('Explicit thread parts. Supported by X, Bluesky and Mastodon.'),
    autoSplit: z.boolean().default(false).describe('Split long text into numbered threads on supported platforms. Preview shows exact parts.'),
    overrides: z.record(accountIdSchema, overrideSchema).default({}).describe('Optional content override per account ID.'),
    firstComment: firstCommentSchema.optional(),
    article: z.object({
        title: z.string().min(1).max(128),
        tags: z.array(z.string().regex(/^[a-z0-9]{1,30}$/)).max(4).default([]),
        published: z.boolean().default(true),
        canonicalUrl: z.url({ protocol: /^https$/ }).optional(),
        coverImage: z.url({ protocol: /^https$/ }).optional(),
        description: z.string().max(500).optional(),
        series: z.string().max(100).optional(),
    }).strict().optional(),
}).strict();
export const publishSchema = postSchema.extend({ requestId: requestIdSchema });
export const scheduleSchema = z.object({
    requestId: requestIdSchema,
    platforms: z.array(platformSchema.exclude(['discord'])).min(1).max(6),
    text: z.string().min(1).max(100000),
    mediaUrls: z.array(z.url({ protocol: /^https$/ })).max(4).default([]),
    scheduledAt: z.iso.datetime({ offset: true }).describe('Future ISO 8601 timestamp with an explicit timezone or Z.'),
}).strict();
export const accountInputSchema = z.object({
    id: accountIdSchema,
    name: z.string().min(1).max(100),
    platform: platformSchema,
    credentials: z.record(z.string(), z.string().min(1)),
}).strict();
export type PostInput = z.infer<typeof postSchema>;
export type PublishInput = z.infer<typeof publishSchema>;
export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type AccountInput = z.infer<typeof accountInputSchema>;
export const CREDENTIAL_FIELDS: Record<Platform, readonly string[]> = {
    telegram: ['botToken', 'chatId'], linkedin: ['accessToken'], x: ['accessToken'],
    discord: ['webhookUrl'], bluesky: ['identifier', 'password'],
    mastodon: ['instance', 'accessToken'], devto: ['apiKey'],
};
/**
 * Saved by `accounts connect` (browser sign-in). `connectionId` identifies one
 * sign-in, so refreshing an X token doesn't invalidate a saved preview, while
 * connecting a different login does. `expiresAt` is Unix seconds.
 */
export const OPTIONAL_CREDENTIAL_FIELDS: Partial<Record<Platform, readonly string[]>> = {
    linkedin: ['expiresAt', 'connectionId'],
    x: ['refreshToken', 'expiresAt', 'connectionId'],
};
/** Fields that change on every refresh and are left out of account fingerprints. */
export const ROTATING_CREDENTIAL_FIELDS: readonly string[] = ['accessToken', 'refreshToken', 'expiresAt'];
