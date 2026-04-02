import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { HistoryService } from '../services/HistoryService';
import { AnalyticsService } from '../services/AnalyticsService';
import { MediaService } from '../services/MediaService';
import { MessageHandler } from '../handlers/MessageHandler';
import { Logger } from '../utils/Logger';

/**
 * DotShareWebView — Opens as a full editor tab for Post or Analytics.
 * 
 * The sidebar (DotShareProvider) stays as the main hub.
 * This WebView is opened when the user clicks "Create Post" or "Analytics"
 * from a platform card in the sidebar.
 */
export class DotShareWebView {
    public static readonly viewType = 'dotshare.mainPanel';
    private static _panel: vscode.WebviewPanel | undefined;
    private static _context: vscode.ExtensionContext | undefined;
    private static _messageHandler?: MessageHandler;

    private constructor(private readonly _context: vscode.ExtensionContext) {}

    public static createOrShow(context: vscode.ExtensionContext, page = 'post', options?: any): void {
        DotShareWebView._context = context;

        // If panel already exists, reveal it and navigate to the page
        if (DotShareWebView._panel) {
            DotShareWebView._panel.reveal(vscode.ViewColumn.One);
            DotShareWebView._panel.webview.postMessage({ command: 'navigate', page, options });
            return;
        }

        // Create the panel
        const panel = vscode.window.createWebviewPanel(
            DotShareWebView.viewType,
            `DotShare — ${page === 'post' ? 'Create Post' : 'Analytics'}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [context.extensionUri],
            }
        );

        DotShareWebView._panel = panel;

        // Set HTML
        panel.webview.html = DotShareWebView._buildHtml(panel.webview, context.extensionUri);

        // Wire up services
        const historyService   = new HistoryService(context.globalState);
        const analyticsService = new AnalyticsService();
        const mediaService     = new MediaService(context);

        // Create a shim for MessageHandler (it expects WebviewView, not WebviewPanel)
        const shim = {
            webview: panel.webview,
            show: () => panel.reveal(),
            get visible() { return panel.visible; },
        } as unknown as vscode.WebviewView;

        DotShareWebView._messageHandler = new MessageHandler(shim, context, historyService, analyticsService, mediaService);

        // Receive messages from the WebView
        panel.webview.onDidReceiveMessage(
            async (data) => { await DotShareWebView._messageHandler!.handleMessage(data); },
            undefined,
            context.subscriptions
        );

        // Load initial data
        DotShareWebView._messageHandler.handleMessage({ command: 'loadConfiguration' });
        DotShareWebView._messageHandler.handleMessage({ command: 'loadPostHistory' });

        // Navigate to the requested page
        setTimeout(() => {
            panel.webview.postMessage({ command: 'navigate', page, options });
        }, 200);

        // Cleanup on close
        panel.onDidDispose(
            () => {
                DotShareWebView._panel = undefined;
                DotShareWebView._messageHandler = undefined;
                Logger.info('[DotShareWebView] Panel disposed.');
            },
            undefined,
            context.subscriptions
        );

        Logger.info(`[DotShareWebView] Panel created for page: ${page}`);
    }

    /**
     * Post a message to the active panel (for URI handler, scheduler, etc.)
     */
    public static postMessage(message: Record<string, unknown>): void {
        if (DotShareWebView._panel) {
            DotShareWebView._panel.webview.postMessage(message);
        }
    }

    /**
     * Tells the handler to refresh and push the latest configuration to the WebView
     */
    public static reloadConfiguration(): void {
        if (DotShareWebView._messageHandler) {
            DotShareWebView._messageHandler.handleMessage({ command: 'loadConfiguration' });
        }
    }

    /**
     * Build the HTML for the webview.
     */
    private static _buildHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
        const indexPath = path.join(extensionUri.fsPath, 'media', 'webview', 'index.html');

        const styleUri  = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'app.js'));

        const nonce = getNonce();
        const csp = [
            `default-src 'none'`,
            `style-src ${webview.cspSource} 'unsafe-inline'`,
            `script-src 'nonce-${nonce}'`,
            `img-src ${webview.cspSource} data: blob: https:`,
            `font-src ${webview.cspSource}`,
            `connect-src ${webview.cspSource} https: http:`,
        ].join('; ');

        try {
            let html = fs.readFileSync(indexPath, 'utf-8');
            html = html.replace(/\{\{CSP\}\}/g,       csp);
            html = html.replace(/\{\{NONCE\}\}/g,      nonce);
            html = html.replace(/\{\{STYLE_URI\}\}/g,  styleUri.toString());
            html = html.replace(/\{\{SCRIPT_URI\}\}/g, scriptUri.toString());
            return html;
        } catch (err) {
            Logger.error('[DotShareWebView] Failed to read index.html:', err);
            return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>DotShare Error</title></head>
<body style="font-family:monospace;padding:2rem;color:#f88;">
  <h2>DotShare failed to load</h2>
  <pre>${String(err)}</pre>
  <p>Make sure <code>media/webview/index.html</code> exists.</p>
</body></html>`;
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