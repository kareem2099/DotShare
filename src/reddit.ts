import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { DEFAULT_SERVER_URL } from './constants';
import { Logger } from './utils/Logger';

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
                Logger.warn(`Skipping unsupported media format: ${ext}`);
                continue;
            }

            const stats = fs.statSync(mediaFile);
            const maxSizeBytes = supportedVideoExts.includes(ext) ? 128 * 1024 * 1024 : 20 * 1024 * 1024; // 128MB for video, 20MB for images

            if (stats.size > maxSizeBytes) {
                Logger.warn(`Media file too large: ${stats.size} bytes (max: ${maxSizeBytes})`);
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
                Logger.warn('Failed to get upload lease for', mediaFile);
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
            Logger.error(`Failed to upload media ${mediaFile}:`, error);
            // Continue with other media files
        }
    }

    return uploadedAssets;
}

export async function shareToReddit(accessToken: string, refreshToken: string | undefined, postData: RedditPostData): Promise<string> {
    try {
        // Use Python server API instead of direct Reddit API calls
        // ✅ 2. استخدام الثابت هنا
        const serverUrl = process.env.DOTSHARE_SERVER_URL || DEFAULT_SERVER_URL;

        // For Reddit, we need title, text, and subreddit
        const title = postData.title || postData.text.substring(0, 300);
        const text = postData.isSelfPost !== false ? postData.text : undefined;
        const subreddit = postData.subreddit || 'test';

        // Convert media files to data URLs
        const mediaUrls = postData.media ? postData.media.map(file => {
            if (fs.existsSync(file)) {
                const fileContent = fs.readFileSync(file);
                const ext = path.extname(file).toLowerCase();
                let mimeType = 'application/octet-stream';
                if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
                else if (ext === '.png') mimeType = 'image/png';
                else if (ext === '.gif') mimeType = 'image/gif';
                else if (ext === '.mp4') mimeType = 'video/mp4';
                return `data:${mimeType};base64,${fileContent.toString('base64')}`;
            }
            return file;
        }) : [];

        const response = await axios.post(`${serverUrl}/api/post/reddit`, {
            access_token: accessToken,
            subreddit: subreddit.replace(/^r\//, ''), // Remove r/ prefix if present
            title: title,
            text: text,
            media_urls: mediaUrls
        });

        if (response.data.success) {
            return 'posted'; // Return a dummy post ID for compatibility
        } else {
            throw new Error(response.data.error || 'Unknown error from server');
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('Error posting to Reddit:', errorMessage);
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
        Logger.error('Error refreshing Reddit token:', errorMessage);
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
        Logger.error('Error fetching Reddit subreddits:', error);
        return [];
    }
}

export async function validateRedditSubreddit(accessToken: string, subreddit: string): Promise<boolean> {
    try {
        // Validate input
        if (!subreddit || subreddit.trim() === '') {
            Logger.error('Error validating subreddit: subreddit name is empty');
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
            Logger.warn(`Subreddit validation failed: r/${cleanSubreddit} is not a valid subreddit`);
        }

        return isValid;
    } catch (error: unknown) {
        if (error instanceof axios.AxiosError) {
            if (error.response?.status === 401) {
                Logger.error('Error validating subreddit: Invalid access token (401)');
            } else if (error.response?.status === 403) {
                Logger.error(`Error validating subreddit: Access forbidden to r/${subreddit} (403)`);
            } else if (error.response?.status === 404) {
                Logger.warn(`Subreddit r/${subreddit} not found (404)`);
            } else {
                Logger.error(`Error validating subreddit: HTTP ${error.response?.status}`, error.message);
            }
        } else {
            Logger.error('Error validating subreddit:', error);
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
        Logger.error('Error validating Reddit user:', error);
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
        Logger.error('Error validating Reddit target:', error);
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
        Logger.error('Error fetching subreddit flairs:', error);
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
        Logger.error('Error fetching post details:', error);
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
        Logger.error('Error fetching subreddit rules:', error);
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
        Logger.error('Error fetching subreddit info:', error);
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
        Logger.error('Error fetching trending subreddits:', error);
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
                Logger.warn(`Failed to search related subreddits for term "${term}":`, searchError);
            }

            // Limit to 10 related subreddits
            if (uniqueRelated.length >= 10) break;
        }

        return uniqueRelated.slice(0, 10);
    } catch (error) {
        Logger.error('Error fetching related subreddits:', error);
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
        Logger.error('Error editing Reddit post:', errorMessage);
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
        Logger.error('Error deleting Reddit post:', errorMessage);
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
        Logger.error('Error fetching user posts:', error);
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