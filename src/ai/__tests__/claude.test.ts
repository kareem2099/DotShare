import { generatePost, getAvailableModels } from '../claude';
import * as vscode from 'vscode';

// Mock the dependencies
jest.mock('vscode');
jest.mock('../../utils/contextBuilder', () => ({
    buildProjectContext: jest.fn().mockResolvedValue({
        contextPrompt: 'Test context for Claude',
        hashtagContext: {
            postContent: 'Test post content',
            projectType: 'typescript'
        }
    })
}));

jest.mock('../../services/HashtagService', () => ({
    HashtagService: {
        generateHashtags: jest.fn().mockResolvedValue([
            '#claude', '#ai', '#testing'
        ]),
        formatHashtags: jest.fn((tags) => tags.join(' '))
    }
}));

// Create shared mock instances
const mockCreate = jest.fn().mockResolvedValue({
    content: [
        {
            type: 'text',
            text: 'This is a test response from Claude'
        }
    ]
});

const mockList = jest.fn().mockResolvedValue({
    data: [
        { id: 'claude-opus-4-6' },
        { id: 'claude-sonnet-4-6' },
        { id: 'claude-haiku-4-5' }
    ]
});

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
        models: { list: mockList }
    }));
});

describe('Claude AI Provider', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('generatePost', () => {
        it('should generate a post with Claude API', async () => {
            const result = await generatePost('test-api-key', 'claude-sonnet-4-6');
            
            expect(result).not.toBeNull();
            expect(result?.text).toBeDefined();
            expect(result?.text).toContain('This is a test response from Claude');
            expect(result?.text).toContain('#claude');
        });

        it('should return null when context is not available', async () => {
            const { buildProjectContext } = require('../../utils/contextBuilder');
            buildProjectContext.mockResolvedValueOnce(null);

            const result = await generatePost('test-api-key');
            
            expect(result).toBeNull();
        });

        it('should handle API errors gracefully', async () => {
            mockCreate.mockRejectedValueOnce(new Error('API Error'));

            await expect(generatePost('invalid-key')).rejects.toThrow();
        });

        it('should use default model when not specified', async () => {
            const result = await generatePost('test-api-key');
            
            expect(result).not.toBeNull();
            expect(result?.text).toBeDefined();
        });
    });

    describe('getAvailableModels', () => {
        it('should return default models when no API key provided', async () => {
            const models = await getAvailableModels('');
            
            expect(models).toEqual(expect.arrayContaining([
                'claude-sonnet-4-6',
                'claude-opus-4-6',
                'claude-haiku-4-5'
            ]));
        });

        it('should fetch models from API when key is provided', async () => {
            const models = await getAvailableModels('valid-api-key');
            
            expect(models).toContain('claude-opus-4-6');
            expect(models).toContain('claude-sonnet-4-6');
            expect(models).toContain('claude-haiku-4-5');
        });

        it('should return default models on API error', async () => {
            const Anthropic = require('@anthropic-ai/sdk');
            const mockInstance = Anthropic().models.list;
            mockInstance.mockRejectedValueOnce(new Error('API Error'));

            const models = await getAvailableModels('test-key');
            
            expect(models).toContain('claude-sonnet-4-6');
        });
    });
});
