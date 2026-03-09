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
        generateHashtags: jest.fn().mockResolvedValue([
            '#gemini', '#google', '#testing'
        ]),
        formatHashtags: jest.fn((tags) => tags.join(' '))
    }
}));

// Create shared mock instances
const mockGenerateContent = jest.fn().mockResolvedValue({
    response: {
        text: jest.fn().mockReturnValue('This is a test response from Gemini')
    }
});

// Mock the Google Generative AI SDK
jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
            generateContent: mockGenerateContent
        })
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
            const result = await generatePost('test-api-key', 'gemini-3.0-flash');
            
            expect(result).not.toBeNull();
            expect(result?.text).toBeDefined();
            expect(result?.text).toContain('This is a test response from Gemini');
            expect(result?.text).toContain('#gemini');
        });

        it('should return null when context is not available', async () => {
            const { buildProjectContext } = require('../../utils/contextBuilder');
            buildProjectContext.mockResolvedValueOnce(null);

            const result = await generatePost('test-api-key');
            
            expect(result).toBeNull();
        });

        it('should handle API errors gracefully', async () => {
            mockGenerateContent.mockRejectedValueOnce(new Error('API Error'));

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
                'gemini-3.0-flash',
                'gemini-3.0-pro'
            ]));
        });

        it('should fetch models from API when key is provided', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    models: [
                        {
                            name: 'models/gemini-3.0-flash',
                            supportedGenerationMethods: ['generateContent']
                        },
                        {
                            name: 'models/gemini-3.0-pro',
                            supportedGenerationMethods: ['generateContent']
                        }
                    ]
                })
            });

            const models = await getAvailableModels('valid-api-key');
            
            expect(models).toContain('gemini-3.0-flash');
            expect(models).toContain('gemini-3.0-pro');
        });

        it('should filter only generateContent models', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    models: [
                        {
                            name: 'models/gemini-3.0-flash',
                            supportedGenerationMethods: ['generateContent']
                        }
                    ]
                })
            });

            const models = await getAvailableModels('valid-api-key');
            
            expect(models).toContain('gemini-3.0-flash');
        });

        it('should return default models on API error', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));

            const models = await getAvailableModels('test-key');
            
            expect(models).toContain('gemini-3.0-flash');
        });

        it('should handle non-ok API responses', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 400
            });

            const models = await getAvailableModels('test-key');
            
            expect(models).toContain('gemini-3.0-flash');
        });
    });
});
