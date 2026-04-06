import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { HistoryService } from '../services/HistoryService';
import { AnalyticsService } from '../services/AnalyticsService';
import { MediaService } from '../services/MediaService';
import { MessageHandler } from '../handlers/MessageHandler';
import { Logger } from '../utils/Logger';
import { getPlatformConfig, PlatformConfig } from '../platforms/platform-config';

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

    public static createOrShow(context: vscode.ExtensionContext, page = 'post', options?: Record<string, unknown>): void {
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
        const messageHandlerRef = DotShareWebView._messageHandler;
        panel.webview.onDidReceiveMessage(
            async (data) => {
                if (!messageHandlerRef) {
                    Logger.error('[DotShareWebView] Message handler not initialized');
                    return;
                }
                try {
                    await messageHandlerRef.handleMessage(data);
                } catch (error: unknown) {
                    const msg = error instanceof Error ? error.message : String(error);
                    Logger.error('[DotShareWebView] Message handler error:', msg);
                    panel.webview.postMessage({
                        command: 'status',
                        status: `Error: ${msg}`,
                        type: 'error'
                    });
                }
            },
            undefined,
            context.subscriptions
        );

        // Load initial data (fire and forget with error handling)
        DotShareWebView._messageHandler.handleMessage({ command: 'loadConfiguration' }).catch((error: unknown) => {
            const msg = error instanceof Error ? error.message : String(error);
            Logger.error('[DotShareWebView] Error loading configuration:', msg);
        });
        DotShareWebView._messageHandler.handleMessage({ command: 'loadPostHistory' }).catch((error: unknown) => {
            const msg = error instanceof Error ? error.message : String(error);
            Logger.error('[DotShareWebView] Error loading post history:', msg);
        });

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
     * Platform-specific post panel (threads / social / blogs from platform-config).
     */
    public static createPlatformPost(context: vscode.ExtensionContext, platformKey: string): void {
        const config = getPlatformConfig(platformKey);
        if (!config) {
            vscode.window.showErrorMessage(`Unknown platform: ${platformKey}`);
            return;
        }

        DotShareWebView._context = context;

        const panel = vscode.window.createWebviewPanel(
            `dotshare.platformPost.${platformKey}`,
            `${config.icon} Post to ${config.name}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [context.extensionUri],
            }
        );

        panel.webview.html = DotShareWebView._buildPlatformHtml(panel.webview, context.extensionUri, config, platformKey);

        const historyService = new HistoryService(context.globalState);
        const analyticsService = new AnalyticsService();
        const mediaService = new MediaService(context);

        const shim = {
            webview: panel.webview,
            show: () => panel.reveal(),
            get visible() { return panel.visible; },
        } as unknown as vscode.WebviewView;

        const messageHandler = new MessageHandler(shim, context, historyService, analyticsService, mediaService);

        panel.webview.onDidReceiveMessage(
            async (data) => {
                try {
                    await messageHandler.handleMessage(data);
                } catch (error: unknown) {
                    const msg = error instanceof Error ? error.message : String(error);
                    Logger.error(`[DotShareWebView] Message handler error (${platformKey}):`, msg);
                    panel.webview.postMessage({
                        command: 'status',
                        status: `Error: ${msg}`,
                        type: 'error'
                    });
                }
            },
            undefined,
            context.subscriptions
        );

        // Load initial data (fire and forget with error handling)
        messageHandler.handleMessage({ command: 'loadConfiguration' }).catch((error: unknown) => {
            const msg = error instanceof Error ? error.message : String(error);
            Logger.error(`[DotShareWebView] Error loading configuration (${platformKey}):`, msg);
        });
        messageHandler.handleMessage({ command: 'loadPostHistory' }).catch((error: unknown) => {
            const msg = error instanceof Error ? error.message : String(error);
            Logger.error(`[DotShareWebView] Error loading post history (${platformKey}):`, msg);
        });

        setTimeout(() => {
            panel.webview.postMessage({ command: 'navigate', page: 'post', options: { platform: platformKey } });
        }, 200);

        panel.onDidDispose(
            () => {
                Logger.info(`[DotShareWebView] Platform post panel disposed for: ${platformKey}`);
            },
            undefined,
            context.subscriptions
        );

        Logger.info(`[DotShareWebView] Platform post panel created for: ${platformKey}`);
    }

    private static _buildPlatformHtml(
        webview: vscode.Webview,
        extensionUri: vscode.Uri,
        config: PlatformConfig,
        platformKey: string
    ): string {
        const indexPath = path.join(extensionUri.fsPath, 'media', 'webview', 'platform-post.html');
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'style.css'));
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

        const threadsActive = config.workspaceType === 'threads' ? ' active' : '';
        const socialActive = config.workspaceType === 'social' ? ' active' : '';
        const blogsActive = config.workspaceType === 'blogs' ? ' active' : '';

        const isBlogPlatform = platformKey === 'devto' || platformKey === 'medium';
        const blogIntroText = isBlogPlatform
            ? (platformKey === 'devto'
                ? 'Read your current Markdown file, then publish to Dev.to. (Visibility: Draft/Published)'
                : 'Read your current Markdown file, then publish to Medium. (Visibility: Draft/Published/Unlisted)')
            : '';
        const blogSeriesFieldHtml =
            platformKey === 'devto'
                ? `            <div class="input-group">
              <label>Dev.to series name (optional)</label>
              <input type="text" id="blog-series" placeholder="Series slug as on Dev.to" />
            </div>`
                : `<div id="blog-series-placeholder"></div>`;
        const blogPublishCardHtml = isBlogPlatform
            ? (platformKey === 'devto'
                ? `          <div class="card-title">👨‍💻 Publish to Dev.to</div>
          <div class="input-group" style="margin-top:12px;">
            <label>Visibility</label>
            <select id="blog-publish-status">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>`
                : `          <div class="card-title">Ⓜ️ Publish to Medium</div>

          <div class="status-box warning" style="background: rgba(255, 165, 0, 0.1); border-left: 4px solid #ffa500; padding: 10px; margin-bottom: 12px; font-size: 11px; border-radius: 4px;">
            <strong>⚠️ Notice:</strong> Medium has restricted its API. If "Integration Tokens" is missing from your 
            <a href="https://medium.com/me/settings/publishing" target="_blank" style="color: var(--vscode-link-foreground);">Publishing Settings</a>, 
            you <u>must</u> email <code style="color: var(--vscode-textPreformat-foreground);">yourfriends@medium.com</code> to request manual activation.
          </div>

          <div class="input-group" style="margin-top:12px;">
            <label>Visibility</label>
            <select id="blog-publish-status">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="unlisted">Unlisted</option>
            </select>
          </div>`)
            : '';
        const blogPublishButtonText = isBlogPlatform
            ? (platformKey === 'devto' ? '🚀 Publish to Dev.to' : '🚀 Publish to Medium')
            : '🚀 Publish Article';

        try {
            let html = fs.readFileSync(indexPath, 'utf-8');
            html = html.replace(/\{\{CSP\}\}/g, csp);
            html = html.replace(/\{\{NONCE\}\}/g, nonce);
            html = html.replace(/\{\{STYLE_URI\}\}/g, styleUri.toString());
            html = html.replace(/\{\{SCRIPT_URI\}\}/g, scriptUri.toString());
            html = html.replace(/\{\{PLATFORM_KEY\}\}/g, platformKey);
            html = html.replace(/\{\{PLATFORM_NAME\}\}/g, config.name);
            html = html.replace(/\{\{PLATFORM_ICON\}\}/g, config.icon);
            html = html.replace(/\{\{MAX_CHARS\}\}/g, String(config.maxChars));
            html = html.replace(/\{\{WORKSPACE_TYPE\}\}/g, config.workspaceType);
            html = html.replace(/\{\{SUPPORTS_THREADS\}\}/g, String(config.supportsThreads));
            html = html.replace(/\{\{SUPPORTS_MEDIA\}\}/g, String(config.supportsMedia));
            html = html.replace(/\{\{CHAR_COUNT_METHOD\}\}/g, config.charCountMethod);
            html = html.replace(/\{\{THREADS_ACTIVE\}\}/g, threadsActive);
            html = html.replace(/\{\{SOCIAL_ACTIVE\}\}/g, socialActive);
            html = html.replace(/\{\{BLOGS_ACTIVE\}\}/g, blogsActive);
            html = html.replace(/\{\{BLOG_INTRO_TEXT\}\}/g, blogIntroText);
            html = html.replace(/\{\{BLOG_SERIES_FIELD_HTML\}\}/g, blogSeriesFieldHtml);
            html = html.replace(/\{\{BLOG_PUBLISH_CARD_HTML\}\}/g, blogPublishCardHtml);
            html = html.replace(/\{\{BLOG_PUBLISH_BUTTON_TEXT\}\}/g, blogPublishButtonText);
            return html;
        } catch (err) {
            Logger.error('[DotShareWebView] Failed to read platform-post.html:', err);
            return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>DotShare Error</title></head>
<body style="font-family:monospace;padding:2rem;color:#f88;">
  <h2>DotShare failed to load platform post</h2>
  <pre>${String(err)}</pre>
</body></html>`;
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