import { generatePost, getAvailableModels } from '../openai';

jest.mock('../../utils/contextBuilder', () => ({
    buildProjectContext: jest.fn().mockResolvedValue({
        contextPrompt: 'Test context for OpenAI',
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
            '#gpt', '#ai', '#testing'
        ]),
        formatHashtags: jest.fn((tags) => tags.join(' '))
    }
}));

// Create shared mock instances
const mockResponseCreate = jest.fn().mockResolvedValue({
    output_text: 'This is a test response from GPT-4o'
});

const mockList = jest.fn().mockResolvedValue({
    data: [
        { id: 'gpt-4o', created: 1700000000 },
        { id: 'gpt-4o-mini', created: 1699000000 },
        { id: 'gpt-4-turbo', created: 1698000000 }
    ]
});

jest.mock('openai', () => {
    return jest.fn().mockImplementation(() => ({
        responses: {
            create: mockResponseCreate
        },
        models: {
            list: mockList
        }
    }));
});

describe('OpenAI Provider', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('generatePost', () => {
        it('should generate a post with OpenAI API', async () => {
            const result = await generatePost('test-api-key', 'gpt-4o');
            
            expect(result).not.toBeNull();
            expect(result?.text).toBeDefined();
            expect(result?.text).toContain('This is a test response from GPT-4o');
            expect(result?.text).toContain('#gpt');
        });

        it('should return null when context is not available', async () => {
            const { buildProjectContext } = require('../../utils/contextBuilder');
            buildProjectContext.mockResolvedValueOnce(null);

            const result = await generatePost('test-api-key', 'gpt-4o');
            
            expect(result).toBeNull();
        });

        it('should handle API errors gracefully', async () => {
            mockResponseCreate.mockRejectedValueOnce(new Error('API Error'));

            await expect(generatePost('invalid-key', 'gpt-4o')).rejects.toThrow();
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

        it('should fetch and sort models from API', async () => {
            const models = await getAvailableModels('valid-api-key');
            
            expect(models).toContain('gpt-4o');
            expect(models[0]).toBe('gpt-4o'); // Most recent should be first
        });

        it('should filter only text GPT and reasoning models', async () => {
            const models = await getAvailableModels('valid-api-key');
            
            expect(models.every(m => 
                m.startsWith('gpt-') || /^o\d/.test(m)
            )).toBeTruthy();
        });

        it('should return empty array on API error', async () => {
            mockList.mockRejectedValueOnce(new Error('API Error'));

            const models = await getAvailableModels('test-key');
            
            expect(models).toEqual([]);
        });
    });
});
