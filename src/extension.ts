import * as vscode from 'vscode';
import { DotShareProvider } from './ui/DotShareProvider';
import { DotShareWebView } from './ui/DotShareWebView';
import { WhatsNewProvider } from './ui/WhatsNewProvider';
import { StorageManager } from './storage/storage-manager';
import { Scheduler } from './core/scheduler';
import { Logger } from './utils/Logger';

export async function activate(context: vscode.ExtensionContext) {
    Logger.init(context);
    Logger.section('DotShare v3.0 Activating (Hybrid Mode)');

    // ── Data / Storage ────────────────────────────────────────
    const storageManager = new StorageManager(context);
    storageManager.migrateLegacyData().catch((e) => Logger.error('Migration failed', e));

    // ── 1. Sidebar Provider ───────────────────────────────────
    const provider = new DotShareProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DotShareProvider.viewType, provider)
    );

    // ── 2. Command that opens the main WebView based on the button ──
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.openFullWebview', (page = 'post', options?: any) => {
            DotShareWebView.createOrShow(context, page, options);
        })
    );

    // ── 3. Redirect old commands to open the Post page ──────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.generatePost', () => {
            vscode.commands.executeCommand('dotshare.openFullWebview', 'post');
        }),
        vscode.commands.registerCommand('dotshare.shareToLinkedIn', () => {
            vscode.commands.executeCommand('dotshare.openFullWebview', 'post', { platform: 'linkedin' });
        }),
        vscode.commands.registerCommand('dotshare.shareToTelegram', () => {
            vscode.commands.executeCommand('dotshare.openFullWebview', 'post', { platform: 'telegram' });
        })
    );

    // ── 4. Redirect stats to open the Analytics page ──────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.showAnalytics', () => {
            DotShareWebView.createOrShow(context, 'analytics');
        })
    );

    // ── What's New ────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.whatsNew', () => {
            WhatsNewProvider.show(context);
        })
    );
    await checkVersionAndShowWhatsNew(context);

    // ── URI Handler (OAuth callback) ──────────────────────────
    const uriHandler = vscode.window.registerUriHandler({
        async handleUri(uri: vscode.Uri) {
            if (uri.path !== '/auth') return;

            const params = new URLSearchParams(uri.query);
            const platform = params.get('platform');
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');

            if (!platform || !accessToken) {
                vscode.window.showErrorMessage('DotShare: Invalid auth callback — missing platform or token.');
                return;
            }

            try {
                switch (platform) {
                    case 'linkedin': await context.secrets.store('linkedinToken', accessToken); break;
                    case 'x':
                        await context.secrets.store('xAccessToken', accessToken);
                        if (refreshToken) await context.secrets.store('xRefreshToken', refreshToken);
                        break;
                    case 'facebook': await context.secrets.store('facebookToken', accessToken); break;
                    case 'reddit':
                        await context.secrets.store('redditAccessToken', accessToken);
                        if (refreshToken) await context.secrets.store('redditRefreshToken', refreshToken);
                        break;
                    default:
                        vscode.window.showErrorMessage(`DotShare: Unknown platform "${platform}"`);
                        return;
                }

                // Reload config through the MessageHandler so the full updateConfiguration
                // payload (token values, theme, language, translations) is re-sent to the webview.
                provider.reloadConfiguration();
                DotShareWebView.reloadConfiguration();

                const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
                vscode.window.showInformationMessage(
                    `✓ ${platformName} connected successfully!`,
                    'Open Hub'
                ).then(sel => {
                    if (sel === 'Open Hub') {
                        vscode.commands.executeCommand('workbench.view.extension.dotshare-container');
                    }
                });

                Logger.info(`OAuth callback: ${platform} token saved`);

            } catch (error) {
                Logger.error('URI Handler error', error);
                vscode.window.showErrorMessage('DotShare: Failed to save token. Please try again.');
            }
        }
    });
    context.subscriptions.push(uriHandler);

    // ── Scheduler ─────────────────────────────────────────────
    const storagePath = context.globalStorageUri
        ? context.globalStorageUri.fsPath
        : context.extensionPath;

    const credentialsGetter = async () => ({
        linkedinToken: await context.secrets.get('linkedinToken') || '',
        telegramBot: await context.secrets.get('telegramBot') || '',
        telegramChat: await context.secrets.get('telegramChat') || '',
        xAccessToken: await context.secrets.get('xAccessToken') || '',
        xAccessSecret: await context.secrets.get('xAccessSecret') || '',
        facebookToken: await context.secrets.get('facebookToken') || '',
        discordWebhook: await context.secrets.get('discordWebhook') || '',
        redditAccessToken: await context.secrets.get('redditAccessToken') || '',
        redditRefreshToken: await context.secrets.get('redditRefreshToken') || '',
        blueskyIdentifier: await context.secrets.get('blueskyIdentifier') || '',
        blueskyPassword: await context.secrets.get('blueskyPassword') || '',
    });

    const scheduler = new Scheduler(storagePath, undefined, credentialsGetter);
    scheduler.start();
    context.subscriptions.push({ dispose: () => scheduler.stop() });

    Logger.info('DotShare v3.0 activated ✅');
}

async function checkVersionAndShowWhatsNew(context: vscode.ExtensionContext): Promise<void> {
    try {
        const currentVersion = context.extension.packageJSON.version;
        const previousVersion = context.globalState.get<string>('dotshareVersion');
        if (currentVersion !== previousVersion) {
            WhatsNewProvider.show(context);
            await context.globalState.update('dotshareVersion', currentVersion);
        }
    } catch (error) {
        Logger.error('checkVersionAndShowWhatsNew failed', error);
    }
}

export function deactivate(): void {
    Logger.info('DotShare deactivated');
}