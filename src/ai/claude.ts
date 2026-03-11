import * as vscode from 'vscode';
import Anthropic from '@anthropic-ai/sdk';
import { PostData } from '../types';
import { HashtagService } from '../services/HashtagService';
import { buildProjectContext } from '../utils/contextBuilder';

export async function generatePost(apiKey: string, modelName = 'claude-sonnet-4-6'): Promise<PostData | null> {
    const context = await buildProjectContext();
    if (!context) return null;

    const client = new Anthropic({ apiKey });
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

export async function getAvailableModels(apiKey: string): Promise<string[]> {
    if (!apiKey) return ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'];

    try {
        const client = new Anthropic({ apiKey });
        const response = await client.models.list();
        const models = response.data.map(m => m.id);
        return models.length > 0 ? models : ['claude-sonnet-4-6'];
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Claude fetch models error: ${errorMessage}`);
        return ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'];
    }
}