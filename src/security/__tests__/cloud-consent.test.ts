import type * as vscode from 'vscode';
import { SchedulerClient } from '../../services/SchedulerClient';
import { DotShareAuth } from '../../services/DotShareAuth';

it('does not read or upload any credentials without cloud consent', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const get = jest.fn();
    const token = jest.spyOn(DotShareAuth, 'getToken').mockResolvedValue('private-session-token');
    try {
        await SchedulerClient.syncLocalCredentials({ globalState: { get: () => false }, secrets: { get } } as unknown as vscode.ExtensionContext, ['devto', 'telegram']);
        expect(get).not.toHaveBeenCalled();
        expect(token).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    } finally { fetchMock.mockRestore(); token.mockRestore(); }
});

it('needs separate consent before uploading a Mastodon token', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const token = jest.spyOn(DotShareAuth, 'getToken').mockResolvedValue('private-session-token');
    const secrets = { get: async (key: string) => key === 'mastodonInstance' ? 'https://mastodon.example/' : 'private-mastodon-token' };
    const contextWith = (mastodonConsent: boolean | undefined) => ({
        globalState: { get: (key: string) => key === 'dotshare.cloudMastodonConsentGiven' ? mastodonConsent : true },
        secrets,
    } as unknown as vscode.ExtensionContext);
    try {
        await SchedulerClient.syncLocalCredentials(contextWith(undefined), ['mastodon']);
        await SchedulerClient.syncLocalCredentials(contextWith(false), ['mastodon']);
        expect(fetchMock).not.toHaveBeenCalled();

        await SchedulerClient.syncLocalCredentials(contextWith(true), ['mastodon']);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
            platform: 'mastodon',
            token: 'https://mastodon.example::private-mastodon-token',
        });
    } finally { fetchMock.mockRestore(); token.mockRestore(); }
});

it('uploads a selected platform only after consent and sign-in', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const token = jest.spyOn(DotShareAuth, 'getToken').mockResolvedValue('private-session-token');
    try {
        await SchedulerClient.syncLocalCredentials({ globalState: { get: () => true }, secrets: { get: async key => key === 'devtoApiKey' ? 'private-devto-key' : undefined } } as unknown as vscode.ExtensionContext, ['devto']);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, request] = fetchMock.mock.calls[0];
        expect(String(url).startsWith('https://')).toBe(true);
        expect(JSON.parse(request.body as string)).toEqual({ platform: 'devto', token: 'private-devto-key' });
    } finally { fetchMock.mockRestore(); token.mockRestore(); }
});
