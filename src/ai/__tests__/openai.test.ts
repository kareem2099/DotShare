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
        generateHashtags: jest.fn().mockResolvedValue([
            '#gpt', '#ai', '#testing'
        ]),
        formatHashtags: jest.fn((tags) => tags.join(' '))
    }
}));

// Create shared mock instances
const mockCreate = jest.fn().mockResolvedValue({
    choices: [
        {
            message: {
                content: 'This is a test response from GPT-4o'
            }
        }
    ]
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
        chat: {
            completions: {
                create: mockCreate
            }
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
                'gpt-4o',
                'gpt-4o-mini',
                'gpt-4-turbo'
            ]));
        });

        it('should fetch and sort models from API', async () => {
            const models = await getAvailableModels('valid-api-key');
            
            expect(models).toContain('gpt-4o');
            expect(models[0]).toBe('gpt-4o'); // Most recent should be first
        });

        it('should filter only GPT models', async () => {
            const models = await getAvailableModels('valid-api-key');
            
            expect(models.every(m => 
                m.includes('gpt') || m.includes('o1') || m.includes('o3') || m.includes('o4')
            )).toBeTruthy();
        });

        it('should return default models on API error', async () => {
            mockList.mockRejectedValueOnce(new Error('API Error'));

            const models = await getAvailableModels('test-key');
            
            expect(models).toContain('gpt-4o');
        });
    });
});
