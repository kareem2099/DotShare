import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { HistoryService } from '../services/HistoryService';
import { AnalyticsService } from '../services/AnalyticsService';
import { MediaService } from '../services/MediaService';
import { MessageHandler } from '../handlers/MessageHandler';
import { ScheduledPostsStorage } from '../core/scheduled-posts';

export class DotShareProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'dotshareView';
    private _view?: vscode.WebviewView;
    private _historyService: HistoryService;
    private _analyticsService: AnalyticsService;
    private _mediaService: MediaService;
    private _messageHandler?: MessageHandler;
    // Keep scheduler logic here or move to a separate service later
    private _scheduledPostsStorage!: ScheduledPostsStorage;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this._historyService = new HistoryService(_context.globalState);
        this._analyticsService = new AnalyticsService();
        this._mediaService = new MediaService(_context);

        const storagePath = _context.globalStorageUri
            ? _context.globalStorageUri.fsPath
            : path.join(_context.extensionPath, 'storage');
        this._scheduledPostsStorage = new ScheduledPostsStorage(storagePath);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        void _context;
        void _token;
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Instantiate Handler
        this._messageHandler = new MessageHandler(
            webviewView,
            this._context,
            this._historyService,
            this._analyticsService,
            this._mediaService
        );

        // Receive Message
        webviewView.webview.onDidReceiveMessage(async (data) => {
            if (this._messageHandler) await this._messageHandler.handleMessage(data);
        });

        // Load initial data
        this._messageHandler.handleMessage({ command: 'loadPostHistory' });
        this._messageHandler.handleMessage({ command: 'loadConfiguration' });
    }

    // Send Message to Webview
    public postMessage(message: Record<string, unknown>): void {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    // Tells the handler to refresh and push the latest configuration to the WebView
    public reloadConfiguration(): void {
        if (this._messageHandler) {
            this._messageHandler.handleMessage({ command: 'loadConfiguration' });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const indexPath = path.join(this._extensionUri.fsPath, 'media', 'index.html');
        try {
            let html = fs.readFileSync(indexPath, 'utf-8');

            const nonce = getNonce();
            const csp = [
                `default-src 'none'`,
                `style-src ${webview.cspSource} 'unsafe-inline'`,
                `script-src 'nonce-${nonce}'`,
                `img-src ${webview.cspSource} data: blob: https:`,
                `font-src ${webview.cspSource}`,
                `connect-src ${webview.cspSource} https: http:`,
            ].join('; ');

            const cssUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'assets', 'style.css')
            );
            const jsUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'app.js')
            );

            html = html.replace(/\{\{CSP\}\}/g, csp);
            html = html.replace(/\{\{NONCE\}\}/g, nonce);
            html = html.replace('./assets/style.css', cssUri.toString());
            html = html.replace('./app.js', jsUri.toString());

            return html;
        } catch (e) {
            return `<h1>Error: ${e}</h1>`;
        }
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
