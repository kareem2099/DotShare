import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import FormData from 'form-data';
import { PostData } from './types';

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
        if (post.media && post.media.length > 0) {
            // Handle multiple media using sendMediaGroup for multiple files
            if (post.media.length > 1) {
                // Use sendMediaGroup for multiple media
                const mediaGroup = post.media.map((file, index) => {
                    const isVideo = file.toLowerCase().endsWith('.mp4') || file.toLowerCase().endsWith('.avi');
                    const mediaType = isVideo ? 'video' : 'photo';

                    return {
                        type: mediaType,
                        media: `attach://${mediaType}_${index}`,
                        caption: index === 0 ? post.text : undefined // Only add caption to first media
                    };
                });

                const formData = new FormData();
                formData.append('chat_id', chatId);
                formData.append('media', JSON.stringify(mediaGroup));

                // Attach all files
                post.media.forEach((file, index) => {
                    const isVideo = file.toLowerCase().endsWith('.mp4') || file.toLowerCase().endsWith('.avi');
                    const mediaType = isVideo ? 'video' : 'photo';
                    const filename = `${mediaType}_${index}`;
                    formData.append(filename, fs.createReadStream(file));
                });

                const url = `https://api.telegram.org/bot${botToken}/sendMediaGroup`;
                await axios.post(url, formData, { headers: formData.getHeaders() });
            } else {
                // Single media file - use individual sendPhoto/sendVideo
                const mediaFile = post.media[0];
                const isVideo = mediaFile.toLowerCase().endsWith('.mp4') || mediaFile.toLowerCase().endsWith('.avi');
                const url = isVideo ?
                    `https://api.telegram.org/bot${botToken}/sendVideo` :
                    `https://api.telegram.org/bot${botToken}/sendPhoto`;

                const formData = new FormData();
                formData.append('chat_id', chatId);
                formData.append(isVideo ? 'video' : 'photo', fs.createReadStream(mediaFile));
                formData.append('caption', post.text);

                await axios.post(url, formData, { headers: formData.getHeaders() });
            }
        } else {
            // Send text only
            const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
            await axios.post(url, {
                chat_id: chatId,
                text: post.text
            });
        }

        const successMessage = 'Posted to Telegram successfully!';
        if (callbacks?.onSuccess) {
            callbacks.onSuccess(successMessage);
        } else if (isVscodeEnvironment) {
            vscode.window.showInformationMessage(successMessage);
        }
    } catch (error) {
        const errorMessage = 'Failed to post to Telegram: ' + (error as Error).message;
        if (callbacks?.onError) {
            callbacks.onError(errorMessage);
        } else if (isVscodeEnvironment) {
            vscode.window.showErrorMessage(errorMessage);
        }
    }
}
