import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data'; // Required for Node.js
import { Logger } from '../utils/Logger';
import { TokenManager } from '../services/TokenManager';
import { DOTSUITE_CONNECT_URL } from '../constants';
import { PublicationObserver } from './runtime';

export interface TweetData {
    text: string | string[];  // string[] = pre-split thread chunks from UI
    media?: string[];
    posts?: Array<{ text: string; media?: string[] }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.png': return 'image/png';
        case '.gif': return 'image/gif';
        case '.mp4': return 'video/mp4';
        case '.mov': return 'video/quicktime';
        default: return 'application/octet-stream';
    }
}

// Function to split long posts into Threads
function createThreadChunks(text: string, maxLength = 270): string[] {
    if (text.length <= 280) return [text];

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

/**
 * Upload one media file: images in a single request, videos and GIFs in chunks.
 */
async function uploadMediaToX(filePath: string, accessToken: string): Promise<string> {
    const fileBuffer = fs.readFileSync(filePath);
    const mime = getMimeType(filePath);
    if (mime.startsWith('image/') && mime !== 'image/gif') {
        const form = new FormData();
        form.append('media', fileBuffer, { filename: path.basename(filePath), contentType: mime });
        form.append('media_category', 'tweet_image');
        const response = await axios.post('https://api.x.com/2/media/upload', form, {
            headers: { Authorization: `Bearer ${accessToken}`, ...form.getHeaders() },
        });
        const id = response.data?.data?.id;
        if (!id) throw new Error('X returned no uploaded media ID.');
        return String(id);
    }

    return uploadChunkedToX(fileBuffer, filePath, mime, accessToken);
}

const X_UPLOAD = 'https://api.x.com/2/media/upload';
// X asks for segments of at most 5 MB.
const X_CHUNK_BYTES = 4 * 1024 * 1024;
const X_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Videos and GIFs use X's v2 chunked upload (initialize → append → finalize),
 * then wait until X finishes processing before the media can be attached.
 */
async function uploadChunkedToX(bytes: Buffer, filePath: string, mime: string, accessToken: string): Promise<string> {
    const auth = { Authorization: `Bearer ${accessToken}` };
    const category = mime === 'image/gif' ? 'tweet_gif' : 'tweet_video';
    const init = await axios.post(`${X_UPLOAD}/initialize`, { media_type: mime, total_bytes: bytes.length, media_category: category },
        { headers: { ...auth, 'Content-Type': 'application/json' } });
    const mediaId = init.data?.data?.id;
    if (!mediaId) throw new Error('X returned no media ID for the upload.');
    const id = String(mediaId);

    for (let offset = 0, segment = 0; offset < bytes.length; offset += X_CHUNK_BYTES, segment++) {
        const form = new FormData();
        form.append('segment_index', String(segment));
        form.append('media', bytes.subarray(offset, offset + X_CHUNK_BYTES), { filename: path.basename(filePath), contentType: mime });
        await axios.post(`${X_UPLOAD}/${encodeURIComponent(id)}/append`, form, {
            headers: { ...auth, ...form.getHeaders() }, maxBodyLength: Infinity, maxContentLength: Infinity,
        });
    }

    const finalized = await axios.post(`${X_UPLOAD}/${encodeURIComponent(id)}/finalize`, undefined, { headers: auth });
    let processing = finalized.data?.data?.processing_info as { state?: string; check_after_secs?: number } | undefined;
    const deadline = Date.now() + X_PROCESSING_TIMEOUT_MS;
    while (processing && processing.state !== 'succeeded') {
        if (processing.state === 'failed') throw new Error(`X could not process ${path.basename(filePath)}. Check its format, length and size.`);
        if (Date.now() > deadline) throw new Error('Timed out waiting for X to process the video.');
        const wait = Math.min(Math.max(Number(processing.check_after_secs) || 2, 1), 30);
        await new Promise(resolve => setTimeout(resolve, wait * 1000));
        const status = await axios.get(X_UPLOAD, { params: { command: 'STATUS', media_id: id }, headers: auth });
        processing = status.data?.data?.processing_info;
    }
    return id;
}

// ── Main exports ──────────────────────────────────────────────────────────────

export async function shareToX(
    _accessToken: string,
    _accessSecret: string,
    tweetData: TweetData,
    options?: { tokenProvider?: () => Promise<string>; onPublished?: PublicationObserver }
): Promise<string> {
    try {
        const accessToken = await (options?.tokenProvider ? options.tokenProvider() : TokenManager.getValidToken('x'));
        if (!accessToken) throw new Error('X: not authenticated — connect your account in Settings.');

        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        };

        // Handle both structured threads and single posts
        const threadPosts = [...(tweetData.posts || [])];
        if (threadPosts.length === 0) {
            // Convert single post to thread structure for unified processing
            const texts = Array.isArray(tweetData.text)
                ? tweetData.text.filter(t => t.trim())
                : createThreadChunks(tweetData.text);
            
            texts.forEach((txt, idx) => {
                threadPosts.push({
                    text: txt,
                    media: idx === 0 ? tweetData.media : undefined // Attach media to first tweet only for auto-split
                });
            });
        }

        let firstTweetId = '';
        let previousTweetId = '';

        // Loop through tweets and post them as a Thread
        for (let i = 0; i < threadPosts.length; i++) {
            const currentPost = threadPosts[i];
            
            // 1. Upload media for THIS tweet
            const mediaIds: string[] = [];
            if (currentPost.media && currentPost.media.length > 0) {
                if (currentPost.media.length > 4) throw new Error('X supports at most 4 images per post.');
                const moving = currentPost.media.filter(file => ['.mp4', '.mov', '.gif'].includes(path.extname(file).toLowerCase()));
                if (moving.length && currentPost.media.length > 1) throw new Error('An X post can have one video or GIF, or up to 4 images, not both.');
                const mediaToUpload = currentPost.media;
                for (const filePath of mediaToUpload) {
                    if (fs.existsSync(filePath)) {
                        try {
                            const mediaId = await uploadMediaToX(filePath, accessToken);
                            mediaIds.push(mediaId);
                        } catch (uploadErr) {
                            Logger.error(`X: failed to upload media for ${path.basename(filePath)}:`, uploadErr);
                            throw new Error(`X media upload failed for ${path.basename(filePath)}`);
                        }
                    } else {
                        throw new Error(`X media file not found: ${path.basename(filePath)}`);
                    }
                }
            }

            // 2. Prepare tweet payload
            const tweetPayload: Record<string, unknown> = {
                text: currentPost.text,
            };

            // 3. Attach media IDs if they exist
            if (mediaIds.length > 0) {
                tweetPayload.media = { media_ids: mediaIds };
            }

            // 4. Link tweet to the previous one
            if (previousTweetId) {
                tweetPayload.reply = { in_reply_to_tweet_id: previousTweetId };
            }

            // 5. Submit tweet
            const response = await axios.post(
                'https://api.twitter.com/2/tweets',
                tweetPayload,
                { headers }
            );

            const tweetId: string = response.data?.data?.id;
            if (!tweetId) throw new Error('X returned no post ID; check your account before retrying.');
            options?.onPublished?.({ id: tweetId, url: `https://x.com/i/status/${tweetId}` });

            if (i === 0) firstTweetId = tweetId;
            previousTweetId = tweetId;

            Logger.info(`X: tweet ${i + 1}/${threadPosts.length} posted successfully (id: ${tweetId})`);
        }

        return firstTweetId;

    } catch (error: unknown) {
        const msg = axios.isAxiosError(error)
            ? (error.response?.data?.detail || error.response?.data?.title || error.message)
            : error instanceof Error ? error.message : String(error);

        Logger.error('Error posting to X:', msg);
        throw new Error(`Failed to post to X: ${msg}`);
    }
}

export async function validateXCredentials(accessToken: string): Promise<boolean> {
    try {
        await axios.get(
            'https://api.twitter.com/2/users/me?user.fields=id,name,username',
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return true;
    } catch {
        return false;
    }
}

export async function refreshXToken(refreshToken: string): Promise<{ access_token: string, refresh_token?: string, expires_in?: number }> {
    try {
        const response = await axios.post(`${DOTSUITE_CONNECT_URL}/refresh/x`, {
            refreshToken
        });
        return response.data;
    } catch (error: unknown) {
        const errorMessage = axios.isAxiosError(error)
            ? (error.response?.data?.error || error.message)
            : error instanceof Error ? error.message : String(error);

        Logger.error('Error refreshing X token:', errorMessage);
        throw new Error(`Failed to refresh X token: ${errorMessage}`);
    }
}