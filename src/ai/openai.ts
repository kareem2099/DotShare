import * as vscode from 'vscode';
import OpenAI from 'openai';
import { PostData, GenerateContentOptions } from '../types';
import { HashtagService } from '../services/HashtagService';
import { buildProjectContext } from '../utils/contextBuilder';
import { Logger } from '../utils/Logger';

export async function generatePost(apiKey: string, model: string): Promise<PostData | null> {
    if (!model) throw new Error('OpenAI model is required.');
    const context = await buildProjectContext();
    if (!context) return null;

    const openai = new OpenAI({ apiKey });
    try {
        const response = await openai.responses.create({
            model: model,
            input: context.contextPrompt,
            max_output_tokens: 300
        });

        const generatedText = (response.output_text || '').trim();

        context.hashtagContext.postContent = generatedText;
        const platform = vscode.workspace.getConfiguration('dotshare').get<string>('defaultPlatform', 'twitter');

        let postText = generatedText;
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
        let detailedMessage = `OpenAI API Error: ${errorMessage}`;
        if (errorMessage?.includes('quota')) {
            detailedMessage = 'API quota exceeded. Check your OpenAI credit balance.';
        } else if (errorMessage?.includes('key')) {
            detailedMessage = 'Invalid API key. Please check your OpenAI API key.';
        } else if (errorMessage?.includes('model')) {
            detailedMessage = 'Model not available. Try a different ChatGPT model.';
        }

        vscode.window.showErrorMessage(detailedMessage);
        throw error;
    }
}

/**
 * Executes a custom prompt directly using OpenAI
 */
export async function generateCustomContent(
    apiKey: string,
    prompt: string,
    options?: GenerateContentOptions
): Promise<string> {
    const model = options?.model;
    if (!model) {
        throw new Error('OpenAI model is required.');
    }
    const openai = new OpenAI({ apiKey });

    try {
        const response = await openai.responses.create({
            model,
            input: prompt,
            max_output_tokens: options?.maxTokens || 2000
        });
        return (response.output_text || '').trim();
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('OpenAI generateCustomContent error', errorMessage);
        throw error;
    }
}

export async function getAvailableModels(apiKey: string): Promise<string[]> {
    if (!apiKey) {
        return [];
    }

    try {
        const openai = new OpenAI({ apiKey });
        const models = await openai.models.list();
        const blocked = [
            'audio', 'realtime', 'transcribe', 'tts', 'image', 'embedding',
            'moderation', 'sora', 'whisper', 'dall-e', 'codex', 'search',
            'deep-research', 'computer-use'
        ];
        return models.data
            .filter(model => {
                const id = model.id.toLowerCase();
                const isTextModel = id.startsWith('gpt-') || /^o\d/.test(id);
                const isBlocked = blocked.some(term => id.includes(term));
                return isTextModel && !isBlocked;
            })
            .sort((a, b) => (b.created || 0) - (a.created || 0))
            .map(model => model.id);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('OpenAI fetch models error', errorMessage);
        return [];
    }
}
