import { generatePost, getAvailableModels } from '../xai';

jest.mock('../../utils/contextBuilder', () => ({
    buildProjectContext: jest.fn().mockResolvedValue({
        contextPrompt: 'Test context for xAI',
        hashtagContext: {
            postContent: 'Test post content',
            projectType: 'typescript'
        }
    })
}));

jest.mock('../../services/HashtagService', () => ({
    HashtagService: {
        generateHashtags: jest.fn().mockResolvedValue([
            '#grok', '#xai', '#testing'
        ]),
        formatHashtags: jest.fn((tags) => tags.join(' '))
    }
}));

// Mock the fetch API for xAI calls
global.fetch = jest.fn();

describe('xAI Provider', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global.fetch as jest.Mock).mockClear();
    });

    describe('generatePost', () => {
        it('should generate a post with xAI API', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: {
                                content: 'This is a test response from Grok'
                            }
                        }
                    ]
                })
            });

            const result = await generatePost('test-api-key', 'grok-2-latest');
            
            expect(result).not.toBeNull();
            expect(result?.text).toBeDefined();
            expect(result?.text).toContain('This is a test response from Grok');
            expect(result?.text).toContain('#grok');
        });

        it('should return null when context is not available', async () => {
            const { buildProjectContext } = require('../../utils/contextBuilder');
            buildProjectContext.mockResolvedValueOnce(null);

            const result = await generatePost('test-api-key');
            
            expect(result).toBeNull();
        });

        it('should handle HTTP errors gracefully', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            });

            await expect(generatePost('invalid-key')).rejects.toThrow();
        });

        it('should handle network errors gracefully', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));

            await expect(generatePost('test-key')).rejects.toThrow();
        });

        it('should use default model when not specified', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: {
                                content: 'Test response'
                            }
                        }
                    ]
                })
            });

            const result = await generatePost('test-api-key');
            
            expect(result).not.toBeNull();
            expect(result?.text).toBeDefined();
        });
    });

    describe('getAvailableModels', () => {
        it('should return default models when no API key provided', async () => {
            const models = await getAvailableModels('');
            
            expect(models).toEqual(expect.arrayContaining([
                'grok-3',
                'grok-3-mini',
                'grok-2-latest'
            ]));
        });

        it('should fetch models from xAI API when key is provided', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'grok-3' },
                        { id: 'grok-3-mini' },
                        { id: 'grok-2-latest' }
                    ]
                })
            });

            const models = await getAvailableModels('valid-api-key');
            
            expect(models).toContain('grok-3');
            expect(models).toContain('grok-3-mini');
            expect(models).toContain('grok-2-latest');
        });

        it('should filter only grok models', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'grok-3' },
                        { id: 'grok-3-mini' },
                        { id: 'other-model' }
                    ]
                })
            });

            const models = await getAvailableModels('valid-api-key');
            
            expect(models).toContain('grok-3');
            expect(models).not.toContain('other-model');
        });

        it('should return default models on API error', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));

            const models = await getAvailableModels('test-key');
            
            expect(models).toContain('grok-3');
        });

        it('should return default models on HTTP error', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 500
            });

            const models = await getAvailableModels('test-key');
            
            expect(models).toContain('grok-3');
        });
    });
});
