import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';

export interface MediumArticleData {
    title: string;
    content: string;
    contentFormat?: 'html' | 'markdown';
    tags?: string[];
    canonicalUrl?: string;
    publishStatus?: 'public' | 'draft' | 'unlisted';
}

interface MediumArticlePayload {
    title: string;
    contentFormat: string;
    content: string;
    tags?: string[];
    canonicalUrl?: string;
    publishStatus: string;
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
 * Extract hashtags from content and convert them to Medium tags.
 * Medium allows up to 5 tags per article.
 */
function extractTags(content: string): string[] {
    const tagRegex = /#(\w+)/g;
    const tags: string[] = [];
    let match;
    
    while ((match = tagRegex.exec(content)) !== null) {
        const tag = match[1].toLowerCase();
        if (!tags.includes(tag) && tags.length < 5) {
            tags.push(tag);
        }
    }
    
    return tags;
}

/**
 * Get the authenticated user's ID from Medium API
 */
async function getMediumUserId(accessToken: string): Promise<string> {
    const response = await axios.get(
        'https://api.medium.com/v1/me',
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        }
    );
    
    return response.data.data.id;
}

/** WebView sends `published`; Medium API expects `public`. */
function normalizeMediumPublishStatus(s?: string): 'public' | 'draft' | 'unlisted' {
    if (!s) return 'public';
    if (s === 'published') return 'public';
    if (s === 'draft' || s === 'public' || s === 'unlisted') return s;
    return 'public';
}

function isHttpUrl(ref: string): boolean {
    return /^https?:\/\//i.test(ref.trim());
}

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Share an article to Medium
 * 
 * @param accessToken - Medium OAuth2 access token
 * @param articleData - Article content (text, media, etc.)
 * @returns The URL of the published article
 */
export async function shareToMedium(
    accessToken: string,
    articleData: {
        text: string;
        title?: string;
        tags?: string[];
        canonicalUrl?: string;
        /** UI may send `published`; normalized to Medium's `public`. */
        publishStatus?: 'public' | 'draft' | 'unlisted' | 'published';
        contentFormat?: 'html' | 'markdown';
        media?: string[];
    }
): Promise<string> {
    try {
        // 1. Get user ID
        const userId = await getMediumUserId(accessToken);
        Logger.info(`Medium: authenticated as user ${userId}`);
        
        // 2. Extract title and body from markdown
        const { title, body } = extractTitleFromMarkdown(articleData.text);
        
        // 3. Extract tags from content
        const tags = extractTags(articleData.text);
        
        // 4. Prepare content with media (embed images as markdown)
        let contentWithMedia = body;
        
        if (articleData.media && articleData.media.length > 0) {
            for (const mediaPath of articleData.media) {
                if (isHttpUrl(mediaPath)) {
                    contentWithMedia += `\n\n![Image](${mediaPath.trim()})\n\n`;
                    Logger.info('Medium: embedded remote image URL in markdown');
                    continue;
                }
                if (!fs.existsSync(mediaPath)) {
                    Logger.info(`Medium media file not found, skipping: ${mediaPath}`);
                    continue;
                }
                Logger.info(
                    `Medium: skipping local file (no upload API): ${path.basename(mediaPath)} — use Cover Image URL or host the image publicly`
                );
            }
        }
        
        // 5. Build the article payload — respect user overrides
        const finalTitle = articleData.title || title;
        const finalTags = articleData.tags && articleData.tags.length > 0 
            ? articleData.tags.slice(0, 5) 
            : tags;
        const finalPublishStatus = normalizeMediumPublishStatus(articleData.publishStatus);
        const finalContentFormat = articleData.contentFormat || 'markdown';
        
        const payload: MediumArticlePayload = {
            title: finalTitle,
            contentFormat: finalContentFormat,
            content: contentWithMedia,
            publishStatus: finalPublishStatus,
            ...(finalTags.length > 0 && { tags: finalTags }),
            ...(articleData.canonicalUrl && { canonicalUrl: articleData.canonicalUrl }),
        };
        
        // 6. Create the post
        const response = await axios.post(
            `https://api.medium.com/v1/users/${userId}/posts`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
            }
        );
        
        const articleUrl = response.data.data.url;
        Logger.info(`Medium: article published successfully - ${articleUrl}`);
        
        return articleUrl;
        
    } catch (error: unknown) {
        const msg = axios.isAxiosError(error)
            ? (error.response?.data?.errors?.[0]?.message || error.response?.data?.message || error.message)
            : error instanceof Error ? error.message : String(error);
        
        Logger.error('Error posting to Medium:', msg);
        throw new Error(`Failed to post to Medium: ${msg}`);
    }
}

/**
 * Validate Medium access token by fetching user info
 */
export async function validateMediumCredentials(accessToken: string): Promise<boolean> {
    try {
        await axios.get(
            'https://api.medium.com/v1/me',
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                },
            }
        );
        return true;
    } catch {
        return false;
    }
}