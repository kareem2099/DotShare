import axios from 'axios';

export interface TweetData {
    text: string;
    media?: string[];
}

export async function shareToX(_accessToken: string, _accessSecret: string, tweetData: TweetData): Promise<string> {
    try {
        // Twitter API v2 uses OAuth 2.0, but for simplicity we'll assume bearer token for now
        // In production, you'd want proper OAuth implementation
        const apiKey = process.env.TWITTER_API_KEY || '';
        const apiSecret = process.env.TWITTER_API_SECRET || '';
        const bearerToken = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const headers = {
            'Authorization': `Bearer ${bearerToken}`,
            'Content-Type': 'application/json'
        };

        const tweetPayload: Record<string, unknown> = {
            text: tweetData.text
        };

        // Add media if provided
        if (tweetData.media && tweetData.media.length > 0) {
            // Note: This is simplified - actual media upload requires multiple API calls
            // Upload media first, then attach to tweet
            console.log('Media upload for Twitter not fully implemented yet');
        }

        const response = await axios.post('https://api.twitter.com/2/tweets', tweetPayload, { headers });

        return response.data.data.id;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error posting to Twitter/X:', errorMessage);
        throw new Error('Failed to post to Twitter/X');
    }
}

export async function validateXCredentials(): Promise<boolean> {
    try {
        // Basic validation by attempting to get user info
        const apiKey = process.env.TWITTER_API_KEY || '';
        const bearerToken = Buffer.from(`${apiKey}:${process.env.TWITTER_API_SECRET || ''}`).toString('base64');

        const headers = {
            'Authorization': `Bearer ${bearerToken}`,
            'Content-Type': 'application/json'
        };

        await axios.get(`https://api.twitter.com/2/users/me?user.fields=id,name,username`, { headers });
        return true;
    } catch (error) {
        return false;
    }
}
