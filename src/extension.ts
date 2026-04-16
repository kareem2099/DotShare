import * as vscode from 'vscode';
import { DotShareProvider } from './ui/DotShareProvider';
import { DotShareWebView } from './ui/DotShareWebView';
import { WhatsNewProvider } from './ui/WhatsNewProvider';
import { StorageManager } from './storage/storage-manager';
import { Scheduler } from './core/scheduler';
import { Logger } from './utils/Logger';
import { TokenManager } from './services/TokenManager';

export async function activate(context: vscode.ExtensionContext) {
    Logger.init(context);
    TokenManager.init(context);
    Logger.section('DotShare v3.0 Activating (Hybrid Mode)');

    // ── Data / Storage ────────────────────────────────────────
    const storageManager = new StorageManager(context);
    storageManager.migrateLegacyData().catch((e) => Logger.error('Migration failed', e));

    // ── 1. Sidebar Provider ───────────────────────────────────
    const provider = new DotShareProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DotShareProvider.viewType, provider)
    );

    // ── 2. Command that opens the main WebView ────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.openFullWebview', (page = 'post', options?: any) => {
            const platform = options?.platform as string | undefined;
            if (page === 'post' && platform) {
                DotShareWebView.createPlatformPost(context, platform);
            } else {
                DotShareWebView.createOrShow(context, page, options);
            }
        })
    );

    // ── 3. Redirect old commands ──────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.generatePost', () => {
            vscode.commands.executeCommand('dotshare.openFullWebview', 'post');
        }),
        vscode.commands.registerCommand('dotshare.shareToLinkedIn', () => {
            vscode.commands.executeCommand('dotshare.openFullWebview', 'post', { platform: 'linkedin' });
        }),
        vscode.commands.registerCommand('dotshare.shareToTelegram', () => {
            vscode.commands.executeCommand('dotshare.openFullWebview', 'post', { platform: 'telegram' });
        }),
        vscode.commands.registerCommand('dotshare.shareToDevTo', () => {
            DotShareWebView.createPlatformPost(context, 'devto');
        }),
        vscode.commands.registerCommand('dotshare.shareToMedium', () => {
            DotShareWebView.createPlatformPost(context, 'medium');
        })
    );

    // ── 4. Analytics ──────────────────────────────────────────
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
            const expiresIn = params.get('expires_in');
            const expiresAt = params.get('expires_at');
            const shouldRefreshSoon = params.get('should_refresh_soon') === 'true';
            const warning = params.get('warning');

            if (!platform || !accessToken) {
                vscode.window.showErrorMessage('DotShare: Invalid auth callback — missing platform or token.');
                return;
            }

            try {
                switch (platform) {
                    case 'linkedin':
                        await context.secrets.store('linkedinToken', accessToken);
                        break;
                    case 'x':
                        await TokenManager.storeToken(
                            'x',
                            accessToken,
                            refreshToken ?? undefined,
                            expiresIn ? Number(expiresIn) : undefined,
                            expiresAt ? Number(expiresAt) : undefined,
                            shouldRefreshSoon
                        );
                        if (warning === 'refresh_token_missing_reauth_required') {
                            vscode.window.showWarningMessage(
                                'DotShare: X refresh token was lost during rotation due to an auth server interruption. Your current session will work, but you must reconnect soon to avoid losing access.',
                                'Reconnect Now'
                            ).then(sel => {
                                if (sel === 'Reconnect Now') vscode.commands.executeCommand('dotshare.openFullWebview', 'settings', { platform: 'x' });
                            });
                        }
                        break;
                    case 'facebook':
                        await TokenManager.storeToken(
                            'facebook',
                            accessToken,
                            undefined,
                            expiresIn ? Number(expiresIn) : undefined,
                            expiresAt ? Number(expiresAt) : undefined,
                            shouldRefreshSoon
                        );
                        break;
                    case 'reddit':
                        await TokenManager.storeToken(
                            'reddit',
                            accessToken,
                            refreshToken ?? undefined,
                            expiresIn ? Number(expiresIn) : undefined,
                            expiresAt ? Number(expiresAt) : undefined,
                            shouldRefreshSoon
                        );
                        break;
                    default:
                        vscode.window.showErrorMessage(`DotShare: Unknown platform "${platform}"`);
                        return;
                }

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
        xAccessToken: await TokenManager.getValidToken('x'),
        xAccessSecret: await context.secrets.get('xAccessSecret') || '',
        facebookToken: await TokenManager.getValidToken('facebook'),
        discordWebhook: await context.secrets.get('discordWebhook') || '',
        redditAccessToken: await TokenManager.getValidToken('reddit'),
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