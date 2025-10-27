import axios from 'axios';

export interface BlueSkyPostData {
    text: string;
    media?: string[];
}

export async function shareToBlueSky(identifier: string, password: string, postData: BlueSkyPostData): Promise<string> {
    try {
        // First, authenticate and get session
        const session = await authenticateBlueSky(identifier, password);

        const headers = {
            'Authorization': `Bearer ${session.accessJwt}`,
            'Content-Type': 'application/json'
        };

        const postPayload = {
            collection: 'app.bsky.feed.post',
            repo: session.did,
            record: {
                text: postData.text,
                createdAt: new Date().toISOString(),
                $type: 'app.bsky.feed.post'
            }
        };

        // Handle media attachments (BlueSky supports images)
        if (postData.media && postData.media.length > 0) {
            for (const mediaFile of postData.media) {
                // Note: This is simplified - actual implementation requires uploading blobs
                // BlueSky requires media to be uploaded as blobs first
                console.log(`Media upload for BlueSky not fully implemented yet: ${mediaFile}`);

                // For now, just add as external links if they're URLs
                if (mediaFile.startsWith('http')) {
                    // Could add as link card, but that requires separate API call
                    postPayload.record.text += `\n\n${mediaFile}`;
                }
            }
        }

        const response = await axios.post(
            `https://bsky.social/xrpc/com.atproto.repo.createRecord`,
            postPayload,
            { headers }
        );

        return response.data.uri; // AT URI of the created post
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const axiosError = error as { response?: { data?: { message?: string } } };
        const apiMessage = axiosError.response?.data?.message;
        console.error('Error posting to BlueSky:', apiMessage || errorMessage);
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
        console.error('Error authenticating with BlueSky:', apiMessage || errorMessage);
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
        console.error('Error refreshing BlueSky session:', error);
        throw new Error('Failed to refresh BlueSky session');
    }
}
