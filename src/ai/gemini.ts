import * as vscode from 'vscode';
import { GoogleGenAI } from '@google/genai';
import { PostData, GeminiModelsResponse, GenerateContentOptions } from '../types';
import { HashtagService } from '../services/HashtagService';
import { buildProjectContext } from '../utils/contextBuilder';
import { Logger } from '../utils/Logger';

export async function generatePost(geminiKey: string, modelName: string): Promise<PostData | null> {
    if (!modelName) throw new Error('Gemini model is required.');
    const context = await buildProjectContext();
    if (!context) return null;

    const ai = new GoogleGenAI({ apiKey: geminiKey });

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: context.contextPrompt,
            config: {
                maxOutputTokens: 300
            }
        });
        const generatedText = (response.text || '').trim();

        context.hashtagContext.postContent = generatedText;
        const platform = vscode.workspace.getConfiguration('dotshare').get<string>('defaultPlatform', 'twitter');

        let finalPost = generatedText;
        if (HashtagService.supportsHashtags(platform)) {
            const hashtagSuggestions = await HashtagService.generateHashtags(context.hashtagContext, platform, 5);
            const formattedHashtags = HashtagService.formatHashtags(hashtagSuggestions);
            finalPost = `${finalPost}\n\n${formattedHashtags}`.trim();
        }

        return {
            text: finalPost,
            media: undefined
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        let detailedMessage = `Gemini API Error: ${errorMessage}`;
        if (errorMessage?.includes('quota')) {
            detailedMessage = 'API quota exceeded. Check your Gemini API usage.';
        } else if (errorMessage?.includes('key')) {
            detailedMessage = 'Invalid API key. Please check your Gemini API key.';
        }

        vscode.window.showErrorMessage(detailedMessage);
        throw error;
    }
}

/**
 * Executes a custom prompt directly using Gemini
 */
export async function generateCustomContent(
    geminiKey: string,
    prompt: string,
    options?: GenerateContentOptions
): Promise<string> {
    const model = options?.model;
    if (!model) {
        throw new Error('Gemini model is required.');
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    try {
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                maxOutputTokens: options?.maxTokens || 2000
            }
        });
        return (response.text || '').trim();
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('Gemini generateCustomContent error', errorMessage);
        throw error;
    }
}

export async function getAvailableModels(apiKey: string): Promise<string[]> {
    if (!apiKey) {
        return [];
    }

    try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
            headers: {
                'x-goog-api-key': apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`Gemini API Request failed with status: ${response.status}`);
        }

        const data = await response.json() as GeminiModelsResponse;
        const blockedModelTerms = [
            'image', 'tts', 'live', 'embedding', 'robotics', 'computer-use', 'omni'
        ];

        return (data.models || [])
            .filter(model => {
                const name = model.name.toLowerCase();
                return (
                    model.supportedGenerationMethods?.includes('generateContent') &&
                    name.startsWith('models/gemini-') &&
                    !blockedModelTerms.some(term => name.includes(term))
                );
            })
            .map(model => model.name.replace('models/', ''));
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('Gemini API Error fetching models', errorMessage);
        return [];
    }
}