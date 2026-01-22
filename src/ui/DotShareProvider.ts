import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { HistoryService } from '../services/HistoryService';
import { AnalyticsService } from '../services/AnalyticsService';
import { MediaService } from '../services/MediaService';
import { MessageHandler } from '../handlers/MessageHandler';
import { ScheduledPostsStorage } from '../scheduled-posts';

export class DotShareProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'dotshareView';
    private _view?: vscode.WebviewView;
    private _historyService: HistoryService;
    private _analyticsService: AnalyticsService;
    private _mediaService: MediaService;
    // Keep scheduler logic here or move to a separate service later
    private _scheduledPostsStorage!: ScheduledPostsStorage;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this._historyService = new HistoryService(_context.globalState);
        this._analyticsService = new AnalyticsService();
        this._mediaService = new MediaService(_context);

        // Initialize simple storage for scheduler
        // (You can keep the initialization logic from original file or move it to a util)
        const storagePath = _context.globalStorageUri ? _context.globalStorageUri.fsPath : path.join(_context.extensionPath, 'storage');
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
        const handler = new MessageHandler(
            webviewView,
            this._context,
            this._historyService,
            this._analyticsService,
            this._mediaService
        );

        // Receive Message
        webviewView.webview.onDidReceiveMessage(async (data) => {
            await handler.handleMessage(data);
        });

        // Load initial data
        handler.handleMessage({ command: 'loadPostHistory' });
        handler.handleMessage({ command: 'loadConfiguration' });
        // Add scheduler loading here if needed
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const indexPath = path.join(this._extensionUri.fsPath, 'media', 'index.html');
        // ... (Same HTML loading logic as before) ...
        try {
            let html = fs.readFileSync(indexPath, 'utf-8');
            const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'assets', 'style.css'));
            const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'app.js'));
            html = html.replace('./assets/style.css', cssUri.toString());
            html = html.replace('./app.js', jsUri.toString());
            return html;
        } catch (e) {
            return `Error loading HTML: ${e}`;
        }
    }
}
