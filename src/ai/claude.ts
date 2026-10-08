import * as vscode from 'vscode';
import Anthropic from '@anthropic-ai/sdk';
import { PostData, GenerateContentOptions } from '../types';
import { HashtagService } from '../services/HashtagService';
import { buildProjectContext } from '../utils/contextBuilder';
import { Logger } from '../utils/Logger';
import { GenerationError, requireGeneratedText } from './GenerationError';

export async function generatePost(apiKey: string, modelName: string): Promise<PostData | null> {
    if (!modelName) throw new Error('Claude model is required.');
    const context = await buildProjectContext();
    if (!context) return null;

    const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
    try {
        const message = await client.messages.create({
            model: modelName,
            max_tokens: 300,
            messages: [{ role: 'user', content: context.contextPrompt }]
        });

        const generatedText = message.content[0]?.type === 'text' ? message.content[0].text : '';

        context.hashtagContext.postContent = generatedText;
        const platform = vscode.workspace.getConfiguration('dotshare').get<string>('defaultPlatform', 'twitter');

        let postText = generatedText.trim();
        if (HashtagService.supportsHashtags(platform)) {
            const hashtags = await HashtagService.generateHashtags(context.hashtagContext, platform, 5);
            postText = `${postText}\n\n${HashtagService.formatHashtags(hashtags)}`.trim();
        }

        return {
            text: postText,
            media: undefined
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        let detailedMessage = `Claude API Error: ${errorMessage}`;
        if (errorMessage?.includes('quota')) {
            detailedMessage = 'API quota exceeded. Check your Claude API usage.';
        } else if (errorMessage?.includes('key')) {
            detailedMessage = 'Invalid API key. Please check your Claude API key.';
        } else if (errorMessage?.includes('model')) {
            detailedMessage = 'Model not available. Try a different Claude model.';
        }

        vscode.window.showErrorMessage(detailedMessage);
        throw error;
    }
}

/**
 * Executes a custom prompt directly using Claude
 */
export async function generateCustomContent(
    apiKey: string,
    prompt: string,
    options?: GenerateContentOptions
): Promise<string> {
    const model = options?.model;
    if (!model) {
        throw new Error('Claude model is required.');
    }

    const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
    try {
        const message = await client.messages.create({
            model: model,
            max_tokens: options?.maxTokens || 2000,
            messages: [{ role: 'user', content: prompt }]
        });
        if (message.stop_reason === 'max_tokens') throw new GenerationError('Claude returned an incomplete article.', true);
        if (message.stop_reason === 'refusal') throw new GenerationError('Claude did not generate the requested article.');
        return requireGeneratedText(message.content.filter(block => block.type === 'text').map(block => block.text).join('\n'));
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('Claude generateCustomContent error', errorMessage);
        throw error;
    }
}

export async function getAvailableModels(apiKey: string): Promise<string[]> {
    if (!apiKey) {
        return [];
    }

    try {
        const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
        const response = await client.models.list();
        return response.data.map(m => m.id);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('Claude fetch models error', errorMessage);
        return [];
    }
}