import type * as vscode from 'vscode';
import { DotShareAuth } from '../DotShareAuth';

jest.mock('../../utils/Logger', () => ({ Logger: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(),
} }));

const context = { secrets: {
    get: jest.fn(async () => `ds_prod_${'a'.repeat(48)}`),
    store: jest.fn(), delete: jest.fn(),
} } as unknown as vscode.ExtensionContext;
const originalFetch = global.fetch;

beforeEach(async () => {
    await DotShareAuth.logout(context);
});
afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
});

it('refreshes the cached Free tier after a purchase can have occurred', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const fetchMock = jest.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ tier: 'free' })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ tier: 'pro' })));
    global.fetch = fetchMock;
    expect((await DotShareAuth.getTierInfo(context))?.tier).toBe('free');
    expect((await DotShareAuth.getTierInfo(context))?.tier).toBe('free');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(61001);
    expect((await DotShareAuth.getTierInfo(context))?.tier).toBe('pro');
    expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('does not retain the previous account tier when a new token cannot fetch billing', async () => {
    global.fetch = jest.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ tier: 'max' })))
        .mockResolvedValue(new Response('', { status: 503 }));
    expect((await DotShareAuth.getTierInfo(context))?.tier).toBe('max');
    await DotShareAuth.storeToken(context, `ds_prod_${'b'.repeat(48)}`);
    expect(await DotShareAuth.getTierInfo(context)).toBeNull();
});
