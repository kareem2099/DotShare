import { protectSecretStorage } from './security/redaction';
import { hardenHttp } from './security/http';
import * as vscode from 'vscode';
import { DotShareProvider } from './ui/DotShareProvider';
import { DotShareWebView } from './ui/DotShareWebView';
import { WhatsNewProvider } from './ui/WhatsNewProvider';
import { StorageManager } from './storage/storage-manager';
import { DOTSUITE_CODESNAP_URL, DOTSUITE_CORE_API_URL } from './constants';
import { Logger } from './utils/Logger';
import { TokenManager } from './services/TokenManager';
import { DotShareAuth } from './services/DotShareAuth';
import { GistService } from './services/GistService';
import { MediaService } from './services/MediaService';
import { CodeSnapPanel } from './ui/CodeSnapPanel';
import { ProjectContextService } from './services/ProjectContextService';
import * as path from 'path';

export async function activate(context: vscode.ExtensionContext) {
    hardenHttp();
    context = protectSecretStorage(context);
    // ── Emergency Unban Recovery ──────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.recheckBanStatus', async () => {
            await context.globalState.update('dotshare.banned', undefined);
            await context.globalState.update('dotshare.banReason', undefined);
            vscode.window.showInformationMessage('DotShare: Local ban state cleared. Please reload the window.', 'Reload Window').then(sel => {
                if (sel === 'Reload Window') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        })
    );

    // ── 🚨 FIRST THING: Check if account is banned ────────────────────────────
    // This persists across restarts so once banned, always banned unless cleared.
    const isBanned = context.globalState.get<boolean>('dotshare.banned');
    if (isBanned) {
        const reason = context.globalState.get<string>('dotshare.banReason') ?? 'Terms of Service violation';
        vscode.window.showErrorMessage(
            `⛔ DotShare: Account Terminated\n\n${reason}\n\nContact: kareem209907@gmail.com`,
            { modal: true }
        );
        return; // Stop activation entirely — no commands, no UI registered
    }

    Logger.init(context, vscode);
    TokenManager.init(context);
    DotShareAuth.setContext(context);
    Logger.section('DotShare v3.0 Activating (Hybrid Mode)');

    // ── Shared services ───────────────────────────────────
    const mediaService = new MediaService(context);

    // ── Data / Storage ────────────────────────────────────
    const storageManager = new StorageManager(context);
    await storageManager.migrateLegacyData();

    // ── 1. Sidebar Provider ───────────────────────────────────
    const provider = new DotShareProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DotShareProvider.viewType, provider)
    );

    // ── 2. Command that opens the main WebView ────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.openLibrary', async () => {
            const { PublishingLibraryPanel } = await import('./ui/PublishingLibraryPanel');
            PublishingLibraryPanel.show(context);
        }),
        vscode.commands.registerCommand('dotshare.openFullWebview', (_page?: string, options?: { platform?: string }) => {
            const platform = options?.platform;
            DotShareWebView.createPlatformPost(context, platform || 'linkedin');
        }),
        vscode.commands.registerCommand('dotshare.injectToWebview', (text: string) => {
            DotShareWebView.postMessage({ command: 'injectText', text });
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
        })
    );

    // ── 4. CodeSnap ───────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.codeSnap', () => {
            CodeSnapPanel.open(context, mediaService);
        }),
        // Internal command: called by CodeSnapPanel after QuickPick → Composer opens
        // The Composer fires { command: 'webviewReady' } on mount; we relay the pending
        // snap image via DotShareWebView.postMessage() so it attaches automatically.
        vscode.commands.registerCommand(
            'dotshare.attachSnapToComposer',
            (filePath: string, fileName: string) => {
                DotShareWebView.postMessage({
                    command:    'mediaAttached',
                    mediaFiles: [{
                        mediaPath:     filePath,
                        mediaFilePath: filePath,
                        fileName:      fileName,
                        fileSize:      0,
                    }],
                });
                Logger.info(`[Extension] CodeSnap attached to composer: ${fileName}`);
            },
        ),
        // Internal: fired by DotShareWebView when ANY Composer posts webviewReady.
        // Checks CodeSnapPanel for a pending snap and injects it into the new panel.
        vscode.commands.registerCommand(
            'dotshare._composerReady',
            (panel: vscode.WebviewPanel) => {
                const pending = CodeSnapPanel.consumePendingSnap();
                if (pending) {
                    panel.webview.postMessage({
                        command:    'mediaAttached',
                        mediaFiles: [{
                            mediaPath:     pending.filePath,
                            mediaFilePath: pending.filePath,
                            fileName:      pending.fileName,
                            fileSize:      0,
                        }],
                    });
                    Logger.info(`[Extension] Pending snap delivered to new composer: ${pending.fileName}`);
                }
            },
        )
    );

    // ── 4. Analytics ──────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.showAnalytics', () => {
            vscode.window.showInformationMessage('DotShare: Analytics are available in the sidebar Drafts & Platforms panel.');
        })
    );

    // Singleton OutputChannel for DotShare AI
    let releaseContextChannel: vscode.OutputChannel | undefined;
    const getReleaseContextChannel = (): vscode.OutputChannel => {
        if (!releaseContextChannel) {
            releaseContextChannel = vscode.window.createOutputChannel('DotShare AI');
            context.subscriptions.push(releaseContextChannel);
        }
        return releaseContextChannel;
    };

    // ── What's New & DotShare AI ──────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.whatsNew', () => {
            WhatsNewProvider.show(context);
        }),
        // ── 🧠 DotShare AI: Inspect Release Context Command ───────────────
        vscode.commands.registerCommand('dotshare.inspectReleaseContext', async () => {
            try {
                const ctx = await ProjectContextService.buildContext();
                const outputChannel = getReleaseContextChannel();
                outputChannel.clear();
                outputChannel.appendLine('========================================');
                outputChannel.appendLine('🧠 DotShare AI — Extracted Release Context');
                outputChannel.appendLine('========================================\n');
                outputChannel.appendLine(`📦 Project Name: ${ctx.projectName}`);
                if (ctx.version) outputChannel.appendLine(`🏷️ Version: ${ctx.version}`);
                if (ctx.projectDescription) outputChannel.appendLine(`📝 Description: ${ctx.projectDescription}`);
                if (ctx.repoUrl) outputChannel.appendLine(`🔗 Repo URL: ${ctx.repoUrl}`);
                if (ctx.techStack?.length) outputChannel.appendLine(`🛠️ Tech Stack: ${ctx.techStack.join(', ')}`);
                outputChannel.appendLine(`Scope: ${ctx.scope || 'release'}`);
                if (ctx.targetLabel) outputChannel.appendLine(`Snapshot: ${ctx.targetLabel} (${ctx.targetRef})`);
                if (ctx.gitBaseTag) outputChannel.appendLine(`Base tag: ${ctx.gitBaseTag}`);
                if (ctx.contextWarnings?.length) {
                    outputChannel.appendLine('\nEvidence limits:');
                    ctx.contextWarnings.forEach(warning => outputChannel.appendLine(`  • ${warning}`));
                }
                if (ctx.releaseDocuments?.length) {
                    outputChannel.appendLine('\nRelease documents:');
                    ctx.releaseDocuments.forEach(doc => outputChannel.appendLine(`  ${doc.file} [${doc.kind}${doc.truncated ? ', partial' : ''}]\n${doc.content}`));
                }

                if (ctx.changelogNotes?.length) {
                    outputChannel.appendLine('\n📋 Latest Changelog Notes:');
                    ctx.changelogNotes.forEach(n => outputChannel.appendLine(`  • ${n}`));
                }

                if (ctx.latestCommit) {
                    outputChannel.appendLine(`\n🌳 Latest Commit Details:\n  ${ctx.latestCommit.replace(/\n/g, '\n  ')}`);
                }

                if (ctx.recentCommits?.length) {
                    outputChannel.appendLine('\n📜 Recent Commits:');
                    ctx.recentCommits.forEach(c => outputChannel.appendLine(`  ${c}`));
                }

                if (ctx.gitDiffSummary) {
                    outputChannel.appendLine(`\n📊 Git Diff Summary:\n${ctx.gitDiffSummary}`);
                }

                if (ctx.dependencyChanges?.length) {
                    outputChannel.appendLine('\n📦 Dependency Changes:');
                    ctx.dependencyChanges.forEach(d => outputChannel.appendLine(`  • ${d}`));
                }

                if (ctx.activeEditorContext) {
                    outputChannel.appendLine(`\n📄 Active Editor: ${ctx.activeEditorContext.fileName} [${ctx.activeEditorContext.languageId || 'code'}]`);
                    if (ctx.activeEditorContext.selectedText) {
                        outputChannel.appendLine(`  Selected Focus Snippet:\n  ${ctx.activeEditorContext.selectedText.replace(/\n/g, '\n  ')}`);
                    }
                }

                if (ctx.relevantCodeSnippets?.length) {
                    outputChannel.appendLine('\n💡 Key Code Snippets:');
                    ctx.relevantCodeSnippets.forEach(s => {
                        outputChannel.appendLine(`  • ${s.file} (${s.reason || 'Code change'}):`);
                        outputChannel.appendLine(`    ${s.code.replace(/\n/g, '\n    ')}`);
                    });
                }

                outputChannel.show(true);
                vscode.window.showInformationMessage(`✓ DotShare AI: Context extracted successfully for "${ctx.projectName}" (Version: ${ctx.version || 'N/A'})!`);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`DotShare AI error: ${msg}`);
            }
        })
    );

    // ── 5. Gist Commands ──────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.createGistFromSelection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('DotShare: No active editor found.');
                return;
            }

            const selection = editor.selection;
            if (selection.isEmpty) {
                vscode.window.showErrorMessage('DotShare: No text selected.');
                return;
            }

            const text = editor.document.getText(selection);
            const defaultFileName = editor.document.isUntitled ? 'snippet.txt' : (path.basename(editor.document.fileName) || 'snippet.txt');
            
            const fileName = await vscode.window.showInputBox({
                prompt: 'Enter the file name for your Gist snippet',
                value: defaultFileName
            });

            if (!fileName) return; // Cancelled

            await handleGistCreation(context, text, fileName);
        }),

        vscode.commands.registerCommand('dotshare.createGistFromFile', async (uri?: vscode.Uri) => {
            let fileUri = uri;
            if (!fileUri) {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('DotShare: No file selected or active.');
                    return;
                }
                fileUri = editor.document.uri;
            }

            try {
                const fileData = await vscode.workspace.fs.readFile(fileUri);
                const text = new TextDecoder().decode(fileData);
                const fileName = path.basename(fileUri.fsPath);

                await handleGistCreation(context, text, fileName);
            } catch (err) {
                Logger.error('[Extension] Failed to read file for gist', err);
                vscode.window.showErrorMessage('DotShare: Failed to read file for Gist.');
            }
        })
    );

    // ── SaaS Auth Commands ────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.logout', async () => {
            // 🔴 Clear token
            await DotShareAuth.logout(context);
            
            // 🔄 Update sidebar cloud section to logged-out state
            provider.postMessage({ command: 'LOGOUT_SUCCESS' });
            provider.reloadConfiguration();
            DotShareWebView.reloadConfiguration();
            
            // ✅ Success message
            vscode.window.showInformationMessage('✓ DotShare: Successfully logged out. Token cleared! 🧹');
        }),
        vscode.commands.registerCommand('dotshare.clearAllCredentials', async () => {
            const choice = await vscode.window.showWarningMessage(
                'DotShare: Remove every saved credential from this device?',
                {
                    modal: true,
                    detail: 'This deletes all platform tokens and keys, AI provider keys, the GitHub token, your DotSuite key and your cloud-sync consent from VS Code SecretStorage. ' +
                        'It does not revoke them at each platform, and copies already synced to DotSuite stay there until you ask support@dotsuite.dev to delete them.',
                },
                'Clear All'
            );
            if (choice !== 'Clear All') return;
            await new StorageManager(context).clearAllCredentials();
            provider.postMessage({ command: 'LOGOUT_SUCCESS' });
            provider.reloadConfiguration();
            DotShareWebView.reloadConfiguration();
            vscode.window.showInformationMessage('DotShare: All local credentials were removed.');
        }),
        vscode.commands.registerCommand('dotshare.confirmLogout', async () => {
            const choice = await vscode.window.showWarningMessage(
                '⚠️ DotShare: Are you sure you want to logout and clear your token?\n\nYou will need to login again.',
                { modal: true },
                'Yes, Logout'
            );
            
            if (choice === 'Yes, Logout') {
                vscode.commands.executeCommand('dotshare.logout');
            }
        })
    );
    await checkVersionAndShowWhatsNew(context);

    // ── URI Handler (OAuth callback & Magic Link Login) ─────────────
    const uriHandler = vscode.window.registerUriHandler({
        async handleUri(uri: vscode.Uri) {
            Logger.info(`[Extension] Path: ${uri.path}`);
            
            if (uri.path === '/login') {
                const params = new URLSearchParams(uri.query);
                const token = params.get('token');
                
                Logger.info(`[Extension] Token type: ${typeof token}`);
                if (token) {
                    Logger.info(`[Extension] Token length: ${token.length}`);
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
                            
                            // Push fetchProfile to the sidebar so the cloud section
                            // switches immediately from "logged out" → "logged in"
                            provider.postMessage({ command: 'fetchProfile' });
                            provider.reloadConfiguration();
                            DotShareWebView.reloadConfiguration();
                        } else if (verification.reason === 'server_error') {
                            // 5xx or network error — the token may be fine, don't delete it
                            Logger.warn('[Extension] Backend unreachable during token verification — keeping token, will retry on next use');
                            // Still push fetchProfile so the sidebar can show a partial connected state
                            provider.postMessage({ command: 'fetchProfile' });
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
                                        provider.postMessage({ command: 'fetchProfile' });
                                    } else if (retry.reason === 'unauthorized') {
                                        vscode.window.showErrorMessage('❌ DotShare: Security Alert — Invalid token. Please generate a new key.');
                                        await DotShareAuth.logout(context);
                                        provider.postMessage({ command: 'LOGOUT_SUCCESS' });
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

                    default:
                        vscode.window.showErrorMessage(`DotShare: Unknown platform "${platform}"`);
                        return;
                }

                // 🔐 Sync OAuth token to dotsuite-core so the website can show it as connected
                try {
                    const apiKey = await DotShareAuth.getToken(context);
                    if (apiKey && context.globalState.get<boolean>('dotshare.cloudCredentialsConsentGiven', false)) {
                        const syncPayload = {
                            platform,
                            access_token: accessToken,
                            ...(refreshToken && { refresh_token: refreshToken }),
                            ...(expiresIn && { expires_in: Number(expiresIn) }),
                        };

                        const syncResponse = await fetch(`${DOTSUITE_CORE_API_URL}/v1/oauth/save`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${apiKey}`,
                                'X-Machine-Id': DotShareAuth.getHashedMachineId(),
                            },
                            body: JSON.stringify(syncPayload),
                        });

                        if (!syncResponse.ok) {
                            Logger.warn(`[Extension] Failed to sync ${platform} token to dotsuite-core (HTTP ${syncResponse.status})`);
                            // Don't fail the entire flow; token is stored locally
                        } else {
                            Logger.info(`[Extension] ✅ ${platform} token synced to dotsuite-core`);
                        }
                    }
                } catch (syncError) {
                    const errorMessage = syncError instanceof Error ? syncError.message : String(syncError);
                    Logger.warn(`[Extension] Failed to sync ${platform} token:`, errorMessage);
                    // Don't fail; token is stored locally
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

async function handleGistCreation(context: vscode.ExtensionContext, content: string, fileName: string) {
    const description = await vscode.window.showInputBox({
        prompt: 'Enter a description for your Gist',
        placeHolder: 'e.g., Useful utility function'
    });

    if (description === undefined) return; // Cancelled

    const visibility = await vscode.window.showQuickPick(['Secret', 'Public'], {
        placeHolder: 'Select Gist visibility'
    });

    if (!visibility) return; // Cancelled

    const isPublic = visibility === 'Public';

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'DotShare: Creating Gist...',
        cancellable: false
    }, async () => {
        try {
            const files = { [fileName]: { content } };
            const url = await GistService.createGist(files, description, isPublic);

            if (url) {
                // Determine if user is Pro/Max
                const tierInfo = await DotShareAuth.getTierInfo(context);
                const isPaid = tierInfo?.is_paid ?? false;

                const parts = url.split('/');
                const gistId = parts[parts.length - 1];

                const options = ['Copy Link', 'Open in Browser', '🚀 Share via DotShare'];
                if (isPaid) {
                    options.push('🔗 Copy Dynamic CodeSnap Markdown');
                }

                vscode.window.showInformationMessage(`✓ DotShare: Gist created successfully!`, ...options).then(async sel => {
                    if (sel === 'Copy Link') {
                        await vscode.env.clipboard.writeText(url);
                        vscode.window.showInformationMessage('DotShare: Gist link copied to clipboard.');
                    } else if (sel === 'Open in Browser') {
                        vscode.env.openExternal(vscode.Uri.parse(url));
                    } else if (sel === '🚀 Share via DotShare') {
                        await vscode.env.clipboard.writeText(url);
                        vscode.commands.executeCommand('dotshare.openFullWebview');
                        // Give webview time to open and load before injecting
                        setTimeout(() => {
                            vscode.commands.executeCommand('dotshare.injectToWebview', url);
                        }, 1500);
                        vscode.window.showInformationMessage('DotShare: Gist link added to your post!');
                    } else if (sel === '🔗 Copy Dynamic CodeSnap Markdown') {
                        const dynamicUrl = `![CodeSnap](${DOTSUITE_CODESNAP_URL}/${gistId})`;
                        await vscode.env.clipboard.writeText(dynamicUrl);
                        vscode.window.showInformationMessage('DotShare: Dynamic Gist Markdown copied to clipboard! Paste it into any README.');
                    }
                });
            } else {
                vscode.window.showErrorMessage('DotShare: Failed to create Gist or authentication was cancelled.');
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`DotShare: ${msg}`);
        }
    });
}
