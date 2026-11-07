import axios, { AxiosRequestConfig } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { PublicationObserver } from './runtime';

export interface MastodonPostData {
    text: string | string[];  // string[] = pre-split thread chunks from UI
    media?: string[];
    posts?: Array<{ text: string; media?: string[] }>;
}

interface InstanceLimits {
    maxChars: number;
    maxMedia: number;
}

const DEFAULT_LIMITS: InstanceLimits = { maxChars: 500, maxMedia: 4 };

/** Mastodon counts every URL as this many characters, whatever its real length. */
const URL_LENGTH = 23;
const URL_REGEX = /https?:\/\/\S+/gi;

/** Room kept in each auto-split post for the " (12/34)" suffix. */
const THREAD_SUFFIX_RESERVE = 10;

const MEDIA_POLL_INTERVAL_MS = 1000;
const MEDIA_POLL_ATTEMPTS = 60;

/**
 * Validate a user-supplied instance address and reduce it to its origin.
 * The access token is sent to this host, so anything but plain HTTPS is refused.
 */
export function normalizeMastodonInstance(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) throw new Error('Mastodon instance URL is required');

    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    let url: URL;
    try {
        url = new URL(withScheme);
    } catch {
        throw new Error('Mastodon instance URL is not valid');
    }

    if (url.protocol !== 'https:') throw new Error('Mastodon instance URL must use HTTPS');
    if (url.username || url.password) throw new Error('Mastodon instance URL must not contain credentials');

    return url.origin;
}

export function mastodonLength(text: string): number {
    return text.replace(URL_REGEX, 'x'.repeat(URL_LENGTH)).length;
}

function createThreadChunks(text: string, maxChars: number): string[] {
    if (mastodonLength(text) <= maxChars) return [text];

    const maxLength = maxChars - THREAD_SUFFIX_RESERVE;
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of text.split(/\s+/)) {
        if (!word) continue;
        const space = currentChunk ? ' ' : '';

        if (mastodonLength(currentChunk + space + word) <= maxLength) {
            currentChunk += space + word;
            continue;
        }

        if (currentChunk) chunks.push(currentChunk);
        currentChunk = word;

        // The word itself is longer than maxLength! Force split it.
        while (mastodonLength(currentChunk) > maxLength) {
            chunks.push(currentChunk.slice(0, maxLength));
            currentChunk = currentChunk.slice(maxLength);
        }
    }
    if (currentChunk) chunks.push(currentChunk);

    return chunks.map((chunk, index) => `${chunk} (${index + 1}/${chunks.length})`);
}

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.png':  return 'image/png';
        case '.gif':  return 'image/gif';
        case '.webp': return 'image/webp';
        case '.mp4':  return 'video/mp4';
        case '.mov':  return 'video/quicktime';
        case '.webm': return 'video/webm';
        default:      return 'application/octet-stream';
    }
}

function getApiError(error: unknown): string {
    const apiMessage = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
    if (apiMessage) return apiMessage;
    return error instanceof Error ? error.message : String(error);
}

/** Limits vary per server. A failed lookup is not fatal: fall back to Mastodon's defaults. */
export async function fetchInstanceLimits(instance: string): Promise<InstanceLimits> {
    try {
        const response = await axios.get(`${instance}/api/v2/instance`, { maxRedirects: 0, timeout: 10000 });
        const statuses = response.data?.configuration?.statuses;
        return {
            maxChars: Number.isSafeInteger(statuses?.max_characters) && statuses.max_characters >= 32 && statuses.max_characters <= 100000
                ? statuses.max_characters : DEFAULT_LIMITS.maxChars,
            maxMedia: Number.isSafeInteger(statuses?.max_media_attachments) && statuses.max_media_attachments >= 0 && statuses.max_media_attachments <= 50
                ? statuses.max_media_attachments : DEFAULT_LIMITS.maxMedia,
        };
    } catch (error: unknown) {
        Logger.warn('Mastodon: could not read instance limits, using defaults:', getApiError(error));
        return DEFAULT_LIMITS;
    }
}

async function waitForMediaProcessing(instance: string, mediaId: string, auth: AxiosRequestConfig): Promise<void> {
    for (let attempt = 0; attempt < MEDIA_POLL_ATTEMPTS; attempt++) {
        await new Promise(resolve => setTimeout(resolve, MEDIA_POLL_INTERVAL_MS));
        // 206 means the server is still processing the file.
        const response = await axios.get(`${instance}/api/v1/media/${encodeURIComponent(mediaId)}`, auth);
        if (response.status === 200) return;
    }
    throw new Error('Timed out waiting for Mastodon to process media');
}

async function uploadMedia(instance: string, filePath: string, auth: AxiosRequestConfig): Promise<string> {
    const formData = new FormData();
    formData.append('file', fs.readFileSync(filePath), {
        filename: path.basename(filePath),
        contentType: getMimeType(filePath),
    });

    const response = await axios.post(`${instance}/api/v2/media`, formData, {
        ...auth,
        headers: { ...auth.headers, ...formData.getHeaders() },
    });

    const mediaId = String(response.data.id);
    // Larger files return 202 and can't be attached until processing finishes.
    if (response.status === 202) await waitForMediaProcessing(instance, mediaId, auth);

    Logger.info(`Mastodon: media uploaded for ${path.basename(filePath)}`);
    return mediaId;
}

export async function shareToMastodon(instanceUrl: string, accessToken: string, postData: MastodonPostData, onPublished?: PublicationObserver): Promise<string> {
    const instance = normalizeMastodonInstance(instanceUrl);
    // Redirects are refused so the token can only ever reach the configured host.
    const auth: AxiosRequestConfig = {
        headers: { Authorization: `Bearer ${accessToken}` },
        maxRedirects: 0,
    };

    let published = 0;

    try {
        const limits = await fetchInstanceLimits(instance);

        // Handle both structured threads and single posts
        const threadPosts = postData.posts ? [...postData.posts] : [];
        if (threadPosts.length === 0) {
            const texts = Array.isArray(postData.text)
                ? postData.text.filter(t => t.trim())
                : createThreadChunks(postData.text, limits.maxChars);

            texts.forEach((txt, idx) => {
                threadPosts.push({
                    text: txt,
                    media: idx === 0 ? postData.media : undefined // Attach media to first post only for auto-split
                });
            });
        }

        let firstPostUrl = '';
        let parentId: string | undefined;

        for (let i = 0; i < threadPosts.length; i++) {
            const currentPost = threadPosts[i];

            // A failed upload aborts the post rather than publishing it without its images.
            if ((currentPost.media?.length || 0) > limits.maxMedia) throw new Error(`This instance accepts at most ${limits.maxMedia} attachments.`);
            const mediaIds: string[] = [];
            for (const filePath of (currentPost.media || []).slice(0, limits.maxMedia)) {
                mediaIds.push(await uploadMedia(instance, filePath, auth));
            }

            const body: Record<string, unknown> = { status: currentPost.text };
            if (mediaIds.length > 0) body.media_ids = mediaIds;
            if (parentId) body.in_reply_to_id = parentId;

            const response = await axios.post(`${instance}/api/v1/statuses`, body, auth);

            if (!response.data?.id) throw new Error('Mastodon returned no status ID; check your account before retrying.');
            parentId = String(response.data.id);
            if (i === 0) firstPostUrl = response.data.url || '';
            published++;
            onPublished?.({ id: parentId, url: response.data.url || undefined });

            Logger.info(`Mastodon: post ${i + 1}/${threadPosts.length} posted successfully (id: ${parentId})`);
        }

        return firstPostUrl;
    } catch (error: unknown) {
        const apiMessage = getApiError(error);
        Logger.error('Error posting to Mastodon:', apiMessage);
        // Earlier posts of a thread are already public, so say so rather than invite a duplicate retry.
        throw new Error(published > 0 ? `${apiMessage} (${published} post(s) of the thread were already published)` : apiMessage);
    }
}
