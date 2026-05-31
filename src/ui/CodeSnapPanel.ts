import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { CodeSnapService, CodeSnapData } from '../services/CodeSnapService';
import { MediaService } from '../services/MediaService';
import { Logger } from '../utils/Logger';
import { PLATFORM_CONFIGS } from '../platforms/platform-config';

/**
 * CodeSnapPanel
 *
 * Manages the CodeSnap WebviewPanel lifecycle.
 * One singleton panel at a time — re-uses the existing panel if already open.
 *
 * Key design decisions:
 *  - Zero native deps: rendering via HTML Canvas in the webview
 *  - Offline: HL.js & theme CSS served from local vendor/ via webview.asWebviewUri()
 *  - Race condition fix: webviewReady handshake instead of setTimeout
 *  - Two-way integration:
 *      Pull: Composer has a "📸 Add CodeSnap" button → opens this panel
 *      Push: "🚀 Share" button here → QuickPick platform → opens Composer with image attached
 */
export class CodeSnapPanel {
    public static readonly viewType = 'dotshare.codeSnap';

    private static _instance: CodeSnapPanel | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _context: vscode.ExtensionContext;
    private readonly _mediaService: MediaService;

    /** FIFO queue of snaps waiting for a Composer to fire webviewReady */
    private _pendingSnaps: Array<{ filePath: string; fileName: string }> = [];

    private constructor(
        panel: vscode.WebviewPanel,
        context: vscode.ExtensionContext,
        mediaService: MediaService,
    ) {
        this._panel        = panel;
        this._context      = context;
        this._mediaService = mediaService;

        // Set HTML content
        this._panel.webview.html = this._buildHtml();

        // Handle messages from the WebView
        this._panel.webview.onDidReceiveMessage(
            (msg) => this._handleMessage(msg),
            undefined,
            context.subscriptions,
        );

        // Cleanup on close
        this._panel.onDidDispose(
            () => { CodeSnapPanel._instance = undefined; },
            undefined,
            context.subscriptions,
        );
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Open (or focus) the CodeSnap panel and load the current selection.
     * Called from:
     *   - Right-click context menu
     *   - Editor title bar button (when editorHasSelection)
     *   - "📸 Add CodeSnap" button inside the Composer
     */
    public static open(context: vscode.ExtensionContext, mediaService: MediaService): void {
        const data = CodeSnapService.capture();

        if (!data) {
            vscode.window.showWarningMessage('DotShare CodeSnap: No active editor found.');
            return;
        }

        if (CodeSnapPanel._instance) {
            // Already open — just push new data and reveal
            CodeSnapPanel._instance._panel.reveal(vscode.ViewColumn.Beside);
            CodeSnapPanel._instance._sendData(data);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            CodeSnapPanel.viewType,
            '📸 CodeSnap',
            vscode.ViewColumn.Beside,
            {
                enableScripts:           true,
                retainContextWhenHidden: true,
                localResourceRoots:      [context.extensionUri],
            },
        );

        CodeSnapPanel._instance = new CodeSnapPanel(panel, context, mediaService);
        CodeSnapPanel._instance._sendData(data);
    }

    /**
     * Called by the `dotshare.attachSnapToComposer` command.
     * The Composer's webview will fire webviewReady when it mounts;
     * at that point we broadcast the pending image via DotShareWebView.postMessage().
     * This method is the deferred entry point — stores the snap path until the Composer is ready.
     */
    public static setPendingSnap(filePath: string, fileName: string): void {
        CodeSnapPanel._instance?._pendingSnaps.push({ filePath, fileName });
    }

    /**
     * Atomically reads and clears the pending snap.
     * Called by the `dotshare._composerReady` command the moment a Composer panel mounts.
     * Returns null if no snap is pending.
     */
    public static consumePendingSnap(): { filePath: string; fileName: string } | null {
        return CodeSnapPanel._instance?._pendingSnaps.shift() ?? null;
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private _sendData(data: CodeSnapData): void {
        this._panel.webview.postMessage({ command: 'loadCode', data });
    }

    private async _handleMessage(msg: { command: string; [key: string]: unknown }): Promise<void> {
        switch (msg.command) {

            // ── webviewReady: WebView mounted and ready ────────────────────────
            // (Not typically sent by the CodeSnap panel itself, but the Composer
            //  sends this. We handle it here only for completeness.)
            case 'webviewReady':
                Logger.info('[CodeSnapPanel] WebView reports ready');
                break;

            // ── snapReady: WebView finished rendering → save PNG ──────────────
            case 'snapReady': {
                try {
                    const base64Data = (msg.base64 as string).replace(/^data:image\/png;base64,/, '');
                    const fileName   = `codesnap-${Date.now()}.png`;

                    const savedPath = await this._mediaService.saveUploadedFile({
                        name:       fileName,
                        base64Data: base64Data,
                        size:       Math.floor(base64Data.length * 0.75),
                    });

                    Logger.info(`[CodeSnapPanel] Saved snap: ${savedPath}`);

                    // Post "saved" state back to the snap panel
                    this._panel.webview.postMessage({ command: 'snapSaved', filePath: savedPath });

                    // ── QuickPick: ask the user where to share ────────────────
                    const shareItems = this._buildPlatformQuickPick();
                    const selected   = await vscode.window.showQuickPick(shareItems, {
                        placeHolder: '📸 Where do you want to share this CodeSnap?',
                        matchOnDescription: true,
                    });

                    if (!selected) return; // user dismissed

                    // Enqueue the snap path — will be picked up when Composer fires webviewReady
                    this._pendingSnaps.push({ filePath: savedPath, fileName });

                    // Open the chosen platform's Composer
                    vscode.commands.executeCommand(
                        'dotshare.openFullWebview',
                        'post',
                        { platform: selected.id },
                    );

                } catch (err) {
                    const m = err instanceof Error ? err.message : String(err);
                    Logger.error('[CodeSnapPanel] Failed to save snap:', err);
                    vscode.window.showErrorMessage(`CodeSnap save failed: ${m}`);
                }
                break;
            }

            // ── composerReady: Composer webview finished mounting ─────────────
            // The Composer's app.ts posts { command: 'webviewReady' } on DOMContentLoaded.
            // The extension.ts bridges it here via CodeSnapPanel.setPendingSnap() +
            // DotShareWebView.postMessage(). We handle the actual broadcast in extension.ts.
            // Nothing extra to do here.

            // ── saveAsFile: user wants native Save dialog ─────────────────────
            case 'saveAsFile': {
                const base64Data = (msg.base64 as string).replace(/^data:image\/png;base64,/, '');
                const defaultUri = vscode.Uri.file(
                    path.join(os.homedir(), `codesnap-${Date.now()}.png`),
                );

                const dest = await vscode.window.showSaveDialog({
                    defaultUri,
                    filters: { 'PNG Image': ['png'] },
                    title:   'Save CodeSnap',
                });

                if (dest) {
                    const buf = Buffer.from(base64Data, 'base64');
                    await vscode.workspace.fs.writeFile(dest, buf);
                    vscode.window.showInformationMessage(`✅ Saved to ${dest.fsPath}`);
                }
                break;
            }

            default:
                Logger.info('[CodeSnapPanel] Unhandled message:', msg.command);
        }
    }

    /**
     * Build the QuickPick items from PLATFORM_CONFIGS.
     * Respects the user's defaultPlatform setting (shown first).
     */
    private _buildPlatformQuickPick(): Array<vscode.QuickPickItem & { id: string }> {
        const defaultPlatform = vscode.workspace
            .getConfiguration('dotshare')
            .get<string>('defaultPlatform', 'linkedin');

        const ICON_MAP: Record<string, string> = {
            linkedin:  '$(person)',
            x:         '$(twitter)',
            bluesky:   '$(cloud)',
            telegram:  '$(comment)',
            facebook:  '$(globe)',
            discord:   '$(comment-discussion)',
            reddit:    '$(flame)',
            devto:     '$(code)',
            medium:    '$(edit)',
        };

        const items = Object.entries(PLATFORM_CONFIGS)
            .filter(([key]) => key !== 'gist') // Gist doesn't make sense for image sharing
            .map(([key, cfg]) => ({
                id:          key,
                label:       `${ICON_MAP[key] ?? '$(share)'} ${cfg.name}`,
                description: cfg.workspaceType === 'blogs' ? 'Blog platform' : undefined,
            }));

        // Move default platform to top
        const idx = items.findIndex(i => i.id === defaultPlatform);
        if (idx > 0) {
            const [item] = items.splice(idx, 1);
            items.unshift({ ...item, description: `${item.description ?? ''}(default)`.trim() });
        }

        return items;
    }

    // ── HTML builder ──────────────────────────────────────────────────────────

    private _buildHtml(): string {
        const webview = this._panel.webview;
        const extUri  = this._context.extensionUri;
        const nonce   = getNonce();

        // Resolve local vendor URIs (offline — no CDN)
        const hljsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extUri, 'media', 'webview', 'vendor', 'highlight.min.js'),
        );

        // Build theme CSS URI map (only include files that exist on disk)
        const stylesDir = vscode.Uri.joinPath(extUri, 'media', 'webview', 'vendor', 'styles');
        const themes = [
            'atom-one-dark', 'github-dark', 'monokai', 'dracula',
            'nord', 'vs2015', 'tokyo-night-dark', 'github',
            'catppuccin-mocha',
        ] as const;

        const themeCssMap: Record<string, string> = {};
        for (const t of themes) {
            const localPath = vscode.Uri.joinPath(stylesDir, `${t}.min.css`);
            try {
                // Check file exists on disk before registering URI
                fs.accessSync(localPath.fsPath);
                themeCssMap[t] = webview.asWebviewUri(localPath).toString();
            } catch {
                // Skip missing files silently
            }
        }

        // Default theme CSS (always atom-one-dark)
        const defaultThemeCssUri = themeCssMap['atom-one-dark'] ?? '';

        // Build a JS-safe JSON string for the theme URI map
        const themeCssMapJson = JSON.stringify(themeCssMap);

        const csp = [
            `default-src 'none'`,
            `style-src ${webview.cspSource} 'unsafe-inline'`,
            `script-src 'nonce-${nonce}' ${webview.cspSource}`,
            `img-src data: blob:`,
            `font-src ${webview.cspSource}`,
        ].join('; ');

        const snapHtmlPath = path.join(extUri.fsPath, 'media', 'webview', 'codesnap.html');

        try {
            let html = fs.readFileSync(snapHtmlPath, 'utf-8');
            html = html.replace(/\{\{CSP\}\}/g,              csp);
            html = html.replace(/\{\{NONCE\}\}/g,            nonce);
            html = html.replace(/\{\{HLJS_JS_URI\}\}/g,      hljsUri.toString());
            html = html.replace(/\{\{DEFAULT_CSS_URI\}\}/g,  defaultThemeCssUri);
            // Escape < and > to prevent script-context breakout (XSS)
            const safeThemeCssMapJson = themeCssMapJson
                .replace(/</g, '\\u003c')
                .replace(/>/g, '\\u003e');
            html = html.replace(/\{\{THEME_CSS_MAP\}\}/g,    safeThemeCssMapJson);
            return html;
        } catch {
            return `<!DOCTYPE html>
<html><head>
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta charset="UTF-8">
  <title>CodeSnap</title>
</head>
<body style="background:#1e1e1e;color:#ccc;font-family:monospace;padding:2rem;">
  <p>⚠️ codesnap.html not found at media/webview/codesnap.html</p>
  <p>Run <code>npm run compile</code> and try again.</p>
</body></html>`;
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNonce(): string {
    let t = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) t += chars.charAt(Math.floor(Math.random() * chars.length));
    return t;
}
