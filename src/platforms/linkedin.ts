import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import { PostData } from '../types';
import * as path from 'path';

// Check if we're running in VS Code environment
const isVscodeEnvironment = typeof vscode !== 'undefined' && vscode.window;

interface LinkedInMediaAsset {
    status: string;
    description: { text: string };
    media: string;
    title: { text: string };
}

interface LinkedInShareContent {
    shareCommentary: { text: string };
    shareMediaCategory: string;
    media?: LinkedInMediaAsset[];
}

interface LinkedInPostBody {
    author: string;
    lifecycleState: string;
    specificContent: { 'com.linkedin.ugc.ShareContent': LinkedInShareContent };
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': string };
}

export async function shareToLinkedIn(post: PostData, accessToken?: string, callbacks?: {
    onSuccess?: (message: string) => void;
    onError?: (message: string) => void;
    onOpenLink?: (url: string) => void;
}) {
    if (!accessToken) {
        // Fallback for manual sharing if no token is provided
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
        // 1. Get User URN (Profile ID) using OpenID endpoint
        const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const personUrn = `urn:li:person:${profileRes.data.sub}`;

        // 2. Process and Upload Media directly to LinkedIn
        const mediaAssets: LinkedInMediaAsset[] = [];
        
        if (post.media && post.media.length > 0) {
            for (const filePath of post.media) {
                if (fs.existsSync(filePath)) {
                    const fileContent = fs.readFileSync(filePath);
                    const ext = path.extname(filePath).toLowerCase();
                    const isVideo = ext === '.mp4' || ext === '.avi' || ext === '.mov';
                    const recipe = isVideo ? 'urn:li:digitalmediaRecipe:feedshare-video' : 'urn:li:digitalmediaRecipe:feedshare-image';
                    
                    // Register the upload with LinkedIn
                    const registerRes = await axios.post('https://api.linkedin.com/v2/assets?action=registerUpload', {
                        registerUploadRequest: {
                            recipes: [recipe],
                            owner: personUrn,
                            serviceRelationships: [{
                                relationshipType: 'OWNER',
                                identifier: 'urn:li:userGeneratedContent'
                            }]
                        }
                    }, {
                        headers: { 
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    const uploadMechanism = registerRes.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'];
                    const uploadUrl = uploadMechanism.uploadUrl;
                    const assetUrn = registerRes.data.value.asset;

                    // Upload the actual file bytes to LinkedIn
                    await axios.put(uploadUrl, fileContent, {
                        headers: {
                            'Content-Type': 'application/octet-stream',
                            'Authorization': `Bearer ${accessToken}`
                        }
                    });

                    mediaAssets.push({
                        status: 'READY',
                        description: { text: path.basename(filePath) },
                        media: assetUrn,
                        title: { text: path.basename(filePath) }
                    });
                }
            }
        }

        // 3. Create the Post on LinkedIn
        const postBody: LinkedInPostBody = {
            author: personUrn,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: { text: post.text },
                    shareMediaCategory: 'NONE'
                }
            },
            visibility: {
                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
            }
        };

        // Attach media if we uploaded any
        if (mediaAssets.length > 0) {
            const hasVideo = mediaAssets.some(m => m.media.includes('video'));
            const hasImage = mediaAssets.some(m => m.media.includes('image'));
            
            postBody.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 
                (hasVideo && hasImage) ? 'CAROUSEL' : 
                hasVideo ? 'VIDEO' : 'IMAGE';
                
            postBody.specificContent['com.linkedin.ugc.ShareContent'].media = mediaAssets;
        }

        // Final API call to publish the post
        await axios.post('https://api.linkedin.com/v2/ugcPosts', postBody, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0'
            }
        });

        // 4. Handle Success
        const successMessage = 'Posted to LinkedIn successfully!';
        if (callbacks?.onSuccess) {
            callbacks.onSuccess(successMessage);
        } else if (isVscodeEnvironment) {
            vscode.window.showInformationMessage(successMessage);
        }

    } catch (error: unknown) {
        // Handle Errors elegantly
        let errorMessage = 'Failed to post to LinkedIn';
        const axiosErr = axios.isAxiosError(error) ? error : null;
        if (axiosErr?.response?.data?.message || axiosErr?.response?.data?.error?.message) {
            errorMessage += `: ${axiosErr.response?.data?.message || axiosErr.response?.data?.error?.message}`;
        } else if (error instanceof Error) {
            errorMessage += `: ${error.message}`;
        }

        if (callbacks?.onError) {
            callbacks.onError(errorMessage);
        } else if (isVscodeEnvironment) {
            vscode.window.showErrorMessage(errorMessage);
        }
    }
}