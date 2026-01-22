import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { PostData } from './types';
import { Logger } from './utils/Logger';

// Check if we're running in VS Code environment
const isVscodeEnvironment = typeof vscode !== 'undefined' && vscode.window;

export async function shareToTelegram(post: PostData, botToken?: string, chatId?: string, callbacks?: {
    onSuccess?: (message: string) => void;
    onError?: (message: string) => void;
    onOpenLink?: (url: string) => void;
}, scheduleDate?: Date) {

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
        Logger.info('[DotShare] Starting Telegram share...');
        Logger.info(`[DotShare] Bot token: ${botToken?.substring(0, 10)}...`);
        Logger.info(`[DotShare] Chat ID: ${chatId}`);
        Logger.info(`[DotShare] Post text: ${post.text.substring(0, 50)}...`);

        // Handle media if present
        if (post.media && post.media.length > 0) {
            Logger.info(`[DotShare] Media files: ${post.media.length}`);

            for (const mediaFile of post.media) {
                if (!fs.existsSync(mediaFile)) {
                    Logger.warn(`[DotShare] Media file not found: ${mediaFile}`);
                    continue;
                }

                const ext = path.extname(mediaFile).toLowerCase();
                const fileContent = fs.readFileSync(mediaFile);
                const fileBuffer = Buffer.from(fileContent);

                let method = 'sendPhoto';
                let fieldName = 'photo';

                if (['.mp4', '.avi', '.mov', '.mkv'].includes(ext)) {
                    method = 'sendVideo';
                    fieldName = 'video';
                } else if (['.gif'].includes(ext)) {
                    method = 'sendAnimation';
                    fieldName = 'animation';
                }

                const mediaUrl = `https://api.telegram.org/bot${botToken}/${method}`;

                Logger.info(`[DotShare] Sending ${method} for ${path.basename(mediaFile)}`);

                const formData = new FormData();
                formData.append('chat_id', chatId);
                formData.append(fieldName, fileBuffer, path.basename(mediaFile));
                if (post.text && post.media.indexOf(mediaFile) === 0) {
                    // Add caption to first media only
                    formData.append('caption', post.text);
                    formData.append('parse_mode', 'HTML');
                }
                if (scheduleDate) {
                    formData.append('schedule_date', Math.floor(scheduleDate.getTime() / 1000).toString());
                    Logger.info(`[DotShare] Scheduling media for: ${scheduleDate.toISOString()}, Unix: ${Math.floor(scheduleDate.getTime() / 1000)}`);
                }

                const mediaResponse = await axios.post(mediaUrl, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                });

                if (!mediaResponse.data.ok) {
                    throw new Error(`Telegram API error: ${mediaResponse.data.description}`);
                }

                Logger.info(`[DotShare] Media sent successfully: ${mediaResponse.data.result.message_id}`);
            }
        } else {
            // Text-only post
            await sendTextMessage(botToken, chatId, post.text, scheduleDate);
        }

        const successMessage = 'Posted to Telegram successfully! 🦅🔥';
        Logger.info('[DotShare] Success: Post completed');
        if (callbacks?.onSuccess) {
            callbacks.onSuccess(successMessage);
        } else if (isVscodeEnvironment) {
            vscode.window.showInformationMessage(successMessage);
        }
    } catch (error: unknown) {
        let errorDetail = 'Unknown error';

        if (axios.isAxiosError(error)) {
            // Safe access to axios error properties
            const telegramError = error.response?.data as { description?: string };
            errorDetail = telegramError?.description || error.message;
        } else if (error instanceof Error) {
            errorDetail = error.message;
        }

        const errorMessage = `Failed to post to Telegram: ${errorDetail}`;
        Logger.error('[DotShare] Error:', errorDetail);
        Logger.error('[DotShare] Full error:', error);

        if (callbacks?.onError) {
            callbacks.onError(errorMessage);
        } else if (isVscodeEnvironment) {
            vscode.window.showErrorMessage(errorMessage);
        }
    }
}

// Helper function to send text messages
async function sendTextMessage(botToken: string, chatId: string, text: string, scheduleDate?: Date): Promise<void> {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    Logger.info('[DotShare] Sending text message');

    const payload: {
        chat_id: string;
        text: string;
        parse_mode: string;
        schedule_date?: number;
    } = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
    };

    if (scheduleDate) {
        payload.schedule_date = Math.floor(scheduleDate.getTime() / 1000);
        Logger.info(`[DotShare] Scheduling for: ${scheduleDate.toISOString()}, Unix: ${payload.schedule_date}`);
    }

    const response = await axios.post(url, payload);

    if (!response.data.ok) {
        throw new Error(`Telegram API error: ${response.data.description}`);
    }

    Logger.info(`[DotShare] Text sent successfully: ${response.data.result.message_id}`);
}
