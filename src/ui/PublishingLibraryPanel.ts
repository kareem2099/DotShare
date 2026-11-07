import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { LibraryClient } from '../library/client';
import { LibraryTool } from '../library/contracts';
import { redactSensitiveText } from '../security/redaction';
import { openArticlePreviewLink } from '../services/PreviewLinkService';

export class PublishingLibraryPanel {
    private static current?: PublishingLibraryPanel;
    private client: LibraryClient;
    private readonly subscriptions: vscode.Disposable[] = [];
    static show(context: vscode.ExtensionContext): void {
        if (this.current) { this.current.panel.reveal(); return; }
        const panel = vscode.window.createWebviewPanel('dotshare.publishingLibrary', 'DotShare: Publishing Library', vscode.ViewColumn.One, {
            enableScripts: true, retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media', 'library')],
        });
        this.current = new PublishingLibraryPanel(panel, context);
    }
    private constructor(private readonly panel: vscode.WebviewPanel, private readonly context: vscode.ExtensionContext) {
        this.client = this.newClient();
        panel.webview.html = this.html();
        panel.webview.onDidReceiveMessage(message => void this.handle(message), undefined, this.subscriptions);
        panel.onDidChangeViewState(event => { if (event.webviewPanel.visible) void panel.webview.postMessage({ command: 'libraryChanged' }); }, undefined, this.subscriptions);
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('dotshare.library')) void panel.webview.postMessage({ command: 'libraryReconnectRequired' });
        }, undefined, this.subscriptions);
        panel.onDidDispose(() => {
            PublishingLibraryPanel.current = undefined;
            void this.client.dispose(); this.subscriptions.forEach(subscription => subscription.dispose());
        }, undefined, context.subscriptions);
        context.subscriptions.push(panel);
    }
    private newClient(): LibraryClient {
        const file = vscode.workspace.getConfiguration('dotshare.library').get<string>('clientConfigPath') || undefined;
        return new LibraryClient(file, () => { void this.panel.webview.postMessage({ command: 'libraryChanged' }); });
    }
    private async handle(message: unknown): Promise<void> {
        if (!message || typeof message !== 'object') return;
        const request = message as Record<string, unknown>;
        if (request.command !== 'libraryRequest' || typeof request.id !== 'string' || request.id.length > 100) return;
        try {
            let data: unknown;
            switch (request.operation) {
                case 'snapshot': data = await this.client.snapshot(); break;
                case 'reconnect': await this.client.dispose(); this.client = this.newClient(); data = await this.client.snapshot(); break;
                case 'tool': {
                    if (typeof request.tool !== 'string' || !request.args || typeof request.args !== 'object' || Array.isArray(request.args)) throw new Error('Invalid library request.');
                    data = await this.client.call(request.tool as LibraryTool, request.args as Record<string, unknown>); break;
                }
                case 'openLink': data = { opened: await openArticlePreviewLink(request.url) }; break;
                case 'pickImages': {
                    const files = await vscode.window.showOpenDialog({ title: 'Choose images for this draft', canSelectFiles: true, canSelectFolders: false, canSelectMany: true, filters: { Images: ['png', 'jpg', 'jpeg', 'webp'] } });
                    data = { paths: files?.map(file => file.fsPath) || [] }; break;
                }
                case 'settings': await vscode.commands.executeCommand('workbench.action.openSettings', 'dotshare.library'); data = {}; break;
                default: throw new Error('Unsupported library action.');
            }
            await this.panel.webview.postMessage({ command: 'libraryResult', id: request.id, success: true, data });
        } catch (error) {
            const text = error instanceof Error ? error.message : 'Library request failed.';
            await this.panel.webview.postMessage({ command: 'libraryResult', id: request.id, success: false, error: redactSensitiveText(text) });
        }
    }
    private html(): string {
        const root = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'library');
        const nonce = randomBytes(24).toString('base64');
        const replacements: Record<string, string> = {
            CSP: `default-src 'none'; style-src ${this.panel.webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${this.panel.webview.cspSource};`,
            NONCE: nonce,
            STYLE_URI: this.panel.webview.asWebviewUri(vscode.Uri.joinPath(root, 'style.css')).toString(),
            SCRIPT_URI: this.panel.webview.asWebviewUri(vscode.Uri.joinPath(root, 'app.js')).toString(),
        };
        return fs.readFileSync(path.join(root.fsPath, 'index.html'), 'utf8').replace(/{{(CSP|NONCE|STYLE_URI|SCRIPT_URI)}}/g, (_match, key: string) => replacements[key]);
    }
}
