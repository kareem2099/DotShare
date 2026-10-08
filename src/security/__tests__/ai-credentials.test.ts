import { PostHandler } from '../../handlers/PostHandler';
import { getAvailableModels } from '../../ai/deepseek';

jest.mock('../../ai/deepseek', () => ({ getAvailableModels: jest.fn(), generatePost: jest.fn(), generateCustomContent: jest.fn() }));

function fixture() {
    const keys = new Map([['deepseekApiKey', 'stored-private-ai-key']]);
    const state = new Map();
    const context = { secrets: {
        get: jest.fn(async key => keys.get(key)), store: jest.fn(async (key, value) => { keys.set(key, value); }),
    }, globalState: {
        get: jest.fn(key => state.get(key)), update: jest.fn(async (key, value) => { state.set(key, value); }),
    } };
    const messages: Array<{ command: string; hasSavedKey?: boolean }> = [];
    const dependencies = [{ webview: { postMessage: msg => messages.push(msg) } }, context, {}, {}, {}, {}] as unknown as ConstructorParameters<typeof PostHandler>;
    const handler = new PostHandler(...dependencies);
    return { handler, context, keys, messages };
}

it('loads models using the saved key without returning it to the webview', async () => {
    const f = fixture();
    (getAvailableModels as jest.Mock).mockResolvedValue(['deepseek-chat']);
    await f.handler.handleMessage({ command: 'fetchAiModels', provider: 'deepseek', apiKey: '', requestId: 7 });
    expect(getAvailableModels).toHaveBeenCalledWith('stored-private-ai-key');
    expect(f.messages).toContainEqual({ command: 'aiModelsLoaded', provider: 'deepseek', models: ['deepseek-chat'], hasSavedKey: true, requestId: 7 });
    expect(JSON.stringify(f.messages)).not.toContain('stored-private-ai-key');
});

it('does not label a trial key as saved before it is applied', async () => {
    const f = fixture(); f.keys.clear();
    (getAvailableModels as jest.Mock).mockResolvedValue(['deepseek-chat']);
    await f.handler.handleMessage({ command: 'fetchAiModels', provider: 'deepseek', apiKey: 'new-unapplied-key' });
    expect(f.messages[0].hasSavedKey).toBe(false);
    expect(f.keys.size).toBe(0);
});

it('applies a model with an empty UI field while keeping the secure key', async () => {
    const f = fixture();
    await f.handler.handleMessage({ command: 'applyModelSelection', provider: 'deepseek', apiKey: '', model: 'deepseek-chat' });
    expect(f.keys.get('deepseekApiKey')).toBe('stored-private-ai-key');
    expect(f.messages[0]).toEqual({ command: 'aiModelSelectionApplied', provider: 'deepseek', model: 'deepseek-chat', hasSavedKey: true });
});

it('stores a replacement before acknowledging saved status', async () => {
    const f = fixture();
    await f.handler.handleMessage({ command: 'applyModelSelection', provider: 'deepseek', apiKey: 'replacement-private-key', model: 'deepseek-chat' });
    expect(f.keys.get('deepseekApiKey')).toBe('replacement-private-key');
    expect(f.messages[0].hasSavedKey).toBe(true);
    expect(JSON.stringify(f.messages)).not.toContain('replacement-private-key');
});

it('does not acknowledge a failed key write', async () => {
    const f = fixture(); f.context.secrets.store.mockRejectedValue(new Error('OS keyring locked'));
    await f.handler.handleMessage({ command: 'applyModelSelection', provider: 'deepseek', apiKey: 'unsaved-private-key', model: 'deepseek-chat' });
    expect(f.messages.some(msg => msg.command === 'aiModelSelectionApplied')).toBe(false);
    expect(f.keys.get('deepseekApiKey')).toBe('stored-private-ai-key');
});
