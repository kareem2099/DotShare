import { generatePost, getAvailableModels } from '../claude';

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
        supportsHashtags: jest.fn().mockReturnValue(true),
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

            const result = await generatePost('test-api-key', 'claude-sonnet-4-6');

            expect(result).toBeNull();
        });

        it('should handle API errors gracefully', async () => {
            mockCreate.mockRejectedValueOnce(new Error('API Error'));

            await expect(generatePost('invalid-key', 'claude-sonnet-4-6')).rejects.toThrow();
        });

        it('should throw when model is not specified', async () => {
            await expect(generatePost('test-api-key', '')).rejects.toThrow();
        });
    });

    describe('getAvailableModels', () => {
        it('should return empty array when no API key provided', async () => {
            const models = await getAvailableModels('');
            expect(models).toEqual([]);
        });

        it('should fetch models from API when key is provided', async () => {
            const models = await getAvailableModels('valid-api-key');
            
            expect(models).toContain('claude-opus-4-6');
            expect(models).toContain('claude-sonnet-4-6');
        });

        it('should return empty array on API error', async () => {
            const Anthropic = require('@anthropic-ai/sdk');
            const mockInstance = Anthropic().models.list;
            mockInstance.mockRejectedValueOnce(new Error('API Error'));

            const models = await getAvailableModels('test-key');
            
            expect(models).toEqual([]);
        });
    });
});
