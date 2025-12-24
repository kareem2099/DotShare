import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import { PostData } from './types';
import * as path from 'path';
// ✅ 1. استيراد رابط السيرفر الموحد
import { DEFAULT_SERVER_URL } from './constants';

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
        // Use Python server API instead of direct LinkedIn API calls
        // ✅ 2. استخدام الثابت هنا
        const serverUrl = process.env.DOTSHARE_SERVER_URL || DEFAULT_SERVER_URL;
        
        const mediaUrls = post.media ? post.media.map(file => {
            // Convert local file paths to data URLs for the server
            if (fs.existsSync(file)) {
                const fileContent = fs.readFileSync(file);
                const ext = path.extname(file).toLowerCase();
                let mimeType = 'application/octet-stream';
                if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
                else if (ext === '.png') mimeType = 'image/png';
                else if (ext === '.gif') mimeType = 'image/gif';
                else if (ext === '.mp4') mimeType = 'video/mp4';
                else if (ext === '.avi') mimeType = 'video/avi';
                return `data:${mimeType};base64,${fileContent.toString('base64')}`;
            }
            return file;
        }) : [];

        const response = await axios.post(`${serverUrl}/api/post/linkedin`, {
            access_token: accessToken,
            text: post.text,
            media_urls: mediaUrls
        });

        if (response.data.success) {
            const successMessage = response.data.message || 'Posted to LinkedIn successfully!';
            if (callbacks?.onSuccess) {
                callbacks.onSuccess(successMessage);
            } else if (isVscodeEnvironment) {
                vscode.window.showInformationMessage(successMessage);
            }
        } else {
            throw new Error(response.data.error || 'Unknown error from server');
        }
    } catch (error) {
        let errorMessage = 'Failed to post to LinkedIn';
        if (axios.isAxiosError(error) && error.response?.data?.error) {
            errorMessage += `: ${error.response.data.error}`;
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