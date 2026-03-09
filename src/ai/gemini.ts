import * as vscode from 'vscode';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PostData, GeminiModelsResponse } from '../types';
import { HashtagService } from '../services/HashtagService';
import { buildProjectContext } from '../utils/contextBuilder';

export async function generatePost(geminiKey: string, modelName = 'gemini-3.0-flash'): Promise<PostData | null> {
    const context = await buildProjectContext();
    if (!context) return null;

    const model = new GoogleGenerativeAI(geminiKey).getGenerativeModel({ model: modelName });

    try {
        const result = await model.generateContent(context.contextPrompt);
        const generatedText = result.response.text();

        context.hashtagContext.postContent = generatedText;
        const platform = vscode.workspace.getConfiguration('dotshare').get<string>('defaultPlatform', 'twitter');
        const hashtagSuggestions = await HashtagService.generateHashtags(context.hashtagContext, platform, 5);
        const formattedHashtags = HashtagService.formatHashtags(hashtagSuggestions);

        const finalPost = `${generatedText.trim()}\n\n${formattedHashtags}`.trim();

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

export async function getAvailableModels(apiKey: string): Promise<string[]> {
    if (!apiKey) {
        return ['gemini-3.0-flash', 'gemini-3.0-pro'];
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

        if (!response.ok) {
            throw new Error(`API Request failed with status: ${response.status}`);
        }

        const data = await response.json() as GeminiModelsResponse;

        const models = data.models
            .filter(
                model =>
                    model.supportedGenerationMethods?.includes('generateContent') &&
                    model.name.includes('gemini')
            )
            .map(model => model.name.replace('models/', ''));

        return models.length > 0 ? models : ['gemini-3.0-flash'];
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Gemini API Error fetching models: ${errorMessage}`);

        return ['gemini-3.0-flash', 'gemini-3.0-pro'];
    }
}