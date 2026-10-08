const mockOpenAI = jest.fn();
const mockClaude = jest.fn();
const mockGemini = jest.fn();
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ responses: { create: mockOpenAI } })));
jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({ messages: { create: mockClaude } })));
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn().mockImplementation(() => ({ models: { generateContent: mockGemini } })) }));
import { generateCustomContent as openai } from '../openai';
import { generateCustomContent as claude } from '../claude';
import { generateCustomContent as gemini } from '../gemini';
import { generateCustomContent as deepseek } from '../deepseek';
import { generateCustomContent as xai } from '../xai';

const options = { model: 'test-model', maxTokens: 6000 };
const originalFetch = global.fetch;
beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn(); });
afterAll(() => { global.fetch = originalFetch; });

it('rejects incomplete OpenAI output and accepts only completed nonempty text', async () => {
    mockOpenAI.mockResolvedValueOnce({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: 'Partial' });
    await expect(openai('fake-key', 'prompt', options)).rejects.toMatchObject({ retryWithMoreTokens: true });
    mockOpenAI.mockResolvedValueOnce({ status: 'completed', output_text: '' });
    await expect(openai('fake-key', 'prompt', options)).rejects.toThrow('no article text');
    mockOpenAI.mockResolvedValueOnce({ status: 'completed', output_text: 'Complete article' });
    await expect(openai('fake-key', 'prompt', options)).resolves.toBe('Complete article');
});

it('collects Claude text blocks after thinking blocks and detects its token limit', async () => {
    mockClaude.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'First' }, { type: 'text', text: 'Second' }] });
    await expect(claude('fake-key', 'prompt', options)).resolves.toBe('First\nSecond');
    mockClaude.mockResolvedValueOnce({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Partial' }] });
    await expect(claude('fake-key', 'prompt', options)).rejects.toMatchObject({ retryWithMoreTokens: true });
});

it('rejects Gemini truncation and accepts a completed candidate', async () => {
    mockGemini.mockResolvedValueOnce({ candidates: [{ finishReason: 'MAX_TOKENS' }], text: 'Partial' });
    await expect(gemini('fake-key', 'prompt', options)).rejects.toMatchObject({ retryWithMoreTokens: true });
    mockGemini.mockResolvedValueOnce({ candidates: [{ finishReason: 'STOP' }], text: 'Complete' });
    await expect(gemini('fake-key', 'prompt', options)).resolves.toBe('Complete');
});

it.each([['DeepSeek', deepseek], ['xAI', xai]])('detects incomplete and empty %s completion responses', async (_name, generate) => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: 'Partial' } }] }) });
    await expect(generate('fake-key', 'prompt', options)).rejects.toMatchObject({ retryWithMoreTokens: true });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [] }) });
    await expect(generate('fake-key', 'prompt', options)).rejects.toThrow('no article text');
});
