import axios from 'axios';
import * as path from 'path';
import { Logger } from '../utils/Logger';

export interface DevToArticleData {
    title: string;
    body_markdown: string;
    tags?: string[];
    series?: string;
    canonical_url?: string;
    published?: boolean;
    main_image?: string;
    description?: string;
}

interface DevToArticlePayload {
    article: {
        title: string;
        body_markdown: string;
        tags?: string[];
        series?: string;
        canonical_url?: string;
        published: boolean;
        main_image?: string;
        description?: string;
    };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract title from markdown content.
 * If the content starts with a markdown heading (# Title), use that as the title.
 * Otherwise, use the first line or a default title.
 */
function extractTitleFromMarkdown(content: string): { title: string; body: string } {
    const lines = content.trim().split('\n');
    
    // Check if first line is a markdown heading
    if (lines[0]?.startsWith('# ')) {
        const title = lines[0].substring(2).trim();
        const body = lines.slice(1).join('\n').trim();
        return { title, body };
    }
    
    // Check if there's a title in the first few lines
    for (let i = 0; i < Math.min(5, lines.length); i++) {
        if (lines[i]?.startsWith('# ')) {
            const title = lines[i].substring(2).trim();
            const body = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n').trim();
            return { title, body };
        }
    }
    
    // Default: use first 60 characters as title
    const firstLine = lines[0] || 'Untitled';
    const title = firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;
    return { title, body: content };
}

/**
 * Extract hashtags from content and convert them to Dev.to tags.
 * Dev.to allows up to 4 tags per article.
 */
function extractTags(content: string): string[] {
    const tagRegex = /#(\w+)/g;
    const tags: string[] = [];
    let match;
    
    while ((match = tagRegex.exec(content)) !== null) {
        const tag = match[1].toLowerCase();
        if (!tags.includes(tag) && tags.length < 4) {
            tags.push(tag);
        }
    }
    
    // Default tags if none found
    if (tags.length === 0) {
        tags.push('discuss');
    }
    
    return tags;
}

function isHttpUrl(ref: string): boolean {
    return /^https?:\/\//i.test(ref.trim());
}

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Share an article to Dev.to.
 *
 * ⚠️ Dev.to API does NOT support direct image file uploads.
 * Images must be publicly accessible URLs.
 * Use coverImage for the article cover, or embed URLs directly in the markdown body.
 * Tip: host images on Cloudinary, GitHub, or any public CDN first.
 *
 * @param apiKey     - Dev.to API key (from Settings → Extensions)
 * @param articleData - Article content and metadata
 * @returns An object containing the URL and ID of the article
 */
export async function shareToDevTo(
    apiKey: string,
    articleData: {
        text: string;
        title?: string;
        tags?: string[];
        description?: string;
        /** Must be a publicly accessible URL — Dev.to has no image upload API. */
        coverImage?: string;
        published?: boolean;
        /** Must be publicly accessible URLs — local files are not supported. */
        media?: string[];
        canonicalUrl?: string;
        /** Dev.to series name (must already exist on your account). */
        series?: string;
    }
): Promise<{ url: string; id: number }> {
    try {
        // 1. Extract title and body from markdown
        const { title, body } = extractTitleFromMarkdown(articleData.text);

        // 2. Extract tags from content
        const tags = extractTags(articleData.text);

        // 3. Handle media — Dev.to only accepts public URLs, no file upload API
        let bodyWithImages = body;
        let firstImageUrl: string | undefined;

        if (articleData.media && articleData.media.length > 0) {
            for (const mediaRef of articleData.media) {
                if (isHttpUrl(mediaRef)) {
                    // Remote URL → embed in body + use as cover if none set
                    if (!firstImageUrl) firstImageUrl = mediaRef.trim();
                    bodyWithImages += `\n\n![Image](${mediaRef.trim()})\n\n`;
                    Logger.info(`Dev.to: embedded image URL in article body`);
                } else {
                    // Local file → skip with clear warning
                    Logger.info(
                        `Dev.to: local file upload is not supported by the Dev.to API. ` +
                        `Upload "${path.basename(mediaRef)}" to a public host (Cloudinary, GitHub, Imgur) ` +
                        `and use the public URL instead.`
                    );
                }
            }
        }

        // 4. Build payload — respect user overrides
        const finalTitle      = articleData.title || title;
        const finalTags       = articleData.tags && articleData.tags.length > 0
                                    ? articleData.tags.slice(0, 4)
                                    : tags;
        const finalPublished  = articleData.published ?? true;
        const finalCoverImage = articleData.coverImage || firstImageUrl;

        const payload: DevToArticlePayload = {
            article: {
                title:         finalTitle,
                body_markdown: bodyWithImages,
                tags:          finalTags,
                published:     finalPublished,
                ...(articleData.description   && { description:   articleData.description }),
                ...(finalCoverImage           && { main_image:    finalCoverImage }),
                ...(articleData.canonicalUrl  && { canonical_url: articleData.canonicalUrl }),
                ...(articleData.series?.trim() && { series:       articleData.series.trim() }),
            },
        };

        // 5. Post the article
        const response = await axios.post(
            'https://dev.to/api/articles',
            payload,
            {
                headers: {
                    'api-key':      apiKey,
                    'Content-Type': 'application/json',
                },
            }
        );

        const articleUrl = response.data.url;
        const articleId = response.data.id;
        Logger.info(`Dev.to: article published successfully - ${articleUrl} (ID: ${articleId})`);

        return { url: articleUrl, id: articleId };

    } catch (error: unknown) {
        const msg = axios.isAxiosError(error)
            ? (error.response?.data?.error || error.response?.data?.message || error.message)
            : error instanceof Error ? error.message : String(error);

        Logger.error('Error posting to Dev.to:', msg);
        throw new Error(`Failed to post to Dev.to: ${msg}`);
    }
}

/**
 * Validate Dev.to API key by fetching user info.
 */
export async function validateDevToCredentials(apiKey: string): Promise<boolean> {
    try {
        await axios.get(
            'https://dev.to/api/users/me',
            { headers: { 'api-key': apiKey } }
        );
        return true;
    } catch {
        return false;
    }
}

/**
 * Update an existing article on Dev.to.
 */
export async function updateDevToArticle(
    apiKey: string,
    articleId: number,
    articleData: {
        text: string;
        title?: string;
        tags?: string[];
        description?: string;
        coverImage?: string;
        published?: boolean;
        canonicalUrl?: string;
        series?: string;
    }
): Promise<{ url: string; id: number }> {
    try {
        const { title, body } = extractTitleFromMarkdown(articleData.text);
        const tags = extractTags(articleData.text);

        const payload: DevToArticlePayload = {
            article: {
                title:         articleData.title || title,
                body_markdown: body,
                tags:          articleData.tags || tags,
                published:     articleData.published ?? true,
                ...(articleData.description   && { description:   articleData.description }),
                ...(articleData.coverImage    && { main_image:    articleData.coverImage }),
                ...(articleData.canonicalUrl  && { canonical_url: articleData.canonicalUrl }),
                ...(articleData.series?.trim() && { series:       articleData.series.trim() }),
            },
        };

        const response = await axios.put(
            `https://dev.to/api/articles/${articleId}`,
            payload,
            {
                headers: {
                    'api-key':      apiKey,
                    'Content-Type': 'application/json',
                },
            }
        );

        return { url: response.data.url, id: response.data.id };
    } catch (error: unknown) {
        const msg = axios.isAxiosError(error)
            ? (error.response?.data?.error || error.response?.data?.message || error.message)
            : error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to update Dev.to article: ${msg}`);
    }
}

/**
 * Fetch current user's articles (including drafts).
 */
interface DevToArticleResponse {
    id: number;
    title: string;
    body_markdown?: string;
    tags?: string[];
    published?: boolean;
    published_at?: string;
    url?: string;
    canonical_url?: string;
    cover_image?: string;
    description?: string;
}

export async function fetchDevToArticles(apiKey: string): Promise<DevToArticleResponse[]> {
    try {
        const response = await axios.get(
            'https://dev.to/api/articles/me/all?per_page=100',
            { headers: { 'api-key': apiKey } }
        );
        return response.data;
    } catch (error: unknown) {
        const msg = axios.isAxiosError(error)
            ? (error.response?.data?.error || error.response?.data?.message || error.message)
            : error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch Dev.to articles: ${msg}`);
    }
}