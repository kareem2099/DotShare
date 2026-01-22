import axios from 'axios';
import { Logger } from './utils/Logger';

export interface DiscordPostData {
    text: string;
    media?: string[];
}

export async function shareToDiscord(webhookUrl: string, postData: DiscordPostData): Promise<string> {
    try {
        const headers = {
            'Content-Type': 'application/json'
        };

        const webhookPayload: Record<string, unknown> = {
            content: postData.text
        };

        // Add embeds for better formatting if no media
        if (!postData.media || postData.media.length === 0) {
            webhookPayload.embeds = [{
                description: postData.text,
                color: 0x5865f2 // Discord brand color
            }];
            delete webhookPayload.content; // Remove content if using embeds
        }

        // Discord webhooks support media attachments
        if (postData.media && postData.media.length > 0) {
            // Note: For full media support, we'd need to upload files to Discord
            // For now, add them as file attachments (simplified implementation)
            Logger.info('Media attachments for Discord not fully implemented yet - posting text only');

            // Alternative: Add image URLs in embeds if they're accessible URLs
            if (postData.media.length === 1 && postData.media[0].startsWith('http')) {
                webhookPayload.embeds = [{
                    image: { url: postData.media[0] },
                    description: postData.text,
                    color: 0x5865f2
                }];
                delete webhookPayload.content;
            }
        }

        await axios.post(webhookUrl, webhookPayload, { headers });

        // Discord returns 204 No Content on success, so we return a success message
        return 'Discord message sent successfully';
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const axiosError = error as { response?: { data?: { message?: string } } };
        const apiMessage = axiosError.response?.data?.message;
        Logger.error('Error posting to Discord:', apiMessage || errorMessage);
        throw new Error(apiMessage || 'Failed to post to Discord');
    }
}

export async function validateDiscordWebhook(webhookUrl: string): Promise<boolean> {
    try {
        // Test the webhook by sending a minimal payload
        const headers = {
            'Content-Type': 'application/json'
        };

        const testPayload = {
            content: "Testing webhook connection...",
            flags: 4 // Suppress notifications for test
        };

        const response = await axios.post(webhookUrl, testPayload, { headers });
        return response.status === 204;
    } catch (error) {
        return false;
    }
}

export async function getDiscordWebhookInfo(webhookUrl: string): Promise<{name: string, channelId: string, guildId: string} | null> {
    try {
        const response = await axios.get(webhookUrl);
        return {
            name: response.data.name,
            channelId: response.data.channel_id,
            guildId: response.data.guild_id
        };
    } catch (error) {
        Logger.error('Error getting Discord webhook info:', error);
        return null;
    }
}
