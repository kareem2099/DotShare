import * as fs from 'fs';
import * as path from 'path';
import { AccountStore } from './accounts';
import { Platform, PostInput, postSchema } from './schema';
import { PLATFORM_CONFIGS } from '../platforms/platform-config';
import { fetchInstanceLimits } from '../platforms/mastodon';
import { AgentCloud, usd } from './cloud';

export interface PlannedPart { text: string; media: string[]; characters: number; }
export interface PlannedTarget { accountId: string; platform: Platform; posts: PlannedPart[]; characterLimit: number; maxMedia: number; firstComment?: string; }
export interface Preview { valid: boolean; targets: PlannedTarget[]; errors: string[]; warnings: string[]; }

/** One resolver for planning, template rendering and the editable variants view. */
export function resolveAccountContent(input: PostInput, accountId: string): { text: string; media: string[]; posts?: PostInput['posts']; firstComment?: string } {
    const override = Object.prototype.hasOwnProperty.call(input.overrides, accountId) ? input.overrides[accountId] : {};
    return {
        text: override.text ?? (override.posts ? '' : input.text),
        media: override.media ?? (override.posts ? [] : input.media),
        posts: override.posts ?? (override.text === undefined ? input.posts : undefined),
        ...((override.firstComment ?? input.firstComment) !== undefined && { firstComment: override.firstComment ?? input.firstComment }),
    };
}

// Conservative code-point counting for Bluesky; X uses documented weighted ranges.
// Emoji sequences can be over-counted, so preview never promises an oversized post.
export function characterCount(text: string, platform: Platform): number {
    if (platform === 'x' || platform === 'mastodon') {
        text = text.replace(/https?:\/\/[^\s]+/giu, 'x'.repeat(23));
    }
    if (platform !== 'x') return platform === 'bluesky' ? [...text].length : text.length;
    return [...text].reduce((count, char) => {
        const point = char.codePointAt(0)!;
        return count + (point <= 0x10ff || (point >= 0x2000 && point <= 0x200d) || (point >= 0x2010 && point <= 0x201f) || (point >= 0x2032 && point <= 0x2037) ? 1 : 2);
    }, 0);
}

export function splitThread(text: string, platform: Platform, limit: number): string[] {
    text = text.trim();
    if (characterCount(text, platform) <= limit) return [text];
    const budget = limit - 12;
    if (budget < 24) throw new Error('Platform character limit is too small for automatic threads.');
    // URLs stay atomic; split other text by Unicode code point, preserving newlines.
    const tokens = (text.match(/https?:\/\/[^\s]+|[^\s]+|\s+/gu) || []).flatMap(token => {
        if (characterCount(token, platform) <= budget || /^https?:\/\//i.test(token)) return [token];
        return [...token]; // Only force-split words longer than an entire post.
    });
    const parts: string[] = [];
    let current = '';
    for (const token of tokens) {
        if (characterCount(token, platform) > budget) throw new Error('A URL is too long for this platform.');
        if (characterCount(current + token, platform) > budget) {
            if (current.trim()) parts.push(current.trim());
            current = '';
        }
        if (!current && !token.trim()) continue;
        current += token;
    }
    if (current.trim()) parts.push(current.trim());
    if (parts.length > 100) throw new Error('Automatic threads are limited to 100 posts.');
    return parts.map((part, i) => `${part} (${i + 1}/${parts.length})`);
}

/** Image directories the agent may publish from. Unset means local images are disabled. */
function configuredMediaRoots(): string[] {
    return (process.env.DOTSHARE_MEDIA_ROOTS || '').split(path.delimiter).filter(root => root.trim());
}

export type MediaKind = 'image' | 'gif' | 'video';
const MB = 1024 * 1024;
/** Largest video each platform accepts from DotShare (Bluesky video isn't supported yet). */
export const VIDEO_LIMITS: Partial<Record<Platform, number>> = { x: 512 * MB, linkedin: 200 * MB, mastodon: 99 * MB, telegram: 50 * MB, discord: 10 * MB };
export const GIF_LIMITS: Partial<Record<Platform, number>> = { x: 15 * MB, mastodon: 16 * MB, telegram: 50 * MB, discord: 10 * MB };

/** What a local file really is, from its first bytes and a matching extension; undefined if unsupported. */
export function mediaKind(file: string): MediaKind | undefined {
    const header = Buffer.alloc(12);
    const fd = fs.openSync(file, 'r');
    try { fs.readSync(fd, header, 0, 12, 0); } finally { fs.closeSync(fd); }
    const ext = path.extname(file).toLowerCase();
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff && ['.jpg', '.jpeg'].includes(ext)) return 'image';
    if (header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && ext === '.png') return 'image';
    if (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP' && ext === '.webp') return 'image';
    if (header.toString('ascii', 0, 4) === 'GIF8' && ext === '.gif') return 'gif';
    if (header.toString('ascii', 4, 8) === 'ftyp' && ['.mp4', '.mov'].includes(ext)) return 'video';
    if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && ext === '.webm') return 'video';
    return undefined;
}

export class PostPlanner {
    private readonly roots: string[] = [];
    private readonly rootsError?: string;
    constructor(private readonly accounts: AccountStore, mediaRoots = configuredMediaRoots()) {
        // A bad setting disables images instead of stopping the server, so text posts still work.
        try {
            this.roots = mediaRoots.map(root => {
                if (!path.isAbsolute(root)) throw new Error(`DOTSHARE_MEDIA_ROOTS entries must be absolute paths: ${root}`);
                return fs.realpathSync(root);
            });
        } catch (error) {
            this.rootsError = error instanceof Error ? error.message : 'DOTSHARE_MEDIA_ROOTS is invalid.';
        }
    }

    /** Absolute paths are used as given; relative ones are looked up inside each media root, in order. */
    private locate(ref: string): string {
        if (path.isAbsolute(ref)) return fs.realpathSync(ref);
        for (const root of this.roots) {
            const candidate = path.join(root, ref);
            if (fs.existsSync(candidate)) return fs.realpathSync(candidate);
        }
        throw new Error(`Image "${ref}" was not found in DOTSHARE_MEDIA_ROOTS.`);
    }

    private media(ref: string, platform: Platform): string {
        if (platform === 'devto') {
            const url = new URL(ref);
            if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Dev.to images must be public HTTPS URLs.');
            return url.href;
        }
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) throw new Error('Use a local image path for social posts; only Dev.to accepts image URLs.');
        if (this.rootsError) throw new Error(`${this.rootsError} Local images are disabled until it is fixed.`);
        if (!this.roots.length) throw new Error('Local images are disabled. Set DOTSHARE_MEDIA_ROOTS to the image directories the agent may publish from.');
        const file = this.locate(ref);
        if (!this.roots.some(root => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); })) {
            throw new Error('Image is outside DOTSHARE_MEDIA_ROOTS.');
        }
        const info = fs.statSync(file);
        if (!info.isFile() || info.size < 1) throw new Error('Media must be a non-empty regular file.');
        const kind = mediaKind(file);
        if (!kind) throw new Error('Unsupported file. Use PNG/JPEG images (WebP on Bluesky, Mastodon and Discord), GIFs, or MP4/MOV videos (WebM on Mastodon and Discord).');
        const ext = path.extname(file).toLowerCase();
        const label = PLATFORM_CONFIGS[platform]?.name || platform;
        if (kind === 'image') {
            if (ext === '.webp' && !['bluesky', 'mastodon', 'discord'].includes(platform)) throw new Error(`${label} doesn't accept WebP. Use PNG or JPEG.`);
            const maximum = platform === 'bluesky' ? 1000000 : 8 * 1024 * 1024;
            if (info.size > maximum) throw new Error(`Image must be at most ${maximum} bytes on ${label}.`);
            return file;
        }
        const limits = kind === 'gif' ? GIF_LIMITS : VIDEO_LIMITS;
        const maximum = limits[platform];
        if (!maximum) throw new Error(`${label} posts from DotShare support images only${kind === 'gif' ? '; GIFs' : '; videos'} aren't supported there yet.`);
        if (kind === 'video' && ext === '.webm' && !['mastodon', 'discord'].includes(platform)) throw new Error(`${label} doesn't accept WebM. Use MP4 or MOV.`);
        if (info.size > maximum) throw new Error(`${kind === 'gif' ? 'GIF' : 'Video'} must be at most ${Math.floor(maximum / (1024 * 1024))} MB on ${label}.`);
        return file;
    }

    async preview(value: unknown): Promise<Preview> {
        const input: PostInput = postSchema.parse(value);
        const result: Preview = { valid: true, targets: [], errors: [], warnings: [] };
        if (new Set(input.accountIds).size !== input.accountIds.length) result.errors.push('Account IDs must be unique.');
        if (Object.keys(input.overrides).some(id => !input.accountIds.includes(id))) result.errors.push('An override references an account outside accountIds.');
        let xThroughDotSuite = 0;
        for (const id of input.accountIds) {
            try {
                const account = this.accounts.get(id);
                const config = PLATFORM_CONFIGS[account.platform];
                const { text, media, posts: explicit, firstComment } = resolveAccountContent(input, id);
                if (firstComment !== undefined && account.platform !== 'linkedin') result.warnings.push(`${id}: firstComment is only posted on LinkedIn, so it is ignored for ${account.platform}.`);
                let limit = config.maxChars;
                let maxMedia = config.maxMediaCount;
                if (account.platform === 'mastodon') {
                    const credentials = this.accounts.credentials(id);
                    const limits = await fetchInstanceLimits(credentials.instance);
                    limit = limits.maxChars; maxMedia = Math.min(4, limits.maxMedia);
                }
                if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100000 || !Number.isSafeInteger(maxMedia) || maxMedia < 0) throw new Error('Invalid instance limits.');
                if (explicit && (text.trim() || media.length)) throw new Error('Use either text/media or explicit posts, not both.');
                if (explicit && !config.supportsThreads) throw new Error('This platform does not support threads.');
                if (account.platform === 'devto' && !input.article) throw new Error('Dev.to requires article.title and article metadata.');
                if (account.platform === 'telegram' && media.length) {
                    limit = 1024;
                    // Separate messages preserve a receipt for each image; an album is not implied.
                    if (media.length > 1) result.warnings.push(`${id}: images are sent as separate messages, with the caption on the first.`);
                }
                const parts = explicit || (input.autoSplit && config.supportsThreads
                    ? splitThread(text, account.platform, limit).map((part, i) => ({ text: part, media: i === 0 ? media : [] }))
                    : [{ text, media }]);
                const posts = parts.map(part => {
                    if (!part.text.trim() && !part.media.length) throw new Error('An empty post cannot be published.');
                    if (part.media.length > maxMedia) throw new Error(`At most ${maxMedia} images are supported per post.`);
                    const characters = characterCount(part.text, account.platform);
                    if (characters > limit) throw new Error(`Post has ${characters} characters; limit is ${limit}. Enable autoSplit for supported platforms.`);
                    if (account.platform === 'bluesky' && !part.text.trim()) throw new Error('Bluesky posts require text.');
                    const media = part.media.map(ref => this.media(ref, account.platform));
                    if (['x', 'mastodon'].includes(account.platform) && media.length > 1 && media.some(file => mediaKind(file) !== 'image')) {
                        throw new Error(`${config.name} allows one video or GIF per post, without other media.`);
                    }
                    return { text: part.text, media, characters };
                });
                if (account.platform === 'x' && this.accounts.xViaDotSuite(id)) {
                    if (++xThroughDotSuite > 1) throw new Error('Only one X account can post through DotSuite in a request.');
                    if (posts.some(post => post.media.some(file => mediaKind(file) === 'video'))) throw new Error('X posts through DotSuite support images and GIFs, not videos yet.');
                    const estimate = await new AgentCloud(this.accounts).xEstimate(posts.map(post => ({ text: post.text, media_urls: post.media.map(() => 'https://dotsuite.dev/estimate.png') })));
                    const left = estimate.usage.remaining_micros;
                    if (!estimate.affordable) throw new Error(`This costs ${usd(estimate.estimated_micros)} on X but only ${usd(left)} of this month's X budget is left.`);
                    const links = estimate.posts.filter(post => post.kind === 'post_url').length;
                    result.warnings.push(`${id}: X will charge ${usd(estimate.estimated_micros)} for ${posts.length} post(s)${links ? `, ${links} with a link` : ''}; ${usd(left - estimate.estimated_micros)} of this month's X budget will be left.`);
                }
                result.targets.push({ accountId: id, platform: account.platform, posts, characterLimit: limit, maxMedia,
                    ...(firstComment !== undefined && account.platform === 'linkedin' && { firstComment }) });
            } catch (error) {
                result.errors.push(`${id}: ${error instanceof Error ? error.message : 'Preview failed.'}`);
            }
        }
        result.valid = result.errors.length === 0;
        result.warnings.push('X and Bluesky character counts are conservative for combined emoji. Preview never publishes or uploads media.');
        return result;
    }
}
