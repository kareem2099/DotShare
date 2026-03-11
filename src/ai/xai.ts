import * as vscode from 'vscode';
import { PostData, XAIResponse, XAIModelsResponse } from '../types';
import { HashtagService } from '../services/HashtagService';
import { buildProjectContext } from '../utils/contextBuilder';

export async function generatePost(apiKey: string, model = 'grok-2-latest'): Promise<PostData | null> {
    const context = await buildProjectContext();
    if (!context) return null;

    try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
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

export async function getAvailableModels(apiKey: string): Promise<string[]> {
    if (!apiKey) return ['grok-3', 'grok-3-mini', 'grok-2-latest'];

    try {
        const response = await fetch('https://api.x.ai/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const data = await response.json() as XAIModelsResponse;
        const models = data.data.filter(m => m.id.includes('grok')).map(m => m.id);

        return models.length > 0 ? models : ['grok-3', 'grok-3-mini', 'grok-2-latest'];
    } catch (error) {
        console.error('xAI fetch models error:', error);
        return ['grok-3', 'grok-3-mini', 'grok-2-latest'];
    }
}
