import axios from 'axios';
import { Logger } from '../utils/Logger';

export interface BlueSkyPostData {
    text: string;
    media?: string[];
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

export async function shareToBlueSky(identifier: string, password: string, postData: BlueSkyPostData): Promise<string> {
    try {
        // First, authenticate and get session
        const session = await authenticateBlueSky(identifier, password);

        const headers = {
            'Authorization': `Bearer ${session.accessJwt}`,
            'Content-Type': 'application/json'
        };

        const tweets = createThreadChunks(postData.text, 290);
        let firstPostUri = '';
        
        let rootPost: { uri: string; cid: string } | null = null;
        let parentPost: { uri: string; cid: string } | null = null;

        for (let i = 0; i < tweets.length; i++) {
            let chunkText = tweets[i];

            // For now, handle media URLs as text (since BlueSky media blobs are not fully implemented)
            if (i === 0 && postData.media && postData.media.length > 0) {
                for (const mediaFile of postData.media) {
                    Logger.info(`Media upload for BlueSky not fully implemented yet: ${mediaFile}`);
                    if (mediaFile.startsWith('http')) {
                        chunkText += `\n\n${mediaFile}`;
                    }
                }
            }

            const record: any = {
                text: chunkText,
                createdAt: new Date().toISOString(),
                $type: 'app.bsky.feed.post'
            };

            // Link to previous post in thread
            if (parentPost && rootPost) {
                record.reply = {
                    root: rootPost,
                    parent: parentPost
                };
            }

            const postPayload = {
                collection: 'app.bsky.feed.post',
                repo: session.did,
                record: record
            };

            const response = await axios.post(
                `https://bsky.social/xrpc/com.atproto.repo.createRecord`,
                postPayload,
                { headers }
            );

            const uri = response.data.uri;
            const cid = response.data.cid;

            if (i === 0) {
                firstPostUri = uri;
                rootPost = { uri, cid };
            }
            parentPost = { uri, cid };
            
            Logger.info(`BlueSky: post ${i + 1}/${tweets.length} posted successfully (uri: ${uri})`);
        }

        return firstPostUri; // AT URI of the created root post
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const axiosError = error as { response?: { data?: { message?: string } } };
        const apiMessage = axiosError.response?.data?.message;
        Logger.error('Error posting to BlueSky:', apiMessage || errorMessage);
        throw new Error(apiMessage || 'Failed to post to BlueSky');
    }
}

export async function authenticateBlueSky(identifier: string, password: string): Promise<{accessJwt: string, refreshJwt: string, did: string}> {
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

export async function refreshBlueSkySession(refreshToken: string): Promise<{accessJwt: string, refreshJwt: string, did: string}> {
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
