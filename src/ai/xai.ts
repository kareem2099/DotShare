import * as vscode from 'vscode';
import { PostData, XAIResponse, GenerateContentOptions } from '../types';
import { HashtagService } from '../services/HashtagService';
import { buildProjectContext } from '../utils/contextBuilder';
import { Logger } from '../utils/Logger';
import { GenerationError, requireGeneratedText } from './GenerationError';

export async function generatePost(apiKey: string, model: string): Promise<PostData | null> {
    if (!model) throw new Error('xAI model is required.');
    const context = await buildProjectContext();
    if (!context) return null;

    try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(90_000),
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: context.contextPrompt }],
                max_tokens: 300
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as XAIResponse;
        const generatedText = data.choices?.[0]?.message?.content || '';

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
        let detailedMessage = `xAI API Error: ${errorMessage}`;
        if (errorMessage.includes('401')) {
            detailedMessage = 'Invalid xAI API key. Please check your credentials.';
        } else if (errorMessage.includes('429')) {
            detailedMessage = 'xAI API rate limit exceeded. Please try again later.';
        } else if (errorMessage.includes('fetch')) {
            detailedMessage = 'Network error connecting to xAI API. Check internet connection.';
        }

        vscode.window.showErrorMessage(detailedMessage);
        throw error;
    }
}

/**
 * Executes a custom prompt directly using xAI Grok
 */
export async function generateCustomContent(
    apiKey: string,
    prompt: string,
    options?: GenerateContentOptions
): Promise<string> {
    const model = options?.model;
    if (!model) {
        throw new Error('xAI model is required.');
    }

    try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(90_000),
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: options?.maxTokens || 2000
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as XAIResponse;
        const choice = data.choices?.[0];
        if (choice?.finish_reason === 'length') throw new GenerationError('xai returned an incomplete article.', true);
        if (choice?.finish_reason && choice.finish_reason !== 'stop') throw new GenerationError('xai did not complete the article.');
        return requireGeneratedText(choice?.message?.content);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('xAI generateCustomContent error', errorMessage);
        throw error;
    }
}

export async function getAvailableModels(apiKey: string): Promise<string[]> {
    if (!apiKey) {
        return [];
    }

    try {
        const response = await fetch('https://api.x.ai/v1/language-models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`xAI language models request failed: ${response.status}`);
        }

        const data = await response.json() as {
            data: Array<{
                id: string;
                input_modalities?: string[];
                output_modalities?: string[];
            }>;
        };

        return (data.data || [])
            .filter(model => model.output_modalities?.includes('text'))
            .map(model => model.id);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('xAI fetch models error', errorMessage);
        return [];
    }
}
