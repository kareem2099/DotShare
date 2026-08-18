import { generatePost, getAvailableModels } from '../gemini';

jest.mock('../../utils/contextBuilder', () => ({
    buildProjectContext: jest.fn().mockResolvedValue({
        contextPrompt: 'Test context for Gemini',
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
            '#gemini', '#google', '#testing'
        ]),
        formatHashtags: jest.fn((tags) => tags.join(' '))
    }
}));

// Create shared mock instances
const mockGenerateContent = jest.fn().mockResolvedValue({
    text: 'This is a test response from Gemini'
});

// Mock @google/genai SDK
jest.mock('@google/genai', () => ({
    GoogleGenAI: jest.fn().mockImplementation(() => ({
        models: {
            generateContent: mockGenerateContent
        }
    }))
}));

// Mock the fetch API for model listing
global.fetch = jest.fn();

describe('Gemini AI Provider', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global.fetch as jest.Mock).mockClear();
    });

    describe('generatePost', () => {
        it('should generate a post with Gemini API', async () => {
            const result = await generatePost('test-api-key', 'gemini-2.5-flash');

            expect(result).not.toBeNull();
            expect(result?.text).toBeDefined();
            expect(result?.text).toContain('This is a test response from Gemini');
            expect(result?.text).toContain('#gemini');
        });

        it('should return null when context is not available', async () => {
            const { buildProjectContext } = require('../../utils/contextBuilder');
            buildProjectContext.mockResolvedValueOnce(null);

            const result = await generatePost('test-api-key', 'gemini-2.5-flash');

            expect(result).toBeNull();
        });

        it('should handle API errors gracefully', async () => {
            mockGenerateContent.mockRejectedValueOnce(new Error('API Error'));

            await expect(generatePost('invalid-key', 'gemini-2.5-flash')).rejects.toThrow();
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
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    models: [
                        {
                            name: 'models/gemini-2.5-flash',
                            supportedGenerationMethods: ['generateContent']
                        },
                        {
                            name: 'models/gemini-2.5-pro',
                            supportedGenerationMethods: ['generateContent']
                        }
                    ]
                })
            });

            const models = await getAvailableModels('valid-api-key');

            expect(models).toContain('gemini-2.5-flash');
            expect(models).toContain('gemini-2.5-pro');
        });

        it('should filter only generateContent and non-blocked models', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    models: [
                        {
                            name: 'models/gemini-2.5-flash',
                            supportedGenerationMethods: ['generateContent']
                        },
                        {
                            name: 'models/gemini-embedding-001',
                            supportedGenerationMethods: ['generateContent']
                        }
                    ]
                })
            });

            const models = await getAvailableModels('valid-api-key');

            expect(models).toContain('gemini-2.5-flash');
            expect(models).not.toContain('gemini-embedding-001');
        });

        it('should return empty array on API error', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));

            const models = await getAvailableModels('test-key');

            expect(models).toEqual([]);
        });

        it('should handle non-ok API responses', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 400
            });

            const models = await getAvailableModels('test-key');

            expect(models).toEqual([]);
        });
    });
});
