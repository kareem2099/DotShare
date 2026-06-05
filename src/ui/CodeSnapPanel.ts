import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { CodeSnapService, CodeSnapData } from '../services/CodeSnapService';
import { MediaService } from '../services/MediaService';
import { DotShareAuth } from '../services/DotShareAuth';
import { Logger } from '../utils/Logger';
import { PLATFORM_CONFIGS } from '../platforms/platform-config';
import { TierInfo } from '../types';

/**
 * CodeSnapPanel
 *
 * Manages the CodeSnap WebviewPanel lifecycle.
 * One singleton panel at a time — re-uses the existing panel if already open.
 *
 * Tier enforcement (client-side):
 *  - Free : watermark locked ON, custom brand hidden
 *  - Pro/Max: watermark toggleable, custom brand input visible
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
        this._panel = panel;
        this._context = context;
        this._mediaService = mediaService;

        this._panel.webview.html = this._buildHtml();

        this._panel.webview.onDidReceiveMessage(
            (msg) => this._handleMessage(msg),
            undefined,
            context.subscriptions,
        );

        this._panel.onDidDispose(
            () => { CodeSnapPanel._instance = undefined; },
            undefined,
            context.subscriptions,
        );
    }

    // ── Public API ────────────────────────────────────────────────────────────

    public static open(context: vscode.ExtensionContext, mediaService: MediaService): void {
        const data = CodeSnapService.capture();

        if (!data) {
            vscode.window.showWarningMessage('DotShare CodeSnap: No active editor found.');
            return;
        }

        if (CodeSnapPanel._instance) {
            CodeSnapPanel._instance._panel.reveal(vscode.ViewColumn.Beside);
            CodeSnapPanel._instance._sendData(data);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            CodeSnapPanel.viewType,
            '📸 CodeSnap',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [context.extensionUri],
            },
        );

        CodeSnapPanel._instance = new CodeSnapPanel(panel, context, mediaService);
        CodeSnapPanel._instance._sendData(data);
    }

    public static setPendingSnap(filePath: string, fileName: string): void {
        CodeSnapPanel._instance?._pendingSnaps.push({ filePath, fileName });
    }

    public static consumePendingSnap(): { filePath: string; fileName: string } | null {
        return CodeSnapPanel._instance?._pendingSnaps.shift() ?? null;
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /**
     * Fetch tier (fail-silent — if unauthenticated we just send null and the
     * webview defaults to Free restrictions).
     */
    private async _fetchTier(): Promise<TierInfo | null> {
        try {
            return await DotShareAuth.fetchTierInfo(this._context);
        } catch {
            return null;
        }
    }

    private async _sendData(data: CodeSnapData): Promise<void> {
        const tierInfo = await this._fetchTier();
        this._panel.webview.postMessage({ command: 'loadCode', data, tierInfo });
    }

    private async _handleMessage(msg: { command: string;[key: string]: unknown }): Promise<void> {
        switch (msg.command) {

            case 'webviewReady':
                Logger.info('[CodeSnapPanel] WebView reports ready');
                break;

            case 'snapReady': {
                try {
                    const base64Data = (msg.base64 as string).replace(/^data:image\/png;base64,/, '');
                    const fileName = `codesnap-${Date.now()}.png`;

                    const savedPath = await this._mediaService.saveUploadedFile({
                        name: fileName,
                        base64Data: base64Data,
                        size: Math.floor(base64Data.length * 0.75),
                    });

                    Logger.info(`[CodeSnapPanel] Saved snap: ${savedPath}`);
                    this._panel.webview.postMessage({ command: 'snapSaved', filePath: savedPath });

                    const shareItems = this._buildPlatformQuickPick();
                    const selected = await vscode.window.showQuickPick(shareItems, {
                        placeHolder: '📸 Where do you want to share this CodeSnap?',
                        matchOnDescription: true,
                    });

                    if (!selected) return;

                    this._pendingSnaps.push({ filePath: savedPath, fileName });

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

            case 'saveAsFile': {
                const ext      = (msg.ext as string | undefined) || 'png';
                const base64Data = (msg.base64 as string)
                    .replace(/^data:image\/[^;]+;base64,/, '');

                const defaultUri = vscode.Uri.file(
                    path.join(os.homedir(), `codesnap-${Date.now()}.${ext}`),
                );

                const dest = await vscode.window.showSaveDialog({
                    defaultUri,
                    filters: {
                        'PNG Image':  ['png'],
                        'JPEG Image': ['jpg', 'jpeg'],
                        'WebP Image': ['webp'],
                    },
                    title: 'Save CodeSnap',
                });

                if (dest) {
                    const buf = Buffer.from(base64Data, 'base64');
                    await vscode.workspace.fs.writeFile(dest, buf);
                    vscode.window.showInformationMessage(`✅ Saved to ${dest.fsPath}`);
                }
                break;
            }

            // Pro/Max upgrade prompt — webview sends this when a free user tries
            // to interact with a locked feature.
            case 'upgradeToPro': {
                const action = await vscode.window.showInformationMessage(
                    '🚀 This feature requires DotShare Pro. Unlock custom branding, watermark removal, and more!',
                    'Upgrade Now',
                    'Maybe Later',
                );
                if (action === 'Upgrade Now') {
                    vscode.env.openExternal(vscode.Uri.parse('https://dotsuite.dev/pricing'));
                }
                break;
            }

            default:
                Logger.info('[CodeSnapPanel] Unhandled message:', msg.command);
        }
    }

    private _buildPlatformQuickPick(): Array<vscode.QuickPickItem & { id: string }> {
        const defaultPlatform = vscode.workspace
            .getConfiguration('dotshare')
            .get<string>('defaultPlatform', 'linkedin');

        const ICON_MAP: Record<string, string> = {
            linkedin: '$(person)',
            x: '$(twitter)',
            bluesky: '$(cloud)',
            discord: '$(comment-discussion)',

            devto: '$(code)',
        };

        const items = Object.entries(PLATFORM_CONFIGS)
            .filter(([key]) => key !== 'gist')
            .map(([key, cfg]) => ({
                id: key,
                label: `${ICON_MAP[key] ?? '$(share)'} ${cfg.name}`,
                description: cfg.workspaceType === 'blogs' ? 'Blog platform' : undefined,
            }));

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
        const extUri = this._context.extensionUri;
        const nonce = getNonce();

        const hljsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extUri, 'media', 'webview', 'vendor', 'highlight.min.js'),
        );

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
                fs.accessSync(localPath.fsPath);
                themeCssMap[t] = webview.asWebviewUri(localPath).toString();
            } catch {
                // skip missing theme files silently
            }
        }

        const defaultThemeCssUri = themeCssMap['atom-one-dark'] ?? '';
        // Escape < and > to prevent script-context breakout (XSS)
        const safeThemeCssMapJson = JSON.stringify(themeCssMap)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e');

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
            html = html.replace(/\{\{CSP\}\}/g, csp);
            html = html.replace(/\{\{NONCE\}\}/g, nonce);
            html = html.replace(/\{\{HLJS_JS_URI\}\}/g, hljsUri.toString());
            html = html.replace(/\{\{DEFAULT_CSS_URI\}\}/g, defaultThemeCssUri);
            html = html.replace(/\{\{THEME_CSS_MAP\}\}/g, safeThemeCssMapJson);
            return html;
        } catch {
            return `<!DOCTYPE html>
<html><head>
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta charset="UTF-8"><title>CodeSnap</title>
</head>
<body style="background:#1e1e1e;color:#ccc;font-family:monospace;padding:2rem;">
  <p>⚠️ codesnap.html not found at media/webview/codesnap.html</p>
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
