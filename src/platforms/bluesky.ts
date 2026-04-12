import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';

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

export async function shareToBlueSky(identifier: string, password: string, postData: BlueSkyPostData): Promise<string> {
    try {
        const session = await authenticateBlueSky(identifier, password);

        const headers = {
            'Authorization': `Bearer ${session.accessJwt}`,
            'Content-Type': 'application/json'
        };

        // Handle both structured threads and single posts
        const threadPosts = postData.posts || [];
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

        for (let i = 0; i < threadPosts.length; i++) {
            const currentPost = threadPosts[i];
            
            // 1. Upload media for THIS post
            const imageBlobs: BlobRef[] = [];
            if (currentPost.media && currentPost.media.length > 0) {
                const filesToUpload = currentPost.media.slice(0, 4).filter(f => fs.existsSync(f));
                for (const filePath of filesToUpload) {
                    try {
                        const blob = await uploadBlobToBluesky(filePath, session.accessJwt);
                        imageBlobs.push(blob);
                    } catch (uploadErr) {
                        Logger.error(`BlueSky: failed to upload blob for ${filePath}:`, uploadErr);
                    }
                }
            }

            // 2. Prepare post record
            const record: any = {
                text: currentPost.text,
                createdAt: new Date().toISOString(),
                $type: 'app.bsky.feed.post'
            };

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

            const uri: string = response.data.uri;
            const cid: string = response.data.cid;

            if (i === 0) {
                firstPostUri = uri;
                rootPost = { uri, cid };
            }
            parentPost = { uri, cid };

            Logger.info(`BlueSky: post ${i + 1}/${threadPosts.length} posted successfully (uri: ${uri})`);
        }

        return firstPostUri;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const axiosError = error as { response?: { data?: { message?: string } } };
        const apiMessage = axiosError.response?.data?.message;
        Logger.error('Error posting to BlueSky:', apiMessage || errorMessage);
        throw new Error(apiMessage || 'Failed to post to BlueSky');
    }
}

export async function authenticateBlueSky(identifier: string, password: string): Promise<{ accessJwt: string, refreshJwt: string, did: string }> {
    try {
        const response = await axios.post('https://bsky.social/xrpc/com.atproto.server.createSession', {
            identifier,
            password
        });

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
    } catch (error) {
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