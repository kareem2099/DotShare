import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data'; // Required for Node.js
import { Logger } from '../utils/Logger';

export interface TweetData {
    text: string;
    media?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.png':  return 'image/png';
        case '.gif':  return 'image/gif';
        case '.mp4':  return 'video/mp4';
        default:      return 'application/octet-stream';
    }
}

// Function to split long posts into Threads
function createThreadChunks(text: string, maxLength = 270): string[] {
    if (text.length <= 280) return [text];

    const words = text.split(' ');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of words) {
        if ((currentChunk + ' ' + word).length > maxLength) {
            chunks.push(currentChunk.trim());
            currentChunk = word;
        } else {
            currentChunk += (currentChunk ? ' ' : '') + word;
        }
    }
    if (currentChunk) chunks.push(currentChunk.trim());

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
    accessToken: string,
    _accessSecret: string,
    tweetData: TweetData
): Promise<string> {
    try {
        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        };

        // ── Upload media ──────────────────────────────────────────────────────
        const mediaIds: string[] = [];

        if (tweetData.media && tweetData.media.length > 0) {
            // Limit to 4 files since X allows max 4 media attachments per tweet
            const mediaToUpload = tweetData.media.slice(0, 4); 
            for (const filePath of mediaToUpload) {
                if (!fs.existsSync(filePath)) {
                    Logger.info(`X media file not found, skipping: ${filePath}`);
                    continue;
                }
                const mediaId = await uploadMediaToX(filePath, accessToken);
                mediaIds.push(mediaId);
            }
        }

        // ── Thread Splitting Logic ────────────────────────────────────────────
        const tweets = createThreadChunks(tweetData.text);
        let firstTweetId = '';
        let previousTweetId = '';

        // Loop through tweets and post them as a Thread
        for (let i = 0; i < tweets.length; i++) {
            const tweetPayload: any = {
                text: tweets[i],
            };

            // Link tweet to the previous one if this isn't the first
            if (previousTweetId) {
                tweetPayload.reply = { in_reply_to_tweet_id: previousTweetId };
            }

            // Add media only to the first tweet
            if (i === 0 && mediaIds.length > 0) {
                tweetPayload.media = { media_ids: mediaIds };
            }

            const response = await axios.post(
                'https://api.twitter.com/2/tweets',
                tweetPayload,
                { headers }
            );

            const tweetId: string = response.data.data.id;
            
            if (i === 0) firstTweetId = tweetId;
            previousTweetId = tweetId;

            Logger.info(`X: tweet ${i + 1}/${tweets.length} posted successfully (id: ${tweetId})`);
        }

        return firstTweetId; // Return the ID of the main tweet for user interaction

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