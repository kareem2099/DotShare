import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data'; // Required for Node.js
import { Logger } from '../utils/Logger';
import { TokenManager } from '../services/TokenManager';
import { AUTH_SERVER_URL } from '../services/TokenManager';

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
 * Upload a single media file to Twitter v1.1 media upload endpoint.
 */
async function uploadMediaToX(filePath: string, accessToken: string): Promise<string> {
    const fileBuffer = fs.readFileSync(filePath);
    const mime = getMimeType(filePath);
    const totalBytes = fileBuffer.length;

    // INIT
    const initRes = await axios.post(
        'https://upload.twitter.com/1.1/media/upload.json',
        new URLSearchParams({
            command: 'INIT',
            total_bytes: totalBytes.toString(),
            media_type: mime,
        }).toString(),
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        }
    );

    const mediaId: string = initRes.data.media_id_string;

    // APPEND (Node.js FormData fix)
    const formData = new FormData();
    formData.append('command', 'APPEND');
    formData.append('media_id', mediaId);
    formData.append('segment_index', '0');
    // Send the Buffer directly with file name and type defined
    formData.append('media', fileBuffer, {
        filename: path.basename(filePath),
        contentType: mime
    });

    await axios.post('https://upload.twitter.com/1.1/media/upload.json', formData, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...formData.getHeaders() // Required for Form boundaries
        },
    });

    // FINALIZE
    await axios.post(
        'https://upload.twitter.com/1.1/media/upload.json',
        new URLSearchParams({
            command: 'FINALIZE',
            media_id: mediaId,
        }).toString(),
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        }
    );

    return mediaId;
}

// ── Main exports ──────────────────────────────────────────────────────────────

export async function shareToX(
    _accessToken: string,
    _accessSecret: string,
    tweetData: TweetData
): Promise<string> {
    try {
        const accessToken = await TokenManager.getValidToken('x');
        if (!accessToken) throw new Error('X: not authenticated — connect your account in Settings.');

        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        };

        // Handle both structured threads and single posts
        const threadPosts = tweetData.posts || [];
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
                const mediaToUpload = currentPost.media.slice(0, 4);
                for (const filePath of mediaToUpload) {
                    if (fs.existsSync(filePath)) {
                        try {
                            const mediaId = await uploadMediaToX(filePath, accessToken);
                            mediaIds.push(mediaId);
                        } catch (uploadErr) {
                            Logger.error(`X: failed to upload media for ${filePath}:`, uploadErr);
                        }
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

            const tweetId: string = response.data.data.id;

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
        const response = await axios.post(`${AUTH_SERVER_URL}/api/auth/x/refresh`, {
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