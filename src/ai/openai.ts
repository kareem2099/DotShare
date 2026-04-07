import * as vscode from 'vscode';
import OpenAI from 'openai';
import { PostData } from '../types';
import { HashtagService } from '../services/HashtagService';
import { buildProjectContext } from '../utils/contextBuilder';
import { Logger } from '../utils/Logger';

export async function generatePost(apiKey: string, model = 'gpt-4o'): Promise<PostData | null> {
    const context = await buildProjectContext();
    if (!context) return null;

    const openai = new OpenAI({ apiKey });
    try {
        const completion = await openai.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: context.contextPrompt }],
            max_tokens: 300
        });

        const generatedText = completion.choices[0]?.message?.content || '';

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

export async function getAvailableModels(apiKey: string): Promise<string[]> {
    if (!apiKey) return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3', 'o1'];

    try {
        const openai = new OpenAI({ apiKey });
        const models = await openai.models.list();
        // Sort by created date descending to get latest first
        const sortedModels = models.data.sort((a, b) => (b.created || 0) - (a.created || 0));
        const gptModels = sortedModels
            .filter(m => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3') || m.id.includes('o4'))
            .map(m => m.id);
        return gptModels.length > 0 ? gptModels : ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3', 'o1'];
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('OpenAI fetch models error', errorMessage);
        return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3', 'o1'];
    }
}
