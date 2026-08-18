import { generatePost, generateCustomContent, getAvailableModels } from '../deepseek';

jest.mock('../../utils/contextBuilder', () => ({
    buildProjectContext: jest.fn().mockResolvedValue({
        contextPrompt: 'Test context for DeepSeek',
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
            '#deepseek', '#ai', '#testing'
        ]),
        formatHashtags: jest.fn((tags) => tags.join(' '))
    }
}));

global.fetch = jest.fn();

describe('DeepSeek AI Provider', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global.fetch as jest.Mock).mockClear();
    });

    describe('generatePost', () => {
        it('should generate a post with DeepSeek API', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: {
                                content: 'This is a test response from DeepSeek-V3'
                            }
                        }
                    ]
                })
            });

            const result = await generatePost('test-api-key', 'deepseek-chat');
            
            expect(result).not.toBeNull();
            expect(result?.text).toBeDefined();
            expect(result?.text).toContain('This is a test response from DeepSeek-V3');
            expect(result?.text).toContain('#deepseek');
        });

        it('should return null when context is not available', async () => {
            const { buildProjectContext } = require('../../utils/contextBuilder');
            buildProjectContext.mockResolvedValueOnce(null);

            const result = await generatePost('test-api-key', 'deepseek-chat');
            expect(result).toBeNull();
        });

        it('should handle API errors gracefully', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            });

            await expect(generatePost('invalid-key', 'deepseek-chat')).rejects.toThrow();
        });

        it('should throw when model is not specified', async () => {
            await expect(generatePost('test-api-key', '')).rejects.toThrow();
        });
    });

    describe('generateCustomContent', () => {
        it('should execute a custom prompt and return trimmed content', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: {
                                content: '🚀 Custom release post from DeepSeek  '
                            }
                        }
                    ]
                })
            });

            const content = await generateCustomContent('test-api-key', 'Write a release post', {
                model: 'deepseek-chat',
                maxTokens: 1000
            });

            expect(content).toBe('🚀 Custom release post from DeepSeek');
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.deepseek.com/chat/completions',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-api-key'
                    })
                })
            );
        });

        it('should throw when API returns non-ok status', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            await expect(generateCustomContent('key', 'prompt', { model: 'deepseek-chat' })).rejects.toThrow();
        });

        it('should throw when model is not provided', async () => {
            await expect(generateCustomContent('key', 'prompt', { model: '' })).rejects.toThrow();
        });
    });

    describe('getAvailableModels', () => {
        it('should return empty array when no API key is provided', async () => {
            const models = await getAvailableModels('');
            expect(models).toEqual([]);
        });

        it('should fetch and return model IDs from DeepSeek API', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'deepseek-v4-flash' },
                        { id: 'deepseek-v4-pro' }
                    ]
                })
            });

            const models = await getAvailableModels('test-api-key');
            expect(models).toContain('deepseek-v4-flash');
            expect(models).toContain('deepseek-v4-pro');
        });

        it('should return empty array on API failure', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 500
            });

            const models = await getAvailableModels('test-api-key');
            expect(models).toEqual([]);
        });
    });
});
