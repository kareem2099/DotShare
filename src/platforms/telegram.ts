import { getPlatformHost, PublicationObserver, PublicationReceipt } from './runtime';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { PostData } from '../types';
import { Logger } from '../utils/Logger';

// Check if we're running in VS Code environment


export async function shareToTelegram(post: PostData, botToken?: string, chatId?: string, callbacks?: {
    onSuccess?: (message: string) => void;
    onError?: (message: string) => void;
    onOpenLink?: (url: string) => void;
}, scheduleDate?: Date, onPublished?: PublicationObserver): Promise<PublicationReceipt | undefined> {
    const vscode = getPlatformHost();
    let firstReceipt: PublicationReceipt | undefined;

    if (!botToken || !chatId) {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(vscode?.workspace.workspaceFolders?.[0]?.uri.fsPath || '')}`;

        if (!vscode && callbacks?.onOpenLink) {
            callbacks.onOpenLink(shareUrl);
        } else if (vscode) {
            vscode.env.openExternal(vscode.Uri.parse(shareUrl));
            vscode.window.showInformationMessage('Opened Telegram share. Copy the generated post: ' + post.text);
        }

        if (callbacks?.onSuccess) {
            callbacks.onSuccess('Telegram share link prepared. Copy the generated post: ' + post.text);
        }
        return;
    }

    try {
        if (scheduleDate) throw new Error('Use DotSuite cloud scheduling; Telegram bots cannot schedule messages directly.');
        Logger.info('[DotShare] Starting Telegram share...');
        Logger.info(`[DotShare] Chat ID: ${chatId}`);
        Logger.info(`[DotShare] Post text: ${post.text.substring(0, 50)}...`);

        // Handle media if present
        if (post.media && post.media.length > 0) {
            Logger.info(`[DotShare] Media files: ${post.media.length}`);

            for (const mediaFile of post.media) {
                if (!fs.existsSync(mediaFile)) {
                    Logger.warn(`[DotShare] Media file not found: ${mediaFile}`);
                    throw new Error(`Telegram media file not found: ${path.basename(mediaFile)}`);
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

                }


                const mediaResponse = await axios.post(mediaUrl, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                });

                if (!mediaResponse.data.ok) {
                    throw new Error(`Telegram API error: ${mediaResponse.data.description}`);
                }

                const receipt = telegramReceipt(chatId, mediaResponse.data.result?.message_id);
                firstReceipt ??= receipt;
                onPublished?.(receipt);
                Logger.info(`[DotShare] Media sent successfully: ${mediaResponse.data.result.message_id}`);
            }
        } else {
            // Text-only post
            firstReceipt = await sendTextMessage(botToken, chatId, post.text);
            onPublished?.(firstReceipt);
        }

        const successMessage = 'Posted to Telegram successfully! 🦅🔥';
        Logger.info('[DotShare] Success: Post completed');
        if (callbacks?.onSuccess) {
            callbacks.onSuccess(successMessage);
        } else if (vscode) {
            vscode.window.showInformationMessage(successMessage);
        }
        return firstReceipt;
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

        if (callbacks?.onError) {
            callbacks.onError(errorMessage);
        } else if (vscode) {
            vscode.window.showErrorMessage(errorMessage);
        }
        throw new Error(errorMessage);
    }
}

// Helper function to send text messages
async function sendTextMessage(botToken: string, chatId: string, text: string): Promise<PublicationReceipt> {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    Logger.info('[DotShare] Sending text message');

    const payload = { chat_id: chatId, text };

    const response = await axios.post(url, payload);

    if (!response.data.ok) {
        throw new Error(`Telegram API error: ${response.data.description}`);
    }

    Logger.info(`[DotShare] Text sent successfully: ${response.data.result.message_id}`);
    return telegramReceipt(chatId, response.data.result?.message_id);
}

function telegramReceipt(chatId: string, messageId: unknown): PublicationReceipt {
    if (typeof messageId !== 'number' && typeof messageId !== 'string') throw new Error('Telegram returned no message ID; check the chat before retrying.');
    const id = String(messageId);
    const url = chatId.startsWith('@') ? `https://t.me/${chatId.slice(1)}/${id}`
        : chatId.startsWith('-100') ? `https://t.me/c/${chatId.slice(4)}/${id}` : undefined;
    return { id, ...(url && { url }) };
}
