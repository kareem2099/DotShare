import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { Logger } from '../utils/Logger';
import { TokenManager } from '../services/TokenManager';

export interface RedditPostData {
    text: string;
    media?: string[];
    subreddit: string; // Can be r/subredditname or u/username
    title?: string;
    flair?: string; // v3.1.0: consistent name with UI
    postType?: string; // 'link' | 'self' | 'image' | 'video'
    spoiler?: boolean;
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

// ─────────────────────────────────────────────────────────────────────────────
// Error Code → User-Friendly Message Mapping (v3.1.0)
// ─────────────────────────────────────────────────────────────────────────────

const REDDIT_ERROR_MAP: Record<string, (subreddit?: string) => string> = {
    BAD_FLAIR_TARGET: (sr) => `r/${sr ?? 'this subreddit'} requires a flair. Please select one before posting.`,
    FLAIR_TEMPLATE_REQUIRED: (sr) => `r/${sr ?? 'this subreddit'} requires a flair. Please select one before posting.`,
    SUBREDDIT_NOEXIST: (sr) => `Subreddit r/${sr ?? 'unknown'} does not exist.`,
    SUBREDDIT_NOTALLOWED: (sr) => `You are not allowed to post in r/${sr ?? 'this subreddit'}.`,
    SUBREDDIT_QUARANTINED: (sr) => `r/${sr ?? 'this subreddit'} is quarantined. You must opt-in on Reddit before posting.`,
    NO_TEXT: () => 'Post body is empty. Please add some text.',
    TOO_LONG: () => 'Post body exceeds Reddit\'s character limit.',
    NO_SELFS: (sr) => `r/${sr ?? 'this subreddit'} does not allow text posts. Try a link post instead.`,
    NO_LINKS: (sr) => `r/${sr ?? 'this subreddit'} does not allow link posts. Try a text post instead.`,
    RATELIMIT: () => 'You are posting too quickly. Please wait a moment and try again.',
    THREAD_LOCKED: () => 'This thread is locked and cannot be replied to.',
    DOMAIN_BANNED: () => 'The link domain is banned on Reddit.',
    BAD_URL: () => 'The URL provided is invalid or banned on Reddit.',
    ALREADY_SUB: (sr) => `This link has already been submitted to r/${sr ?? 'this subreddit'}.`,
    SUBMIT_VALIDATION_FLAIR_REQUIRED: (sr) => `r/${sr ?? 'this subreddit'} requires a flair before submitting.`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Header Helpers (v3.1.0 — centralized to avoid duplication)
// ─────────────────────────────────────────────────────────────────────────────

const REDDIT_BASE_HEADERS = {
    'User-Agent': 'DotShare/1.0 (by /u/DotShareApp)',
    'Accept': 'application/json'
};

function getAuthHeaders(accessToken: string): Record<string, string> {
    return {
        ...REDDIT_BASE_HEADERS,
        'Authorization': `Bearer ${accessToken}`
    };
}

function getBasicAuthHeaders(clientId: string, clientSecret: string): Record<string, string> {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    return {
        ...REDDIT_BASE_HEADERS,
        'Authorization': `Basic ${auth}`
    };
}

/**
 * Detects if the input is a subreddit (r/...) or username (u/...)
 * Returns the correct 'sr' name for the Reddit API.
 */
function parseRedditTarget(input: string): string {
    const trimmed = input.trim();
    if (trimmed.toLowerCase().startsWith('u/')) {
        // IMPORTANT: In Reddit API, to post to a user profile, 
        // the subreddit name must be prefixed with 'u_'
        return `u_${trimmed.substring(2)}`;
    } else if (trimmed.toLowerCase().startsWith('r/')) {
        return trimmed.substring(2);
    } else {
        return trimmed;
    }
}

/**
 * Sends a direct message (DM) to a Reddit user
 * Falls back to the raw error string if the code is unknown.
 */
function mapRedditError(errorCode: unknown, subreddit?: string, fallback?: string): string {
    // Ensure errorCode is a string
    const codeStr = typeof errorCode === 'string' ? errorCode : String(errorCode ?? '');
    const normalised = codeStr.toUpperCase().trim();
    const mapper = REDDIT_ERROR_MAP[normalised];
    if (mapper) return mapper(subreddit);
    // Unknown code — return the fallback or the raw code itself
    return fallback ?? `Reddit error: ${codeStr || 'Unknown'}`;
}

/**
 * Extracts Reddit error codes from an Axios error response and maps them to
 * user-friendly strings. Handles complex error structures with detailed logging.
 */
function extractRedditErrors(error: unknown, subreddit?: string): string {
    if (!axios.isAxiosError(error)) {
        if (error instanceof Error) return error.message;
        if (typeof error === 'string') return error;
        if (error && typeof error === 'object') {
            const obj = error as Record<string, unknown>;
            if (obj.message && typeof obj.message === 'string') return obj.message;
        }
        return 'Unknown error occurred';
    }

    const data = error.response?.data;
    const status = error.response?.status;

    // Debug: Log the actual data structure for troubleshooting
    if (data) {
        Logger.debug('Reddit API error response:', {
            status,
            dataKeys: typeof data === 'object' ? Object.keys(data as Record<string, unknown>) : 'not-object',
            dataType: typeof data,
            rawData: JSON.stringify(data, null, 2)
        });
    }

    // Handle top-level json.errors array: [[code, message, field], ...]
    if (data?.json?.errors && Array.isArray(data.json.errors) && data.json.errors.length > 0) {
        return (data.json.errors as unknown[])
            .map((e) => {
                if (Array.isArray(e) && e.length > 0) {
                    const code = String(e[0] ?? 'UNKNOWN_ERROR');
                    const details = e.length > 1 && e[1] ? String(e[1]) : undefined;
                    return mapRedditError(code, subreddit, details);
                }
                return mapRedditError(String(e ?? 'UNKNOWN_ERROR'), subreddit);
            })
            .join(' | ');
    }

    // Handle flat error field
    if (data?.error) {
        // data.error might be an object, so convert safely
        let errorStr = '';
        if (typeof data.error === 'string') {
            errorStr = data.error;
        } else if (typeof data.error === 'object' && data.error !== null) {
            // If error is an object, try to extract reason or message
            const errObj = data.error as Record<string, unknown>;
            if (errObj.reason && typeof errObj.reason === 'string') {
                errorStr = errObj.reason;
            } else if (errObj.message && typeof errObj.message === 'string') {
                errorStr = errObj.message;
            } else {
                errorStr = JSON.stringify(errObj);
            }
        } else {
            errorStr = String(data.error ?? 'UNKNOWN_ERROR');
        }

        const code = errorStr.toUpperCase().trim();

        // HTTP 403 — commonly "forbidden" / restricted sub
        if (status === 403 || code === 'FORBIDDEN' || code === '403') {
            return `Access forbidden to r/${subreddit ?? 'this subreddit'}. Make sure the subreddit exists and allows your post type.`;
        }

        // HTTP 400 — commonly malformed request / bad flair
        if (status === 400 || code === 'BAD_REQUEST' || code === '400') {
            return `Bad request to Reddit. This may be due to a missing or invalid flair for r/${subreddit ?? 'this subreddit'}.`;
        }

        const details = data.error_description ? String(data.error_description) : undefined;
        return mapRedditError(code, subreddit, details);
    }

    // Generic HTTP error
    if (status) {
        const message = data?.message ? String(data.message) : '';
        return `Reddit returned HTTP ${status}. ${message}`.trim();
    }

    return error.message || 'Unknown Reddit API error';
}

// ─────────────────────────────────────────────────────────────────────────────
// Media Upload Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps file extension to correct MIME type for image/video uploads.
 * Ensures PNG transparency, GIF animation, and proper video formats.
 */
function getMimeType(ext: string): string {
    const mimeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.gifv': 'video/mp4'
    };
    return mimeMap[ext.toLowerCase()] || 'image/jpeg';
}

// ─────────────────────────────────────────────────────────────────────────────
// Media Upload
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadRedditMedia(accessToken: string, mediaFiles: string[]): Promise<Array<{ id: string; url: string }>> {
    const uploadedAssets: Array<{ id: string; url: string }> = [];

    for (const mediaFile of mediaFiles) {
        try {
            const ext = path.extname(mediaFile).toLowerCase();
            const supportedImageExts = ['.jpg', '.jpeg', '.png', '.gif'];
            const supportedVideoExts = ['.mp4', '.webm', '.gifv'];

            if (!supportedImageExts.includes(ext) && !supportedVideoExts.includes(ext)) {
                Logger.warn(`Skipping unsupported media format: ${ext}`);
                continue;
            }

            const stats = fs.statSync(mediaFile);
            const maxSizeBytes = supportedVideoExts.includes(ext) ? 128 * 1024 * 1024 : 20 * 1024 * 1024;

            if (stats.size > maxSizeBytes) {
                Logger.warn(`Media file too large: ${stats.size} bytes (max: ${maxSizeBytes})`);
                continue;
            }

            // [FIX v3.1.0]: Use official media asset endpoint with URLSearchParams (form-encoded)
            const params = new URLSearchParams();
            params.append('filepath', path.basename(mediaFile));
            params.append('mimetype', getMimeType(ext));

            const leaseResponse = await axios.post('https://oauth.reddit.com/api/media/asset.json', params, {
                headers: getAuthHeaders(accessToken)
            });

            const { args, asset } = leaseResponse.data;
            if (!args || !asset?.asset_id) {
                Logger.warn('Failed to get upload lease or asset ID for', mediaFile);
                continue;
            }

            let keyValue = '';
            const formData = new FormData();
            if (Array.isArray(args.fields)) {
                args.fields.forEach((field: {name: string, value: unknown}) => {
                    formData.append(field.name, String(field.value));
                    if (field.name === 'key') keyValue = String(field.value);
                });
            } else {
                Object.entries(args.fields).forEach(([key, value]) => {
                    formData.append(key, String(value));
                    if (key === 'key') keyValue = String(value);
                });
            }
            formData.append('file', fs.createReadStream(mediaFile), { 
                filename: path.basename(mediaFile),
                contentType: getMimeType(ext) 
            });

            const uploadUrl = args.action.startsWith('http') 
                ? args.action 
                : `https:${args.action}`;

            if (!uploadUrl || uploadUrl === 'https:') {
                Logger.warn('Reddit: invalid upload URL from lease, skipping media');
                continue;
            }

            // S3 strictly requires Content-Length and rejects chunked transfer encoding
            const contentLength = await new Promise<number>((resolve, reject) => {
                formData.getLength((err, length) => err ? reject(err) : resolve(length));
            });

            await axios.post(uploadUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Content-Length': contentLength.toString()
                },
                timeout: 60000,
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            });

            // Pass the direct S3 URL back to the publish API.
            // i.redd.it will return 404/Invalid Image URL if queried immediately before propagation.
            const finalUrl = `${uploadUrl}/${keyValue}`;

            uploadedAssets.push({
                id: asset.asset_id,
                url: finalUrl
            });
        } catch (error: any) {
            Logger.error(`Failed to upload media ${mediaFile}:`, error.message);
            if (error.response?.data) {
                Logger.error('S3 Error Response:', error.response.data.toString());
            }
        }
    }

    return uploadedAssets;
}

// ─────────────────────────────────────────────────────────────────────────────
// Share to Reddit (v3.1.0 — robust error handling)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// FUTURE FEATURE: DotDirect (Reddit DM)
// ⚠️ This is currently unused and reserved for a future update where 
// users can explicitly choose to send a Private Message instead of a Post.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a direct message (DM) to a Reddit user
 */
async function sendRedditDM(username: string, subject: string, body: string, accessToken: string): Promise<string> {
    try {
        const data = new URLSearchParams();
        data.append('api_type', 'json');
        data.append('to', username);
        data.append('subject', subject);
        data.append('text', body);

        const headers = {
            ...getAuthHeaders(accessToken),
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        const response = await axios.post('https://oauth.reddit.com/api/compose', data, { headers });

        if (response.data.json?.errors?.length > 0) {
            const errorMsg = (response.data.json.errors[0] as unknown[])?.join(' ') || 'Failed to send DM';
            throw new Error(errorMsg);
        }

        Logger.info(`Successfully sent DM to u/${username}`);
        return `dm_to_${username}`;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('Error sending Reddit DM:', errorMessage);
        throw new Error(`Failed to send DM to u/${username}: ${errorMessage}`);
    }
}

export async function shareToReddit(postData: RedditPostData): Promise<string> {
    // Clean and parse the target (e.g., 'u/FreeRave' -> 'u_FreeRave')
    const subreddit = parseRedditTarget(postData.subreddit);

    try {
        const accessToken = await TokenManager.getValidToken('reddit');
        if (!accessToken) throw new Error('Reddit: not authenticated — connect your account in Settings.');

        // [LOGIC CHANGE v3.1.0]: We no longer branch to DMs here. 
        // u/username now correctly posts to the user's profile timeline.

        const title = postData.title || postData.text.split('\n')[0].substring(0, 300) || 'Post from DotShare';

        let kind = postData.postType === 'link' ? 'link' : 'self';
        let text = postData.text;
        let url: string | undefined;

        // Force 'link' kind if we actually have a URL and no media
        if (postData.postType === 'link' || (!postData.postType && text.startsWith('http'))) {
            try {
                new URL(text);
                url = text;
                kind = 'link';
            } catch {
                // If it's not a valid URL, fallback to self post
                kind = 'self';
            }
        }

        let mediaIds;
        const data = new URLSearchParams();

        if (postData.media && postData.media.length > 0) {
            Logger.info(`Reddit: Uploading ${postData.media.length} media file(s)...`);
            mediaIds = await uploadRedditMedia(accessToken, postData.media);

            if (mediaIds.length > 0) {
                if (mediaIds.length === 1 && postData.postType !== 'link') {
                    const ext = path.extname(postData.media[0]).toLowerCase();
                    const isVideo = ['.mp4', '.webm', '.gifv'].includes(ext);

                    kind = isVideo ? 'video' : 'image';
                    // Reverting to use URL for Reddit submit API as required
                    url = mediaIds[0].url; 
                } else {
                    kind = 'self';
                    const mediaMarkdown = mediaIds.map(m => `\n\n![DotShare Media](${m.url})`).join('');
                    text += mediaMarkdown;
                }
            }
        }

        data.append('api_type', 'json');
        data.append('sr', subreddit);
        data.append('title', title.substring(0, 300));
        data.append('kind', kind);

        // Append the url whether it is a link, image or video post
        if (kind === 'self') {
            data.append('text', text);
        } else if (url) { 
            data.append('url', url);
            data.append('resubmit', 'true');
        }

        if (postData.flair) {
            data.append('flair_id', postData.flair);
        }
        if (postData.spoiler) {
            data.append('spoiler', 'true');
        }

        const headers = {
            ...getAuthHeaders(accessToken),
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        const response = await axios.post('https://oauth.reddit.com/api/submit', data, { headers });

        // Reddit returns HTTP 200 even for errors — check json.errors
        if (response.data.json?.errors?.length > 0) {
            const friendlyErrors = (response.data.json.errors as unknown[])
                .map((e) => {
                    if (Array.isArray(e) && e.length > 0) {
                        const code = String(e[0] ?? 'UNKNOWN_ERROR');
                        const details = e.length > 1 && e[1] ? String(e[1]) : undefined;
                        return mapRedditError(code, subreddit, details);
                    }
                    return mapRedditError(String(e ?? 'UNKNOWN_ERROR'), subreddit);
                })
                .join(' | ');
            throw new Error(friendlyErrors);
        }

        if (response.data.error) {
            // Handle case where error might be an object
            let errorStr = '';
            if (typeof response.data.error === 'string') {
                errorStr = response.data.error;
            } else if (typeof response.data.error === 'object' && response.data.error !== null) {
                const errObj = response.data.error as Record<string, unknown>;
                if (errObj.reason && typeof errObj.reason === 'string') {
                    errorStr = errObj.reason;
                } else if (errObj.message && typeof errObj.message === 'string') {
                    errorStr = errObj.message;
                } else {
                    errorStr = JSON.stringify(errObj);
                }
            } else {
                errorStr = String(response.data.error ?? 'UNKNOWN_ERROR');
            }
            throw new Error(mapRedditError(errorStr, subreddit, response.data.error_description ? String(response.data.error_description) : undefined));
        }

        const postIdResult = response.data.json?.data?.name || response.data.name || 'posted';
        Logger.info('Successfully posted to Reddit:', postIdResult);
        return postIdResult;

    } catch (error: unknown) {
        // Re-throw already-mapped errors (thrown above) as-is
        if (error instanceof Error && !axios.isAxiosError(error)) {
            Logger.error('Error posting to Reddit:', error.message);
            throw new Error(`Failed to share to Reddit: ${error.message}`);
        }

        // Map Axios errors
        const friendlyMessage = extractRedditErrors(error, subreddit);
        Logger.error('Error sharing to Reddit:', friendlyMessage);
        throw new Error(`Failed to share to ${postData.subreddit}: ${friendlyMessage}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Management
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshRedditToken(
    refreshToken: string,
    clientId?: string,
    clientSecret?: string
): Promise<{ access_token: string, expires_in: number }> {
    try {
        const finalClientId = clientId || process.env.REDDIT_CLIENT_ID || '';
        const finalClientSecret = clientSecret || process.env.REDDIT_CLIENT_SECRET || '';

        if (!finalClientId || !finalClientSecret) {
            throw new Error('Reddit client ID and client secret are required. Provide them as parameters or set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables.');
        }

        const headers = {
            ...getBasicAuthHeaders(finalClientId, finalClientSecret),
            'Content-Type': 'application/x-www-form-urlencoded'
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
        const response = await axios.get('https://oauth.reddit.com/api/v1/me', { 
            headers: getAuthHeaders(accessToken)
        });
        return !!response.data.name;
    } catch (error) {
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subreddit Helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function getRedditSubreddits(accessToken: string, query?: string): Promise<Array<{ display_name: string, display_name_prefixed: string }>> {
    try {
        const endpoint = query
            ? `https://oauth.reddit.com/api/search_subreddits?query=${encodeURIComponent(query)}`
            : 'https://oauth.reddit.com/subreddits/mine/subscriber?limit=10';

        const response = await axios.get(endpoint, { 
            headers: getAuthHeaders(accessToken)
        });
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
        const rawSr = subreddit.trim();
        if (!rawSr) {
            Logger.error('Error validating subreddit: name is empty');
            return false;
        }

        const cleanSubreddit = rawSr.startsWith('r/')
            ? rawSr.substring(2)
            : rawSr.startsWith('u/')
                ? `u_${rawSr.substring(2)}`
                : rawSr;

        const response = await axios.get(`https://oauth.reddit.com/r/${cleanSubreddit}/about.json`, { 
            headers: getAuthHeaders(accessToken)
        });
        const isValid = !!(response.data && response.data.kind === 't5');

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
        const response = await axios.get(`https://oauth.reddit.com/user/${username}/about.json`, { 
            headers: getAuthHeaders(accessToken)
        });
        return !!(response.data && response.data.kind === 't2');
    } catch (error) {
        Logger.error('Error validating Reddit user:', error);
        return false;
    }
}

export async function validateRedditTarget(accessToken: string, target: string): Promise<boolean> {
    try {
        if (target.startsWith('u/')) {
            const username = target.substring(2);
            return await validateRedditUser(accessToken, username);
        } else if (target.startsWith('r/')) {
            const subredditName = target.substring(2);
            return await validateRedditSubreddit(accessToken, subredditName);
        } else {
            return await validateRedditSubreddit(accessToken, target);
        }
    } catch (error) {
        Logger.error('Error validating Reddit target:', error);
        return false;
    }
}

export async function getRedditFlairs(accessToken: string, subreddit: string): Promise<Array<{ id: string, text: string }>> {
    try {
        const response = await axios.get(`https://oauth.reddit.com/r/${subreddit}/api/link_flair_v2`, { 
            headers: getAuthHeaders(accessToken)
        });
        return response.data || [];
    } catch (error) {
        Logger.error('Error fetching subreddit flairs:', error);
        return [];
    }
}

export async function getRedditPostDetails(accessToken: string, postId: string): Promise<{ score: number, num_comments: number, permalink: string } | null> {
    try {
        const response = await axios.get(`https://oauth.reddit.com/by_id/${postId}`, { 
            headers: getAuthHeaders(accessToken)
        });
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
        const response = await axios.get(`https://oauth.reddit.com/r/${subreddit}/about/rules.json`, { 
            headers: getAuthHeaders(accessToken)
        });
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
        const response = await axios.get(`https://oauth.reddit.com/r/${subreddit}/about.json`, { 
            headers: getAuthHeaders(accessToken)
        });
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

export async function getRedditTrendingSubreddits(accessToken: string, limit = 25): Promise<Array<{ display_name: string, display_name_prefixed: string, subscribers: number }>> {
    try {
        const response = await axios.get(`https://oauth.reddit.com/subreddits/popular?limit=${limit}&sort=hot`, { 
            headers: getAuthHeaders(accessToken)
        });
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

export async function getRelatedSubreddits(accessToken: string, subreddit: string): Promise<Array<{ display_name: string, display_name_prefixed: string }>> {
    try {
        const subredditInfo = await getRedditSubredditInfo(accessToken, subreddit);
        if (!subredditInfo) return [];

        const searchTerms = [
            subredditInfo.display_name,
            ...(subredditInfo.public_description ? subredditInfo.public_description.split(' ').slice(0, 3) : [])
        ];

        const uniqueRelated: Array<{ display_name: string, display_name_prefixed: string }> = [];

        for (const term of searchTerms.slice(0, 2)) {
            if (term.length < 3) continue;

            try {
                const searchResponse = await axios.get(
                    `https://oauth.reddit.com/api/search_subreddits?query=${encodeURIComponent(term)}&limit=5`,
                    { headers: getAuthHeaders(accessToken) }
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
                Logger.warn(`Failed to search related subreddits for term "${term}":`, searchError);
            }

            if (uniqueRelated.length >= 10) break;
        }

        return uniqueRelated.slice(0, 10);
    } catch (error) {
        Logger.error('Error fetching related subreddits:', error);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Post Management
// ─────────────────────────────────────────────────────────────────────────────

export async function editRedditPost(accessToken: string, postId: string, newText: string): Promise<boolean> {
    try {
        const headers = {
            ...getAuthHeaders(accessToken),
            'Content-Type': 'application/x-www-form-urlencoded'
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
            ...getAuthHeaders(accessToken),
            'Content-Type': 'application/x-www-form-urlencoded'
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

export async function getRedditUserPosts(accessToken: string, username?: string, limit = 10): Promise<Array<{ id: string, title: string, subreddit: string, score: number, permalink: string, created: number }>> {
    try {
        const targetUsername = username || 'me';
        const response = await axios.get(`https://oauth.reddit.com/user/${targetUsername}/submitted?sort=new&limit=${limit}`, { 
            headers: getAuthHeaders(accessToken)
        });

        return response.data.data.children.map((post: { data: RedditPostListingData }) => ({
            id: post.data.name,
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
): Promise<{ access_token: string, refresh_token?: string, expires_in?: number }> {
    try {
        const headers = {
            ...getBasicAuthHeaders(clientId, clientSecret),
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        const data = new URLSearchParams();
        data.append('grant_type', 'password');
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