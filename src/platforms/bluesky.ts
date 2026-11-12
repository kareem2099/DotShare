import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { PublicationObserver } from './runtime';
import { rememberSecret } from '../security/redaction';

export interface BlueSkyPostData {
    text: string | string[];  // string[] = pre-split thread chunks from UI
    media?: string[];
    posts?: Array<{ text: string; media?: string[] }>;
}

function createThreadChunks(text: string, maxLength = 290): string[] {
    if (text.length <= 300) return [text];

    // Split by any whitespace including newlines
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of words) {
        if (!word) continue;
        const space = currentChunk ? ' ' : '';

        if ((currentChunk + space + word).length > maxLength) {
            if (!currentChunk) {
                // The word itself is longer than maxLength! Force split it.
                let remainingWord = word;
                while (remainingWord.length > maxLength) {
                    chunks.push(remainingWord.slice(0, maxLength));
                    remainingWord = remainingWord.slice(maxLength);
                }
                currentChunk = remainingWord;
            } else {
                chunks.push(currentChunk);
                currentChunk = word;
            }
        } else {
            currentChunk += space + word;
        }
    }
    if (currentChunk) chunks.push(currentChunk);

    return chunks.map((chunk, index) => `${chunk} (${index + 1}/${chunks.length})`);
}

interface BlobRef {
    $type: 'blob';
    ref: { $link: string };
    mimeType: string;
    size: number;
}

export interface Facet {
    index: { byteStart: number; byteEnd: number };
    features: Array<{ $type: 'app.bsky.richtext.facet#link'; uri: string } | { $type: 'app.bsky.richtext.facet#tag'; tag: string } | { $type: 'app.bsky.richtext.facet#mention'; did: string }>;
}

// Punctuation that ends a sentence rather than a URL, e.g. "see https://x.dev."
const TRAILING_URL_PUNCTUATION = /[.,;:!?'")\]]+$/;
const URL_PATTERN = /https?:\/\/[^\s]+/gu;
// A tag starts after whitespace or at the start, and needs at least one non-digit.
const TAG_PATTERN = /(^|\s)#([^\s#]*[^\d\s#][^\s#]*)/gu;
const MAX_TAG_LENGTH = 64;

/**
 * Bluesky only links URLs and hashtags that the post marks as facets, with
 * offsets in UTF-8 bytes. Without them both show as plain, unclickable text.
 */
export function detectFacets(text: string): Facet[] {
    const bytes = (end: number): number => Buffer.byteLength(text.slice(0, end), 'utf8');
    const facets: Facet[] = [];
    for (const match of text.matchAll(URL_PATTERN)) {
        const uri = match[0].replace(TRAILING_URL_PUNCTUATION, '');
        try { new URL(uri); } catch { continue; }
        const start = match.index!;
        facets.push({ index: { byteStart: bytes(start), byteEnd: bytes(start + uri.length) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri }] });
    }
    for (const match of text.matchAll(TAG_PATTERN)) {
        const tag = match[2].replace(/\p{P}+$/u, '');
        if (!tag || tag.length > MAX_TAG_LENGTH || /^\d+$/.test(tag)) continue;
        const start = match.index! + match[1].length;
        facets.push({ index: { byteStart: bytes(start), byteEnd: bytes(start + 1 + tag.length) }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag }] });
    }
    return facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

// A mention starts after whitespace, "(" or the start, like the Bluesky app's parser.
const MENTION_PATTERN = /(^|[\s(])@([a-zA-Z0-9.-]+)/gu;
const HANDLE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export interface MentionCandidate { start: number; end: number; handle: string; }
/** @handle.domain mentions in `text`, as UTF-16 offsets around the "@handle". */
export function detectMentions(text: string): MentionCandidate[] {
    const mentions: MentionCandidate[] = [];
    for (const match of text.matchAll(MENTION_PATTERN)) {
        const handle = match[2].replace(/[.-]+$/, '');
        if (handle.length > 253 || !HANDLE.test(handle)) continue;
        const start = match.index! + match[1].length;
        mentions.push({ start, end: start + 1 + handle.length, handle: handle.toLowerCase() });
    }
    return mentions;
}

export type HandleResolver = (handle: string) => Promise<string | undefined>;
/** Public handle lookup; unknown handles stay plain text, as in the Bluesky app. */
export const resolveHandle: HandleResolver = async handle => {
    try {
        const { data } = await axios.get('https://bsky.social/xrpc/com.atproto.identity.resolveHandle', { params: { handle }, timeout: 5000, maxRedirects: 0 });
        return typeof data?.did === 'string' && /^did:[a-z]+:[A-Za-z0-9._:%-]+$/.test(data.did) ? data.did : undefined;
    } catch { return undefined; }
};

/** Link, tag and mention facets; each distinct handle is looked up once. */
export async function buildFacets(text: string, resolve: HandleResolver = resolveHandle, cache = new Map<string, Promise<string | undefined>>()): Promise<Facet[]> {
    const facets = detectFacets(text);
    const bytes = (end: number): number => Buffer.byteLength(text.slice(0, end), 'utf8');
    for (const mention of detectMentions(text)) {
        const byteStart = bytes(mention.start); const byteEnd = bytes(mention.end);
        if (facets.some(facet => byteStart < facet.index.byteEnd && facet.index.byteStart < byteEnd)) continue;
        if (!cache.has(mention.handle)) cache.set(mention.handle, resolve(mention.handle));
        const did = await cache.get(mention.handle);
        if (did) facets.push({ index: { byteStart, byteEnd }, features: [{ $type: 'app.bsky.richtext.facet#mention', did }] });
    }
    return facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.png':  return 'image/png';
        case '.gif':  return 'image/gif';
        case '.webp': return 'image/webp';
        default:      return 'image/jpeg';
    }
}

async function uploadBlobToBluesky(filePath: string, accessJwt: string): Promise<BlobRef> {
    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = getMimeType(filePath);

    const response = await axios.post(
        'https://bsky.social/xrpc/com.atproto.repo.uploadBlob',
        fileBuffer,
        {
            headers: {
                Authorization: `Bearer ${accessJwt}`,
                'Content-Type': mimeType,
            },
        }
    );

    Logger.info(`BlueSky: blob uploaded for ${path.basename(filePath)}`);
    return response.data.blob as BlobRef;
}

export async function shareToBlueSky(identifier: string, password: string, postData: BlueSkyPostData, onPublished?: PublicationObserver): Promise<string> {
    let published = 0;
    try {
        const session = await authenticateBlueSky(identifier, password);

        const headers = {
            'Authorization': `Bearer ${session.accessJwt}`,
            'Content-Type': 'application/json'
        };

        // Handle both structured threads and single posts
        const threadPosts = [...(postData.posts || [])];
        if (threadPosts.length === 0) {
            // Convert single post to thread structure for unified processing
            const texts = Array.isArray(postData.text)
                ? postData.text.filter(t => t.trim())
                : createThreadChunks(postData.text, 290);
            
            texts.forEach((txt, idx) => {
                threadPosts.push({
                    text: txt,
                    media: idx === 0 ? postData.media : undefined // Attach media to first post only for auto-split
                });
            });
        }

        let firstPostUri = '';
        let rootPost:   { uri: string; cid: string } | null = null;
        let parentPost: { uri: string; cid: string } | null = null;

        const handles = new Map<string, Promise<string | undefined>>();
        for (let i = 0; i < threadPosts.length; i++) {
            const currentPost = threadPosts[i];
            
            // 1. Upload media for THIS post
            const imageBlobs: BlobRef[] = [];
            if (currentPost.media && currentPost.media.length > 0) {
                if (currentPost.media.length > 4) throw new Error('Bluesky supports at most 4 images per post.');
                const filesToUpload = currentPost.media;
                for (const filePath of filesToUpload) {
                    try {
                        const blob = await uploadBlobToBluesky(filePath, session.accessJwt);
                        imageBlobs.push(blob);
                    } catch (uploadErr) {
                        Logger.error(`BlueSky: failed to upload blob for ${path.basename(filePath)}:`, uploadErr);
                        throw new Error(`Bluesky media upload failed for ${path.basename(filePath)}`);
                    }
                }
            }

            // 2. Prepare post record
            const record: Record<string, unknown> = {
                text: currentPost.text,
                createdAt: new Date().toISOString(),
                $type: 'app.bsky.feed.post'
            };
            const facets = await buildFacets(currentPost.text, resolveHandle, handles);
            if (facets.length > 0) record.facets = facets;

            // 3. Attach embeds if media exists
            if (imageBlobs.length > 0) {
                record.embed = {
                    $type: 'app.bsky.embed.images',
                    images: imageBlobs.map(blob => ({
                        image: blob,
                        alt: ''
                    }))
                };
            }

            // 4. Link to previous post in thread
            if (parentPost && rootPost) {
                record.reply = {
                    root:   rootPost,
                    parent: parentPost
                };
            }

            // 5. Submit record
            const response = await axios.post(
                'https://bsky.social/xrpc/com.atproto.repo.createRecord',
                { collection: 'app.bsky.feed.post', repo: session.did, record },
                { headers }
            );

            if (!response.data?.uri || !response.data?.cid) throw new Error('Bluesky returned no post reference; check your account before retrying.');
            const uri: string = response.data.uri;
            const cid: string = response.data.cid;

            if (i === 0) {
                firstPostUri = uri;
                rootPost = { uri, cid };
            }
            parentPost = { uri, cid };
            published++;
            onPublished?.({ id: uri, uri, url: `https://bsky.app/profile/${session.did}/post/${uri.split('/').pop()}` });

            Logger.info(`BlueSky: post ${i + 1}/${threadPosts.length} posted successfully (uri: ${uri})`);
        }

        return firstPostUri;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const axiosError = error as { response?: { data?: { message?: string } } };
        const apiMessage = axiosError.response?.data?.message;
        Logger.error('Error posting to BlueSky:', apiMessage || errorMessage);
        throw new Error(`${apiMessage || 'Failed to post to BlueSky'}${published ? ` (${published} thread post(s) already published)` : ''}`);
    }
}

export async function authenticateBlueSky(identifier: string, password: string): Promise<{ accessJwt: string, refreshJwt: string, did: string }> {
    try {
        const response = await axios.post('https://bsky.social/xrpc/com.atproto.server.createSession', {
            identifier,
            password
        });

        rememberSecret(response.data.accessJwt);
        rememberSecret(response.data.refreshJwt);
        return {
            accessJwt: response.data.accessJwt,
            refreshJwt: response.data.refreshJwt,
            did: response.data.did
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const axiosError = error as { response?: { data?: { message?: string } } };
        const apiMessage = axiosError.response?.data?.message;
        Logger.error('Error authenticating with BlueSky:', apiMessage || errorMessage);
        throw new Error(apiMessage || 'Failed to authenticate with BlueSky');
    }
}

export async function validateBlueSkyCredentials(identifier: string, password: string): Promise<boolean> {
    try {
        await authenticateBlueSky(identifier, password);
        return true;
    } catch {
        return false;
    }
}

export async function refreshBlueSkySession(refreshToken: string): Promise<{ accessJwt: string, refreshJwt: string, did: string }> {
    try {
        const response = await axios.post('https://bsky.social/xrpc/com.atproto.server.refreshSession', {}, {
            headers: {
                'Authorization': `Bearer ${refreshToken}`
            }
        });

        rememberSecret(response.data.accessJwt);
        rememberSecret(response.data.refreshJwt);
        return {
            accessJwt: response.data.accessJwt,
            refreshJwt: response.data.refreshJwt,
            did: response.data.did
        };
    } catch (error: unknown) {
        Logger.error('Error refreshing BlueSky session:', error);
        throw new Error('Failed to refresh BlueSky session');
    }
}