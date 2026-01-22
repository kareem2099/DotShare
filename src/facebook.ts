import axios from 'axios';
import { Logger } from './utils/Logger';

export interface FacebookPostData {
    text: string;
    media?: string[];
    pageId?: string; // For posting to Facebook pages
}

export async function shareToFacebook(accessToken: string, pageToken: string | null, postData: FacebookPostData): Promise<string> {
    try {
        let endpoint = 'https://graph.facebook.com/v18.0/me/feed';
        let token = accessToken;

        // If page token and page ID are provided, post to the page
        if (pageToken && postData.pageId) {
            endpoint = `https://graph.facebook.com/v18.0/${postData.pageId}/feed`;
            token = pageToken;
        }

        const headers = {
            'Content-Type': 'application/json'
        };

        const postPayload: Record<string, unknown> = {
            message: postData.text,
            access_token: token
        };

        // Add media if provided
        if (postData.media && postData.media.length > 0) {
            // Note: This is simplified - Facebook media posting requires uploading to their servers first
            // For now, we'll just include the text. Full implementation would require media upload API
            Logger.info('Media upload for Facebook not fully implemented yet - posting text only');
        }

        const response = await axios.post(endpoint, postPayload, { headers });

        return response.data.id;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const axiosError = error as { response?: { data?: { error?: { message?: string } } } };
        const apiMessage = axiosError.response?.data?.error?.message;
        Logger.error('Error posting to Facebook:', apiMessage || errorMessage);
        throw new Error(apiMessage || 'Failed to post to Facebook');
    }
}

export async function validateFacebookCredentials(accessToken: string): Promise<boolean> {
    try {
        const response = await axios.get(`https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${accessToken}`);
        return !!response.data.id;
    } catch (error) {
        return false;
    }
}

export async function getFacebookPages(accessToken: string): Promise<Array<{id: string, name: string}>> {
    try {
        const response = await axios.get(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`);
        return response.data.data.map((page: { id: string; name: string }) => ({
            id: page.id,
            name: page.name
        }));
    } catch (error) {
        Logger.error('Error fetching Facebook pages:', error);
        return [];
    }
}
