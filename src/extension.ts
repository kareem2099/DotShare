import * as vscode from 'vscode';
import { DotShareProvider } from './ui/DotShareProvider';
import { DotShareWebView } from './ui/DotShareWebView';
import { WhatsNewProvider } from './ui/WhatsNewProvider';
import { StorageManager } from './storage/storage-manager';

import { Logger } from './utils/Logger';
import { TokenManager } from './services/TokenManager';
import { DotShareAuth } from './services/DotShareAuth';

export async function activate(context: vscode.ExtensionContext) {
    Logger.init(context);
    TokenManager.init(context);
    Logger.section('DotShare v3.0 Activating (Hybrid Mode)');

    // ── Data / Storage ────────────────────────────────────────
    const storageManager = new StorageManager(context);
    storageManager.migrateLegacyData().catch((e) => Logger.error('[Extension] Migration failed', e));

    // ── 1. Sidebar Provider ───────────────────────────────────
    const provider = new DotShareProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DotShareProvider.viewType, provider)
    );

    // ── 2. Command that opens the main WebView ────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.openFullWebview', (_page?: string, options?: { platform?: string }) => {
            const platform = options?.platform;
            DotShareWebView.createPlatformPost(context, platform || 'linkedin');
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
            vscode.window.showInformationMessage('DotShare: Analytics are available in the sidebar Drafts & Platforms panel.');
        })
    );

    // ── What's New ────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.whatsNew', () => {
            WhatsNewProvider.show(context);
        })
    );

    // ── SaaS Auth Commands ────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.login', async () => {
            const token = await vscode.window.showInputBox({
                prompt: 'Enter your DotSuite API Token',
                password: true,
                ignoreFocusOut: true
            });
            if (token) {
                await DotShareAuth.storeToken(context, token);
                const verification = await DotShareAuth.verifyToken(context);
                if (verification.valid) {
                    const tierInfo = await DotShareAuth.fetchTierInfo(context);
                    vscode.window.showInformationMessage(`DotShare: Successfully logged in to DotSuite Cloud! Tier: ${tierInfo?.tier || 'Unknown'}`);
                } else if (verification.reason === 'server_error') {
                    vscode.window.showWarningMessage('DotShare: Token saved, but the server is currently unreachable. Verify your connection and try again.');
                } else {
                    vscode.window.showErrorMessage('DotShare: Invalid API token or backend unreachable.');
                    await DotShareAuth.logout(context);
                }
            }
        }),
        vscode.commands.registerCommand('dotshare.logout', async () => {
            // 🔴 Clear token
            await DotShareAuth.logout(context);
            
            // 🔄 Reload webviews to show login screen
            provider.reloadConfiguration();
            DotShareWebView.reloadConfiguration();
            
            // ✅ Success message
            vscode.window.showInformationMessage('✓ DotShare: Successfully logged out. Token cleared! 🧹');
        }),
        vscode.commands.registerCommand('dotshare.confirmLogout', async () => {
            // Show confirmation to user
            const choice = await vscode.window.showWarningMessage(
                '⚠️ DotShare: Are you sure you want to logout and clear your token?\n\nYou will need to login again.',
                { modal: true },
                'Yes, Logout',
                'Cancel'
            );
            
            if (choice === 'Yes, Logout') {
                // Execute actual logout
                vscode.commands.executeCommand('dotshare.logout');
            }
        })
    );
    await checkVersionAndShowWhatsNew(context);

    // ── URI Handler (OAuth callback & Magic Link Login) ─────────────
    const uriHandler = vscode.window.registerUriHandler({
        async handleUri(uri: vscode.Uri) {
            Logger.info(`[Extension] Received URI: ${uri.toString()}`);
            Logger.info(`[Extension] Path: ${uri.path}`);
            Logger.info(`[Extension] Query: ${uri.query}`);
            
            if (uri.path === '/login') {
                const params = new URLSearchParams(uri.query);
                const token = params.get('token');
                
                Logger.info(`[Extension] Extracted token: ${token}`);
                Logger.info(`[Extension] Token type: ${typeof token}`);
                if (token) {
                    Logger.info(`[Extension] Token length: ${token.length}`);
                    Logger.info(`[Extension] First 20 chars: ${token.substring(0, 20)}`);
                    Logger.info(`[Extension] Starts with ds_prod_: ${token.startsWith('ds_prod_')}`);
                }
                
                if (token) {
                    try {
                        // 1. Store the token (validates format first)
                        await DotShareAuth.storeToken(context, token);
                        
                        // 2. 🛡️ Security Check: confirm the token is real by pinging Rust backend
                        const verification = await DotShareAuth.verifyToken(context);
                        
                        if (verification.valid) {
                            const tierInfo = await DotShareAuth.fetchTierInfo(context);
                            vscode.window.showInformationMessage(`✓ DotShare: Successfully connected to DotSuite Cloud! (Tier: ${tierInfo?.tier || 'Unknown'})`);
                            vscode.commands.executeCommand('workbench.view.extension.dotshare-container');
                            
                            // Reload webviews to reflect new auth state
                            const provider = new DotShareProvider(context.extensionUri, context);
                            provider.reloadConfiguration();
                            DotShareWebView.reloadConfiguration();
                        } else if (verification.reason === 'server_error') {
                            // 5xx or network error — the token may be fine, don't delete it
                            Logger.warn('[Extension] Backend unreachable during token verification — keeping token, will retry on next use');
                            vscode.window.showWarningMessage(
                                '⚠️ DotShare: Could not reach the DotSuite server to verify your key. ' +
                                'The key has been saved — your connection will be confirmed automatically once the server is back online.',
                                'Retry Now'
                            ).then(async (sel) => {
                                if (sel === 'Retry Now') {
                                    const retry = await DotShareAuth.verifyToken(context);
                                    if (retry.valid) {
                                        vscode.window.showInformationMessage('✓ DotShare: Connection verified successfully!');
                                        vscode.commands.executeCommand('workbench.view.extension.dotshare-container');
                                    } else if (retry.reason === 'unauthorized') {
                                        vscode.window.showErrorMessage('❌ DotShare: Security Alert — Invalid token. Please generate a new key.');
                                        await DotShareAuth.logout(context);
                                    }
                                }
                            });
                        } else {
                            // 401/403 — the token is genuinely invalid; remove it immediately
                            Logger.warn('[Extension] Token rejected by backend (401/403) — removing stored token');
                            vscode.window.showErrorMessage('❌ DotShare: Security Alert — Invalid or fake API token received from link. Please try generating a new key.');
                            await DotShareAuth.logout(context);
                        }
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        vscode.window.showErrorMessage(`❌ DotShare: Failed to process authentication: ${errorMessage}`);
                        await DotShareAuth.logout(context);
                    }
                } else {
                    vscode.window.showErrorMessage('DotShare: Invalid login callback — missing token.');
                }
                return;
            }

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

                Logger.info(`[Extension] OAuth callback: ${platform} token saved`);

            } catch (error) {
                Logger.error('[Extension] URI Handler error', error);
                vscode.window.showErrorMessage('DotShare: Failed to save token. Please try again.');
            }
        }
    });
    context.subscriptions.push(uriHandler);

    Logger.info('[Extension] DotShare v3.0 activated ✅');
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
        Logger.error('[Extension] checkVersionAndShowWhatsNew failed', error);
    }
}

export function deactivate(): void {
    Logger.info('[Extension] DotShare deactivated');
}