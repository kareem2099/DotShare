import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';

export interface RedditPostData {
    text: string;
    media?: string[];
    subreddit: string;
    title?: string; // For link posts, title is required
    flairId?: string; // Optional flair ID
    isSelfPost?: boolean; // Whether this is a self-post or link post
    spoiler?: boolean; // Mark post as spoiler
}

interface RedditSubredditData {
    display_name: string;
    display_name_prefixed: string;
    subscribers?: number;
}

interface RedditPostListingData {
    name: string; // Fullname like t3_xyz123
    title: string;
    subreddit: string;
    score: number;
    permalink: string;
    created_utc: number;
}

export async function uploadRedditMedia(accessToken: string, mediaFiles: string[]): Promise<string[]> {
    const uploadedAssets: string[] = [];

    for (const mediaFile of mediaFiles) {
        try {
            // Check file extension and size
            const ext = path.extname(mediaFile).toLowerCase();
            const supportedImageExts = ['.jpg', '.jpeg', '.png', '.gif'];
            const supportedVideoExts = ['.mp4', '.webm', '.gifv'];

            if (!supportedImageExts.includes(ext) && !supportedVideoExts.includes(ext)) {
                console.warn(`Skipping unsupported media format: ${ext}`);
                continue;
            }

            const stats = fs.statSync(mediaFile);
            const maxSizeBytes = supportedVideoExts.includes(ext) ? 128 * 1024 * 1024 : 20 * 1024 * 1024; // 128MB for video, 20MB for images

            if (stats.size > maxSizeBytes) {
                console.warn(`Media file too large: ${stats.size} bytes (max: ${maxSizeBytes})`);
                continue;
            }

            // Request upload lease
            const leaseResponse = await axios.post('https://oauth.reddit.com/api/v1/me/upload.json', {
                filepath: path.basename(mediaFile),
                mimetype: supportedVideoExts.includes(ext)
                    ? (ext === '.webm' ? 'video/webm' : 'video/mp4')
                    : 'image/jpeg' // Reddit determines actual type from upload
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'User-Agent': 'DotShare/1.0'
                }
            });

            const { args } = leaseResponse.data;
            if (!args) {
                console.warn('Failed to get upload lease for', mediaFile);
                continue;
            }

            // Parse form data and upload to S3
            const formData = new FormData();
            Object.entries(args.fields).forEach(([key, value]) => {
                formData.append(key, value as string);
            });
            formData.append('file', fs.createReadStream(mediaFile));

            await axios.post(args.action, formData, {
                headers: formData.getHeaders(),
                timeout: 60000 // 60 second timeout for uploads
            });

            uploadedAssets.push(args.fields.key); // key is the asset identifier
        } catch (error) {
            console.error(`Failed to upload media ${mediaFile}:`, error);
            // Continue with other media files
        }
    }

    return uploadedAssets;
}

export async function shareToReddit(accessToken: string, refreshToken: string | undefined, postData: RedditPostData): Promise<string> {
    try {
        // Validate required fields first
        if (!postData.subreddit || postData.subreddit.trim() === '') {
            throw new Error('Reddit subreddit is required');
        }

        // Clean the subreddit name - remove r/ prefix if present
        let cleanSubreddit = postData.subreddit.trim();
        if (cleanSubreddit.startsWith('r/')) {
            cleanSubreddit = cleanSubreddit.substring(2);
        }
        if (cleanSubreddit === '') {
            throw new Error('Reddit subreddit cannot be empty');
        }

        // For Reddit script apps, the access token is permanent and doesn't need refreshing
        // If refreshToken is provided, try to refresh, otherwise use the access token directly
        let currentToken = accessToken;
        if (refreshToken) {
            try {
                const tokenData = await refreshRedditToken(refreshToken);
                currentToken = tokenData.access_token;
            } catch (error) {
                // If refresh fails, use the original access token (likely script app)
                console.warn('Failed to refresh Reddit token, using original access token:', error);
            }
        }

        // Validate token before proceeding
        const isValidToken = await validateRedditCredentials(currentToken);
        if (!isValidToken) {
            throw new Error('Invalid or expired Reddit access token. Please refresh your credentials.');
        }

        const headers = {
            'Authorization': `Bearer ${currentToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'DotShare/1.0' // Reddit requires a user agent
        };

        // Upload media if present
        let uploadedMediaAssets: string[] = [];
        if (postData.media && postData.media.length > 0) {
            uploadedMediaAssets = await uploadRedditMedia(currentToken, postData.media);
        }

        // Determine if this is a user profile (u/) or subreddit (r/)
        const isUserProfile = cleanSubreddit.startsWith('u/');
        const targetName = isUserProfile ? cleanSubreddit.substring(2) : cleanSubreddit;

        const postPayload: Record<string, unknown> = {
            sr: isUserProfile ? `u_${targetName}` : targetName,
            kind: uploadedMediaAssets.length > 0 ? 'image' : (postData.isSelfPost !== false ? 'self' : 'link'),
            title: postData.title || postData.text.substring(0, 300), // Use first 300 chars as title if not provided
            text: (uploadedMediaAssets.length === 0 && postData.isSelfPost !== false) ? postData.text : undefined,
            url: (uploadedMediaAssets.length === 0 && postData.isSelfPost === false) ? postData.media?.[0] : undefined // For link posts, use first media as URL
        };

        // Add media asset if uploaded
        if (uploadedMediaAssets.length > 0) {
            if (uploadedMediaAssets.length === 1) {
                postPayload.kind = 'image';
                postPayload.url = uploadedMediaAssets[0];
            } else {
                // Gallery post for multiple images
                postPayload.kind = 'gallery';
                postPayload.items = uploadedMediaAssets.map((asset, index) => ({ media_id: asset, caption: `Image ${index + 1}` }));
            }
        }

        // Validate target (subreddit or user profile) before posting
        const isValidTarget = await validateRedditTarget(currentToken, cleanSubreddit);
        if (!isValidTarget) {
            const targetType = isUserProfile ? 'u' : 'r';
            throw new Error(`Invalid Reddit target: ${targetType}/${targetName}`);
        }

        // Additional validation for subreddits
        if (!isUserProfile) {
            const subredditInfo = await getRedditSubredditInfo(currentToken, cleanSubreddit);
            if (subredditInfo) {
                if (subredditInfo.restrict_posting) {
                    throw new Error(`Posting is restricted in r/${cleanSubreddit}`);
                }
                if (subredditInfo.quarantine) {
                    throw new Error(`r/${cleanSubreddit} is quarantined. You may need to favorite it first in the Reddit app.`);
                }
            }
        }

        // Add optional fields
        if (postData.spoiler) postPayload.spoiler = true;
        if (postData.flairId) postPayload.flair_id = postData.flairId;

        // Retry logic for API failures
        let retries = 3;
        while (retries > 0) {
            try {
                const response = await axios.post('https://oauth.reddit.com/api/submit', postPayload, {
                    headers,
                    timeout: 30000
                });

                if (response.data.success) {
                    const postId = response.data.data.name;
                    console.log('Successfully posted to Reddit:', postId);
                    return postId;
                } else {
                    // Handle specific Reddit error formats

                    // Check for jQuery array format (common when Reddit returns error pages)
                    if (response.data.jquery && Array.isArray(response.data.jquery)) {
                        console.error('Reddit API returned jQuery error response:', response.data);

                        // Try to find error message in jQuery array
                        const jQueryData = response.data.jquery;
                        for (const item of jQueryData) {
                            if (Array.isArray(item) && item[0] === 'show-error') {
                                // Extract error message from show-error command
                                const errorMessage = item[1];
                                throw new Error(`Reddit API error: ${errorMessage}`);
                            }
                        }

                        // Look for common error patterns in jQuery data
                        const errorText = jQueryData.find((item: unknown) =>
                            typeof item === 'string' &&
                            (item.toLowerCase().includes('error') || item.toLowerCase().includes('invalid') || item.toLowerCase().includes('forbidden'))
                        );
                        if (errorText) {
                            throw new Error(`Reddit API error: ${errorText}`);
                        }
                    }

                    // Handle standard errors array
                    const errors = response.data.errors || [];
                    if (errors.length > 0) {
                        const errorMessage = Array.isArray(errors[0]) ? errors[0][1] : String(errors[0]);
                        throw new Error(`Reddit API error: ${errorMessage}`);
                    }

                    // Check for other common error fields
                    if (response.data.data && response.data.data.children && response.data.data.children.length > 0) {
                        const errorData = response.data.data.children[0].data;
                        if (errorData && errorData.error) {
                            throw new Error(`Reddit API error: ${errorData.error}`);
                        }
                    }

                    // Generic fallback with detailed logging
                    console.error('Full Reddit API response:', response);
                    console.error('Response data:', response.data);
                    console.error('Response status:', response.status);
                    throw new Error('Reddit API submission failed - post was not created. Check the console for detailed response data.');
                }
            } catch (error: unknown) {
                retries--;
                const errorMessage = error instanceof Error ? error.message : String(error);

                if (retries === 0) {
                    throw error;
                }

                // Check if it's a rate limit error
                if (error instanceof axios.AxiosError && error.response?.status === 429) {
                    const retryAfter = parseInt(error.response.headers['retry-after'] || '60', 10);
                    console.warn(`Reddit rate limited, retrying in ${retryAfter} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                } else {
                    // For other errors, wait 5 seconds before retry
                    console.warn(`Reddit API error (${errorMessage}), retrying in 5 seconds... (${retries} retries left)`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }

        throw new Error('Failed to post to Reddit after retries');
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error posting to Reddit:', errorMessage);
        throw new Error('Failed to post to Reddit');
    }
}

export async function refreshRedditToken(
    refreshToken: string,
    clientId?: string,
    clientSecret?: string
): Promise<{access_token: string, expires_in: number}> {
    try {
        // Use provided credentials or fall back to environment variables
        const finalClientId = clientId || process.env.REDDIT_CLIENT_ID || '';
        const finalClientSecret = clientSecret || process.env.REDDIT_CLIENT_SECRET || '';

        if (!finalClientId || !finalClientSecret) {
            throw new Error('Reddit client ID and client secret are required. Provide them as parameters or set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables.');
        }

        const auth = Buffer.from(`${finalClientId}:${finalClientSecret}`).toString('base64');
        const headers = {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'DotShare/1.0'
        };

        const data = new URLSearchParams();
        data.append('grant_type', 'refresh_token');
        data.append('refresh_token', refreshToken);

        const response = await axios.post('https://www.reddit.com/api/v1/access_token', data, { headers });
        return response.data;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error refreshing Reddit token:', errorMessage);
        throw new Error('Failed to refresh Reddit access token');
    }
}

export async function validateRedditCredentials(accessToken: string): Promise<boolean> {
    try {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'DotShare/1.0'
        };

        const response = await axios.get('https://oauth.reddit.com/api/v1/me', { headers });
        return !!response.data.name;
    } catch (error) {
        return false;
    }
}

export async function getRedditSubreddits(accessToken: string, query?: string): Promise<Array<{display_name: string, display_name_prefixed: string}>> {
    try {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'DotShare/1.0'
        };

        const endpoint = query
            ? `https://oauth.reddit.com/api/search_subreddits?query=${encodeURIComponent(query)}`
            : 'https://oauth.reddit.com/subreddits/mine/subscriber?limit=10';

        const response = await axios.get(endpoint, { headers });
        return response.data.data?.children?.map((sub: Record<string, unknown>) => ({
            display_name: (sub.data as Record<string, unknown>).display_name as string,
            display_name_prefixed: (sub.data as Record<string, unknown>).display_name_prefixed as string
        })) || [];
    } catch (error) {
        console.error('Error fetching Reddit subreddits:', error);
        return [];
    }
}

export async function validateRedditSubreddit(accessToken: string, subreddit: string): Promise<boolean> {
    try {
        // Validate input
        if (!subreddit || subreddit.trim() === '') {
            console.error('Error validating subreddit: subreddit name is empty');
            return false;
        }

        const cleanSubreddit = subreddit.trim();

        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'DotShare/1.0'
        };

        const response = await axios.get(`https://oauth.reddit.com/r/${cleanSubreddit}/about.json`, { headers });
        const isValid = !!(response.data && response.data.kind === 't5'); // t5 is subreddit kind

        if (!isValid) {
            console.warn(`Subreddit validation failed: r/${cleanSubreddit} is not a valid subreddit`);
        }

        return isValid;
    } catch (error: unknown) {
        if (error instanceof axios.AxiosError) {
            if (error.response?.status === 401) {
                console.error('Error validating subreddit: Invalid access token (401)');
            } else if (error.response?.status === 403) {
                console.error(`Error validating subreddit: Access forbidden to r/${subreddit} (403)`);
            } else if (error.response?.status === 404) {
                console.warn(`Subreddit r/${subreddit} not found (404)`);
            } else {
                console.error(`Error validating subreddit: HTTP ${error.response?.status}`, error.message);
            }
        } else {
            console.error('Error validating subreddit:', error);
        }
        return false;
    }
}

export async function validateRedditUser(accessToken: string, username: string): Promise<boolean> {
    try {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'DotShare/1.0'
        };

        const response = await axios.get(`https://oauth.reddit.com/user/${username}/about.json`, { headers });
        return !!(response.data && response.data.kind === 't2'); // t2 is user kind
    } catch (error) {
        console.error('Error validating Reddit user:', error);
        return false;
    }
}

export async function validateRedditTarget(accessToken: string, target: string): Promise<boolean> {
    try {
        if (target.startsWith('u/')) {
            // Validate user profile
            const username = target.substring(2);
            return await validateRedditUser(accessToken, username);
        } else if (target.startsWith('r/')) {
            // Validate subreddit with r/ prefix
            const subredditName = target.substring(2);
            return await validateRedditSubreddit(accessToken, subredditName);
        } else {
            // Assume plain subreddit name
            return await validateRedditSubreddit(accessToken, target);
        }
    } catch (error) {
        console.error('Error validating Reddit target:', error);
        return false;
    }
}

export async function getRedditFlairs(accessToken: string, subreddit: string): Promise<Array<{id: string, text: string}>> {
    try {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'DotShare/1.0'
        };

        const response = await axios.get(`https://oauth.reddit.com/r/${subreddit}/api/link_flair_v2`, { headers });
        return response.data || [];
    } catch (error) {
        console.error('Error fetching subreddit flairs:', error);
        return [];
    }
}

export async function getRedditPostDetails(accessToken: string, postId: string): Promise<{score: number, num_comments: number, permalink: string} | null> {
    try {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'DotShare/1.0'
        };

        const response = await axios.get(`https://oauth.reddit.com/by_id/${postId}`, { headers });
        const post = response.data.data.children[0].data;
        return {
            score: post.score,
            num_comments: post.num_comments,
            permalink: post.permalink
        };
    } catch (error) {
        console.error('Error fetching post details:', error);
        return null;
    }
}

interface RedditRule {
    short_name: string;
    description: string;
    violation_reason?: string;
}

export async function getRedditSubredditRules(accessToken: string, subreddit: string): Promise<RedditRule[]> {
    try {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'DotShare/1.0'
        };

        const response = await axios.get(`https://oauth.reddit.com/r/${subreddit}/about/rules.json`, { headers });
        const rules = response.data.rules || [];

        return rules.map((rule: RedditRule) => ({
            short_name: rule.short_name,
            description: rule.description,
            violation_reason: rule.violation_reason
        }));
    } catch (error) {
        console.error('Error fetching subreddit rules:', error);
        return [];
    }
}

export async function getRedditSubredditInfo(accessToken: string, subreddit: string): Promise<{
    display_name: string;
    display_name_prefixed: string;
    public_description: string;
    subscribers: number;
    accounts_active: number;
    created_utc: number;
    over18: boolean;
    restrict_posting: boolean;
    quarantine: boolean;
    banner_img?: string;
    community_icon?: string;
    subreddit_type: 'public' | 'private' | 'restricted' | 'gold_only' | 'archived' | 'employees_only' | 'gold_restricted';
    lang: string;
} | null> {
    try {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'DotShare/1.0'
        };

        const response = await axios.get(`https://oauth.reddit.com/r/${subreddit}/about.json`, { headers });
        const data = response.data.data;

        return {
            display_name: data.display_name,
            display_name_prefixed: data.display_name_prefixed,
            public_description: data.public_description || '',
            subscribers: data.subscribers || 0,
            accounts_active: data.accounts_active || 0,
            created_utc: data.created_utc,
            over18: data.over18 || false,
            restrict_posting: data.restrict_posting || false,
            quarantine: data.quarantine || false,
            banner_img: data.banner_img,
            community_icon: data.community_icon,
            subreddit_type: data.subreddit_type || 'public',
            lang: data.lang || 'en'
        };
    } catch (error) {
        console.error('Error fetching subreddit info:', error);
        return null;
    }
}

export async function getRedditTrendingSubreddits(accessToken: string, limit = 25): Promise<Array<{display_name: string, display_name_prefixed: string, subscribers: number}>> {
    try {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'DotShare/1.0'
        };

        // Reddit provides trending subreddits through various endpoints
        // We'll use the popular subreddits endpoint with sorting
        const response = await axios.get(`https://oauth.reddit.com/subreddits/popular?limit=${limit}&sort=hot`, { headers });
        return response.data.data.children.map((sub: { data: RedditSubredditData }) => ({
            display_name: sub.data.display_name,
            display_name_prefixed: sub.data.display_name_prefixed,
            subscribers: sub.data.subscribers || 0
        }));
    } catch (error) {
        console.error('Error fetching trending subreddits:', error);
        return [];
    }
}

export async function getRelatedSubreddits(accessToken: string, subreddit: string): Promise<Array<{display_name: string, display_name_prefixed: string}>> {
    try {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'DotShare/1.0'
        };

        // Get subreddit info and search for similar subreddits based on keywords
        const subredditInfo = await getRedditSubredditInfo(accessToken, subreddit);
        if (!subredditInfo) return [];

        // Search for subreddits based on the current subreddit's name and description keywords
        const searchTerms = [
            subredditInfo.display_name,
            ...(subredditInfo.public_description ? subredditInfo.public_description.split(' ').slice(0, 3) : [])
        ];

        const uniqueRelated: Array<{display_name: string, display_name_prefixed: string}> = [];

        for (const term of searchTerms.slice(0, 2)) { // Limit to 2 search terms to avoid rate limits
            if (term.length < 3) continue; // Skip very short terms

            try {
                const searchResponse = await axios.get(
                    `https://oauth.reddit.com/api/search_subreddits?query=${encodeURIComponent(term)}&limit=5`,
                    { headers }
                );

                const results = searchResponse.data?.subreddits || [];
                for (const result of results) {
                    if (!uniqueRelated.find(r => r.display_name === result.name) &&
                        result.name.toLowerCase() !== subreddit.toLowerCase()) {
                        uniqueRelated.push({
                            display_name: result.name,
                            display_name_prefixed: `r/${result.name}`
                        });
                    }
                }
            } catch (searchError) {
                // Continue with next term if one fails
                console.warn(`Failed to search related subreddits for term "${term}":`, searchError);
            }

            // Limit to 10 related subreddits
            if (uniqueRelated.length >= 10) break;
        }

        return uniqueRelated.slice(0, 10);
    } catch (error) {
        console.error('Error fetching related subreddits:', error);
        return [];
    }
}

/**
 * Helper function for developers to generate Reddit access token and refresh token
 * @param clientId Reddit app client ID
 * @param clientSecret Reddit app client secret
 * @param username Reddit username
 * @param password Reddit password
 * @returns Promise<{access_token: string, refresh_token: string, expires_in: number}>
 */
export async function editRedditPost(accessToken: string, postId: string, newText: string): Promise<boolean> {
    try {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'DotShare/1.0'
        };

        const data = new URLSearchParams();
        data.append('api_type', 'json');
        data.append('thing_id', postId);
        data.append('text', newText);

        const response = await axios.post('https://oauth.reddit.com/api/editusertext', data, { headers });

        if (response.data.errors && response.data.errors.length > 0) {
            throw new Error(`Reddit API edit error: ${response.data.errors.join(', ')}`);
        }

        return true;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error editing Reddit post:', errorMessage);
        throw new Error('Failed to edit Reddit post');
    }
}

export async function deleteRedditPost(accessToken: string, postId: string): Promise<boolean> {
    try {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'DotShare/1.0'
        };

        const data = new URLSearchParams();
        data.append('api_type', 'json');
        data.append('id', postId);

        const response = await axios.post('https://oauth.reddit.com/api/del', data, { headers });

        if (response.data.errors && response.data.errors.length > 0) {
            throw new Error(`Reddit API delete error: ${response.data.errors.join(', ')}`);
        }

        return true;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error deleting Reddit post:', errorMessage);
        throw new Error('Failed to delete Reddit post');
    }
}

export async function getRedditUserPosts(accessToken: string, username?: string, limit = 10): Promise<Array<{id: string, title: string, subreddit: string, score: number, permalink: string, created: number}>> {
    try {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'DotShare/1.0'
        };

        const targetUsername = username || 'me'; // 'me' for current user
        const response = await axios.get(`https://oauth.reddit.com/user/${targetUsername}/submitted?sort=new&limit=${limit}`, { headers });

        return response.data.data.children.map((post: { data: RedditPostListingData }) => ({
            id: post.data.name, // Fullname like t3_xyz123
            title: post.data.title,
            subreddit: post.data.subreddit,
            score: post.data.score,
            permalink: post.data.permalink,
            created: post.data.created_utc
        }));
    } catch (error: unknown) {
        console.error('Error fetching user posts:', error);
        return [];
    }
}

export async function generateRedditTokens(
    clientId: string,
    clientSecret: string,
    username: string,
    password: string
): Promise<{access_token: string, refresh_token?: string, expires_in?: number}> {
    try {
        // Encode credentials in base64 for Basic Auth
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const headers = {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'DotShare/1.0'
        };

        const data = new URLSearchParams();
        data.append('grant_type', 'password'); // Reddit script apps can use password grant
        data.append('username', username);
        data.append('password', password);

        const response = await axios.post('https://www.reddit.com/api/v1/access_token', data, { headers });

        if (response.data.error) {
            throw new Error(`Reddit OAuth error: ${response.data.error}`);
        }

        return {
            access_token: response.data.access_token,
            refresh_token: response.data.refresh_token,
            expires_in: response.data.expires_in
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate Reddit tokens: ${errorMessage}`);
    }
}
