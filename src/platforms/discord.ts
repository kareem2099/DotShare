import axios from 'axios';
import { discordWebhookUrl } from '../security/http';
import { Logger } from '../utils/Logger';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { PublicationObserver } from './runtime';

export interface DiscordPostData {
    text: string;
    media?: string[];
}

export async function shareToDiscord(webhookUrl: string, postData: DiscordPostData, onPublished?: PublicationObserver): Promise<string> {
    try {
        const headers = {
            'Content-Type': 'application/json'
        };

        const webhookPayload: Record<string, unknown> = {
            content: postData.text
        };
        const media = postData.media || [];
        if (media.length > 10) throw new Error('Discord supports at most 10 attachments.');
        const remoteImages = media.filter(ref => /^https:\/\//i.test(ref));
        const localFiles = media.filter(ref => !/^https:\/\//i.test(ref));
        for (const ref of remoteImages) {
            const imageUrl = new URL(ref);
            if (imageUrl.username || imageUrl.password) throw new Error('Image URLs must not contain credentials.');
        }
        if (remoteImages.length) webhookPayload.embeds = remoteImages.map(ref => ({ image: { url: ref } }));

        // Add embeds for better formatting if no media
        if (!postData.media || postData.media.length === 0) {
            webhookPayload.embeds = [{
                description: postData.text,
                color: 0x5865f2 // Discord brand color
            }];
            delete webhookPayload.content; // Remove content if using embeds
        }

        // Wait for the persisted message so callers receive a real receipt.
        const url = new URL(discordWebhookUrl(webhookUrl));
        url.searchParams.set('wait', 'true');
        webhookPayload.allowed_mentions = { parse: [] };
        let body: FormData | Record<string, unknown> = webhookPayload;
        if (localFiles.length) {
            const form = new FormData();
            form.append('payload_json', JSON.stringify(webhookPayload));
            localFiles.forEach((file, i) => form.append(`files[${i}]`, fs.readFileSync(file), path.basename(file)));
            body = form;
        }
        const response = await axios.post(url.href, body, {
            headers: body instanceof FormData ? body.getHeaders() : headers,
            timeout: 60000, maxRedirects: 0,
        });
        if (!response.data?.id || !response.data?.channel_id) throw new Error('Discord returned no message ID; check the channel before retrying.');
        const messageUrl = `https://discord.com/channels/${response.data.guild_id || '@me'}/${response.data.channel_id}/${response.data.id}`;
        onPublished?.({ id: response.data.id, url: messageUrl });

        return messageUrl;
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
        const response = await axios.get(discordWebhookUrl(webhookUrl), { maxRedirects: 0, timeout: 10000 });
        return response.status === 200;
    } catch {
        return false;
    }
}

export async function getDiscordWebhookInfo(webhookUrl: string): Promise<{name: string, channelId: string, guildId: string} | null> {
    try {
        const response = await axios.get(discordWebhookUrl(webhookUrl), { maxRedirects: 0, timeout: 10000 });
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
