import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { Logger } from '../utils/Logger';

export interface DevToArticleData {
    title: string;
    body_markdown: string;
    tags?: string[];
    series?: string;
    canonical_url?: string;
    published?: boolean;
    main_image?: string;
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

/**
 * Upload an image to Dev.to and return the URL.
 * Dev.to uses a dedicated image upload endpoint.
 */
async function uploadImageToDevTo(imagePath: string, apiKey: string): Promise<string> {
    const fileBuffer = fs.readFileSync(imagePath);
    const fileName = path.basename(imagePath);
    
    const formData = new FormData();
    formData.append('image', fileBuffer, {
        filename: fileName,
        contentType: getMimeType(imagePath),
    });

    const response = await axios.post(
        'https://dev.to/api/images',
        formData,
        {
            headers: {
                'api-key': apiKey,
                ...formData.getHeaders(),
            },
        }
    );

    return response.data.url || response.data.link;
}

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.png':  return 'image/png';
        case '.gif':  return 'image/gif';
        case '.webp': return 'image/webp';
        default:      return 'application/octet-stream';
    }
}

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Share an article to Dev.to
 * 
 * @param apiKey - Dev.to API key
 * @param articleData - Article content (text, media, etc.)
 * @returns The URL of the published article
 */
export async function shareToDevTo(
    apiKey: string,
    articleData: {
    text: string;
    title?: string;        // override extracted title
    tags?: string[];       // override extracted tags
    description?: string;
    coverImage?: string;
    published?: boolean;   // draft vs published
    media?: string[];
    canonicalUrl?: string;
    /** Dev.to series name (must exist on your account). */
    series?: string;
    }
): Promise<string> {
    try {
        // 1. Extract title and body from markdown
        const { title, body } = extractTitleFromMarkdown(articleData.text);
        
        // 2. Extract tags from content
        const tags = extractTags(articleData.text);
        
        // 3. Upload images if provided
        let mainImage: string | undefined;
        let bodyWithImages = body;
        
        if (articleData.media && articleData.media.length > 0) {
            for (const mediaPath of articleData.media) {
                if (!fs.existsSync(mediaPath)) {
                    Logger.info(`Dev.to media file not found, skipping: ${mediaPath}`);
                    continue;
                }
                
                try {
                    const imageUrl = await uploadImageToDevTo(mediaPath, apiKey);
                    
                    // First image becomes the main image
                    if (!mainImage) {
                        mainImage = imageUrl;
                    }
                    
                    // Add image to body markdown
                    const imageMarkdown = `\n\n![Image](${imageUrl})\n\n`;
                    bodyWithImages += imageMarkdown;
                    
                    Logger.info(`Dev.to: uploaded image successfully`);
                } catch (error) {
                    Logger.error('Failed to upload image to Dev.to:', error);
                }
            }
        }
        
        // 4. Create the article payload — respect user overrides
        const finalTitle = articleData.title || title;
        const finalTags = articleData.tags && articleData.tags.length > 0 ? articleData.tags.slice(0, 4) : tags;
        const finalPublished = articleData.published ?? true;
        const finalCoverImage = articleData.coverImage || mainImage;

        const payload: DevToArticlePayload = {
            article: {
                title: finalTitle,
                body_markdown: bodyWithImages,
                tags: finalTags,
                published: finalPublished,
                ...(articleData.description && { description: articleData.description }),
                ...(finalCoverImage && { main_image: finalCoverImage }),
                ...(articleData.canonicalUrl && { canonical_url: articleData.canonicalUrl }),
                ...(articleData.series?.trim() && { series: articleData.series.trim() }),
            },
        };
        
        // 5. Post the article
        const response = await axios.post(
            'https://dev.to/api/articles',
            payload,
            {
                headers: {
                    'api-key': apiKey,
                    'Content-Type': 'application/json',
                },
            }
        );
        
        const articleUrl = response.data.url;
        Logger.info(`Dev.to: article published successfully - ${articleUrl}`);
        
        return articleUrl;
        
    } catch (error: unknown) {
        const msg = axios.isAxiosError(error)
            ? (error.response?.data?.error || error.response?.data?.message || error.message)
            : error instanceof Error ? error.message : String(error);
        
        Logger.error('Error posting to Dev.to:', msg);
        throw new Error(`Failed to post to Dev.to: ${msg}`);
    }
}

/**
 * Validate Dev.to API key by fetching user info
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