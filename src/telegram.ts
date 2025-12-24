import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { PostData } from './types';
import { DEFAULT_SERVER_URL } from './constants';

// Check if we're running in VS Code environment
const isVscodeEnvironment = typeof vscode !== 'undefined' && vscode.window;

export async function shareToTelegram(post: PostData, botToken?: string, chatId?: string, callbacks?: {
    onSuccess?: (message: string) => void;
    onError?: (message: string) => void;
    onOpenLink?: (url: string) => void;
}) {

    if (!botToken || !chatId) {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '')}`;

        if (!isVscodeEnvironment && callbacks?.onOpenLink) {
            callbacks.onOpenLink(shareUrl);
        } else if (isVscodeEnvironment) {
            vscode.env.openExternal(vscode.Uri.parse(shareUrl));
            vscode.window.showInformationMessage('Opened Telegram share. Copy the generated post: ' + post.text);
        }

        if (callbacks?.onSuccess) {
            callbacks.onSuccess('Telegram share link prepared. Copy the generated post: ' + post.text);
        }
        return;
    }

    try {
        // Use Python server API instead of direct Telegram API calls
        // ✅ 2. استخدام الثابت هنا
        const serverUrl = process.env.DOTSHARE_SERVER_URL || DEFAULT_SERVER_URL;

        // Convert media files to data URLs for the server
        const mediaUrls = post.media ? post.media.map(file => {
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

        const response = await axios.post(`${serverUrl}/api/post/telegram`, {
            bot_token: botToken,
            chat_id: chatId,
            text: post.text,
            media_urls: mediaUrls
        });

        if (response.data.success) {
            const successMessage = response.data.message || 'Posted to Telegram successfully!';
            if (callbacks?.onSuccess) {
                callbacks.onSuccess(successMessage);
            } else if (isVscodeEnvironment) {
                vscode.window.showInformationMessage(successMessage);
            }
        } else {
            throw new Error(response.data.error || 'Unknown error from server');
        }
    } catch (error) {
        const errorMessage = 'Failed to post to Telegram: ' + (error instanceof Error ? error.message : String(error));
        if (callbacks?.onError) {
            callbacks.onError(errorMessage);
        } else if (isVscodeEnvironment) {
            vscode.window.showErrorMessage(errorMessage);
        }
    }
}