import * as vscode from 'vscode';
import * as path from 'path';
import { setImmediate } from 'timers';
import { PublishingLibraryPanel } from '../../ui/PublishingLibraryPanel';
import { LibraryClient } from '../client';

const mockSnapshot = jest.fn(async () => ({ accounts: [], drafts: [], templates: [], connection: { home: '/private/shared-library', config: '/private/config.toml', tools: [] } }));
const mockCall = jest.fn(async () => ({ success: true, data: {} }));
const mockDispose = jest.fn(async () => undefined);
jest.mock('../client', () => ({ LibraryClient: jest.fn().mockImplementation(() => ({ snapshot: mockSnapshot, call: mockCall, dispose: mockDispose })) }));
const mockOpen = jest.fn(async () => false);
jest.mock('../../services/PreviewLinkService', () => ({ openArticlePreviewLink: (url: unknown) => mockOpen(url) }));
let receive: (message: unknown) => void;
let changed: (event: { affectsConfiguration(value: string): boolean }) => void;
let close: () => void;
let post: jest.Mock;
let panel: { webview: { html: string; options?: unknown; cspSource: string; postMessage: jest.Mock; asWebviewUri(uri: { fsPath: string }): unknown; onDidReceiveMessage: jest.Mock }; reveal: jest.Mock; onDidChangeViewState: jest.Mock; onDidDispose: jest.Mock; dispose(): void };
let context: vscode.ExtensionContext;
beforeEach(() => {
    mockSnapshot.mockClear(); mockCall.mockReset(); mockCall.mockResolvedValue({ success: true, data: {} }); mockDispose.mockClear(); mockOpen.mockClear();
    post = jest.fn(async () => true);
    panel = { webview: { html: '', cspSource: 'vscode-webview://test', postMessage: post,
        asWebviewUri: uri => ({ toString: () => `vscode-resource:${uri.fsPath}` }),
        onDidReceiveMessage: jest.fn(callback => { receive = callback; return { dispose() {} }; }) },
        reveal: jest.fn(), onDidChangeViewState: jest.fn(() => ({ dispose() {} })), onDidDispose: jest.fn(callback => { close = callback; }), dispose: () => close() };
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(panel);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: () => '' });
    Object.assign(vscode.Uri, { joinPath: (base: { fsPath: string }, ...parts: string[]) => ({ fsPath: path.join(base.fsPath, ...parts) }) });
    Object.assign(vscode.workspace, { onDidChangeConfiguration: jest.fn(callback => { changed = callback; return { dispose() {} }; }) });
    Object.assign(vscode.window, { showOpenDialog: jest.fn(async () => [{ fsPath: '/chosen/image.png' }]) });
    context = { extensionUri: { fsPath: path.resolve(__dirname, '../../..') }, subscriptions: [] } as unknown as vscode.ExtensionContext;
});
afterEach(() => { close?.(); });
async function send(message: Record<string, unknown>): Promise<void> { receive({ command: 'libraryRequest', id: 'test-request', ...message }); await new Promise<void>(resolve => setImmediate(resolve)); }
it('opens one shared library panel with a nonce CSP and no implicit publication', async () => {
    PublishingLibraryPanel.show(context); PublishingLibraryPanel.show(context);
    expect(panel.reveal).toHaveBeenCalled(); expect(panel.webview.html).toContain("default-src 'none'");
    expect(panel.webview.html).not.toContain('{{CSP}}'); expect(panel.webview.html).not.toContain('unsafe-inline');
    expect(panel.webview.html).toContain('media/library/app.js');
    await send({ operation: 'snapshot' }); expect(mockSnapshot).toHaveBeenCalledTimes(1); expect(mockCall).not.toHaveBeenCalled();
});
it('forwards the selected preview revision and stable publication ID without changing them', async () => {
    PublishingLibraryPanel.show(context);
    const args = { draftId: 'draft', expectedRevision: 7, previewId: 'reviewed-preview', requestId: 'stable-request' };
    await send({ operation: 'tool', tool: 'publish_draft', args }); expect(mockCall).toHaveBeenCalledTimes(1); expect(mockCall).toHaveBeenCalledWith('publish_draft', args);
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ command: 'libraryResult', id: 'test-request', success: true }));
});
it('retains structured invalid-preview data for the UI and rejects malformed bridge arguments', async () => {
    PublishingLibraryPanel.show(context); mockCall.mockResolvedValueOnce({ success: false, data: { draft: { status: 'Draft', validation: { errors: ['Missing account'] } } } });
    await send({ operation: 'tool', tool: 'preview_draft', args: { draftId: 'draft', expectedRevision: 1 } });
    expect(JSON.stringify(post.mock.calls)).toContain('Missing account');
    mockCall.mockClear(); await send({ operation: 'tool', tool: 'publish_draft', args: [] }); expect(mockCall).not.toHaveBeenCalled();
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ success: false, error: 'Invalid library request.' }));
});
it('chooses local image paths without uploading, saving credentials or expanding media roots', async () => {
    PublishingLibraryPanel.show(context); await send({ operation: 'pickImages' });
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ data: { paths: ['/chosen/image.png'] } }));
    expect(mockCall).not.toHaveBeenCalled();
});
it('uses the safe link opener and reports a refusal without another opener', async () => {
    PublishingLibraryPanel.show(context); await send({ operation: 'openLink', url: 'https://example.com/receipt' });
    expect(mockOpen).toHaveBeenCalledWith('https://example.com/receipt'); expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ data: { opened: false } }));
});
it('notifies the view of external/config changes and disposes the child client', () => {
    PublishingLibraryPanel.show(context);
    const callback = (LibraryClient as jest.Mock).mock.calls.at(-1)[1]; callback();
    expect(post).toHaveBeenLastCalledWith({ command: 'libraryChanged' });
    changed({ affectsConfiguration: key => key === 'dotshare.library' }); expect(post).toHaveBeenLastCalledWith({ command: 'libraryReconnectRequired' });
    close(); expect(mockDispose).toHaveBeenCalled();
});
