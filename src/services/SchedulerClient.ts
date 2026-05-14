import * as vscode from 'vscode';
import { DotShareAuth } from './DotShareAuth';
import { PostData, SocialPlatform, ScheduledPost } from '../types';
import { Logger } from '../utils/Logger';
import FormData from 'form-data';


export class SchedulerClient {
    
    /**
     * Get API base URL (delegates to DotShareAuth for consistency)
     */
    private static getApiBaseUrl(): string {
        return DotShareAuth.getApiBaseUrl();
    }

    /**
     * Uploads media (base64) to the Cloudflare R2 bucket via the Rust backend.
     * Returns the public media_url.
     */
    public static async uploadMediaBase64(
        context: vscode.ExtensionContext,
        fileName: string,
        base64Data: string,
        contentType: string
    ): Promise<{ success: boolean; url?: string; message?: string }> {
        const token = await DotShareAuth.getToken(context);
        if (!token) {
            return { success: false, message: 'Not authenticated with DotSuite.' };
        }

        try {
            // Convert base64 to Buffer
            const buffer = Buffer.from(base64Data, 'base64');

            // Build FormData
            const formData = new FormData();
            formData.append('file', buffer, {
                filename: fileName,
                contentType: contentType
            });

            const response = await fetch(`${this.getApiBaseUrl()}/v1/media/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...formData.getHeaders() // Crucial for multipart/form-data boundary
                },
                body: formData as any // node-fetch/undici accepts this
            });

            if (response.ok) {
                const data = await response.json() as { media_url: string };
                Logger.info('[SchedulerClient] Media uploaded successfully:', data.media_url);
                return { success: true, url: data.media_url };
            } else {
                const errorText = await response.text();
                Logger.warn(`[SchedulerClient] Failed to upload media: ${response.status}`, errorText);
                return { success: false, message: `Upload failed: ${response.statusText}` };
            }
        } catch (error) {
            Logger.error('[SchedulerClient] Error uploading media:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, message: `Network error: ${errorMessage}` };
        }
    }

    /**
     * Schedule a new post via the Rust backend.
     */
    public static async schedulePost(
        context: vscode.ExtensionContext,
        postData: PostData,
        platforms: SocialPlatform[],
        scheduledTime: string // Expected as an ISO string
    ): Promise<{ success: boolean; message?: string; errorCode?: string }> {
        const token = await DotShareAuth.getToken(context);
        if (!token) {
            return { success: false, message: 'Not authenticated with DotSuite. Please set your token in settings.' };
        }

        try {
            const response = await fetch(`${this.getApiBaseUrl()}/v1/posts/schedule`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    text: postData.text,
                    media_urls: postData.media || [],
                    platforms: platforms,
                    has_video: false,
                    scheduled_at: scheduledTime
                })
            });

            if (response.ok) {
                Logger.info('[SchedulerClient] Post scheduled successfully');
                return { success: true };
            } else {
                const errorText = await response.text();
                Logger.warn('[SchedulerClient] Failed to schedule post:', { status: response.status, errorText });
                
                try {
                    const errorData = JSON.parse(errorText) as { error?: { code?: string, message?: string } };
                    if (errorData?.error?.code) {
                        return { 
                            success: false, 
                            message: errorData.error.message || response.statusText, 
                            errorCode: errorData.error.code 
                        };
                    }
                } catch (e) {
                    // Not JSON, fallback to generic
                }
                
                return { success: false, message: `Server error: ${response.statusText}` };
            }
        } catch (error) {
            Logger.error('[SchedulerClient] Error scheduling post:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, message: `Network error: ${errorMessage}` };
        }
    }

    /**
     * Fetch all pending scheduled posts.
     */
    public static async getPendingPosts(context: vscode.ExtensionContext): Promise<ScheduledPost[]> {
        const token = await DotShareAuth.getToken(context);
        if (!token) return [];

        try {
            const response = await fetch(`${this.getApiBaseUrl()}/v1/posts?status=pending`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json() as { posts: ScheduledPost[] } | ScheduledPost[];
                return Array.isArray(data) ? data : (data.posts || []);
            } else {
                Logger.warn('[SchedulerClient] Failed to fetch pending posts:', response.status);
                return [];
            }
        } catch (error) {
            Logger.error('[SchedulerClient] Error fetching pending posts:', error);
            return [];
        }
    }

    /**
     * Cancel a scheduled post.
     */
    public static async cancelPost(context: vscode.ExtensionContext, postId: string): Promise<boolean> {
        const token = await DotShareAuth.getToken(context);
        if (!token) return false;

        try {
            const response = await fetch(`${this.getApiBaseUrl()}/v1/posts/${postId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                Logger.info(`[SchedulerClient] Post ${postId} cancelled successfully.`);
                return true;
            } else {
                Logger.warn(`[SchedulerClient] Failed to cancel post ${postId}:`, response.status);
                return false;
            }
        } catch (error) {
            Logger.error(`[SchedulerClient] Error cancelling post ${postId}:`, error);
            return false;
        }
    }
}
