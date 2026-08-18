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
        supportsHashtags: jest.fn().mockReturnValue(true),
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

            const result = await generatePost('test-api-key', 'grok-2-latest');
            
            expect(result).toBeNull();
        });

        it('should handle HTTP errors gracefully', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            });

            await expect(generatePost('invalid-key', 'grok-2-latest')).rejects.toThrow();
        });

        it('should handle network errors gracefully', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));

            await expect(generatePost('test-key', 'grok-2-latest')).rejects.toThrow();
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

        it('should fetch models from xAI language-models API when key is provided', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'grok-3', output_modalities: ['text'] },
                        { id: 'grok-3-mini', output_modalities: ['text'] },
                        { id: 'grok-2-latest', output_modalities: ['text'] }
                    ]
                })
            });

            const models = await getAvailableModels('valid-api-key');
            
            expect(models).toContain('grok-3');
            expect(models).toContain('grok-3-mini');
            expect(models).toContain('grok-2-latest');
        });

        it('should filter only models supporting text output', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'grok-3', output_modalities: ['text'] },
                        { id: 'grok-image-gen', output_modalities: ['image'] }
                    ]
                })
            });

            const models = await getAvailableModels('valid-api-key');
            
            expect(models).toContain('grok-3');
            expect(models).not.toContain('grok-image-gen');
        });

        it('should return empty array on API error', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));

            const models = await getAvailableModels('test-key');
            
            expect(models).toEqual([]);
        });

        it('should return empty array on HTTP error', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 500
            });

            const models = await getAvailableModels('test-key');
            
            expect(models).toEqual([]);
        });
    });
});
