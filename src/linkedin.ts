import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import { PostData } from './types';

// Check if we're running in VS Code environment
const isVscodeEnvironment = typeof vscode !== 'undefined' && vscode.window;

export async function shareToLinkedIn(post: PostData, accessToken?: string, callbacks?: {
    onSuccess?: (message: string) => void;
    onError?: (message: string) => void;
    onOpenLink?: (url: string) => void;
}) {
    accessToken = accessToken || '';

    if (!accessToken) {
        const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '')}`;

        if (!isVscodeEnvironment && callbacks?.onOpenLink) {
            callbacks.onOpenLink(shareUrl);
        } else if (isVscodeEnvironment) {
            vscode.env.openExternal(vscode.Uri.parse(shareUrl));
            vscode.window.showInformationMessage('Opened LinkedIn share. Copy the generated post: ' + post.text);
        }

        if (callbacks?.onSuccess) {
            callbacks.onSuccess('LinkedIn share link prepared. Copy the generated post: ' + post.text);
        }
        return;
    }

    try {
        // Get person ID
        const personResponse = await axios.get('https://api.linkedin.com/v2/me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const personId = personResponse.data.id;

        // Upload media if present (support multiple files)
        let mediaUploads = null;
        if (post.media && post.media.length > 0) {
            mediaUploads = [];

            for (let i = 0; i < post.media.length; i++) {
                const mediaFile = post.media[i];

                // Determine if it's a video or image based on file extension
                const isVideo = mediaFile.toLowerCase().endsWith('.mp4');
                const recipe = isVideo ? "urn:li:digitalmediaRecipe:feedshare-video" : "urn:li:digitalmediaRecipe:feedshare-image";
                const contentType = isVideo ? "video/mp4" : "image/*";

                const mediaData = {
                    "registerUploadRequest": {
                        "recipes": [recipe],
                        "owner": `urn:li:person:${personId}`,
                        "serviceRelationships": [
                            {
                                "relationshipType": "OWNER",
                                "identifier": "urn:li:userGeneratedContent"
                            }
                        ]
                    }
                };
                const uploadRequest = await axios.post('https://api.linkedin.com/v2/assets?action=registerUpload', mediaData, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                const uploadUrl = uploadRequest.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
                const assetUrn = uploadRequest.data.value.asset;

                // Upload file with correct content type
                await axios.post(uploadUrl, fs.readFileSync(mediaFile), {
                    headers: { 'Content-Type': contentType }
                });

                const mediaUpload = {
                    "status": "READY",
                    "description": {
                        "text": isVideo ? "Video from DotShare" : "Image from DotShare"
                    },
                    "media": assetUrn,
                    "title": {
                        "text": "Project Update"
                    }
                };

                mediaUploads.push(mediaUpload);
            }
        }

        // Post content
        const postData: any = {
            "author": `urn:li:person:${personId}`,
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {
                        "text": post.text
                    },
                    "shareMediaCategory": "NONE"
                }
            },
            "visibility": {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
            }
        };

        if (mediaUploads && mediaUploads.length > 0) {
            // Determine media category based on file types
            const hasVideo = post.media!.some(file => file.toLowerCase().endsWith('.mp4'));
            const hasImage = post.media!.some(file => !file.toLowerCase().endsWith('.mp4'));

            if (hasVideo && hasImage) {
                // LinkedIn supports carousels with mixed media
                postData.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "CAROUSEL";
            } else if (hasVideo) {
                postData.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "VIDEO";
            } else {
                postData.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "IMAGE";
            }

            postData.specificContent["com.linkedin.ugc.ShareContent"].media = mediaUploads;
        }

        await axios.post('https://api.linkedin.com/v2/ugcPosts', postData, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const successMessage = 'Posted to LinkedIn successfully!';
        if (callbacks?.onSuccess) {
            callbacks.onSuccess(successMessage);
        } else if (isVscodeEnvironment) {
            vscode.window.showInformationMessage(successMessage);
        }
    } catch (error) {
        const errorMessage = 'Failed to post to LinkedIn: ' + ((error as any).response?.data?.message || (error as Error).message);
        if (callbacks?.onError) {
            callbacks.onError(errorMessage);
        } else if (isVscodeEnvironment) {
            vscode.window.showErrorMessage(errorMessage);
        }
    }
}
