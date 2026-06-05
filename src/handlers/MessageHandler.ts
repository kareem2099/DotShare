import * as vscode from 'vscode';
import { DOTSUITE_WEB_URL } from '../constants';
import * as path from 'path';
import * as fs from 'fs';
import { HistoryService } from '../services/HistoryService';
import { AnalyticsService } from '../services/AnalyticsService';
import { MediaService } from '../services/MediaService';
import { ConfigHandler } from './ConfigHandler';

import { PostHandler } from './PostHandler';
import { GistHandler } from './GistHandler';
import { Logger } from '../utils/Logger';
import { TokenManager, AUTH_SERVER_URL } from '../services/TokenManager';
import { DraftsService } from '../services/DraftsService';
import { DotShareAuth } from '../services/DotShareAuth';
import { SchedulerClient } from '../services/SchedulerClient';
import axios from 'axios';

interface Message {
    command: string;
    [key: string]: unknown;
}

export class MessageHandler {
    private configHandler: ConfigHandler;

    private postHandler: PostHandler;
    private gistHandler: GistHandler;
    private draftsService: DraftsService;

    constructor(
        private view: vscode.WebviewView,
        private context: vscode.ExtensionContext,
        historyService: HistoryService,
        analyticsService: AnalyticsService,
        mediaService: MediaService
    ) {
        // Initialize sub-handlers
        this.draftsService = new DraftsService(context.globalState);
        this.configHandler = new ConfigHandler(view, context);

        this.postHandler = new PostHandler(view, context, historyService, analyticsService, mediaService, this.draftsService);
        this.gistHandler = new GistHandler(view, context);
    }

    public async handleMessage(message: unknown) {
        if (!this.isValidMessage(message)) {
            Logger.error('[MessageHandler] Invalid message format');
            return;
        }
        const cmd = message.command;

        // Smart routing based on command patterns - check specific commands first
        if (cmd.startsWith('share') || cmd === 'generatePost' || cmd === 'loadPostHistory' ||
            cmd === 'loadAnalytics' || cmd.startsWith('schedule') || cmd === 'editScheduledPost' ||
            cmd === 'readMarkdownFile' || cmd === 'resetBlogMarkdown' || cmd === 'loadScheduledPosts' ||
            cmd === 'cancelScheduledPost' || cmd === 'loadOAuthConnections' || cmd === 'openSupportLink' ||
            (cmd.includes('Draft') && !cmd.includes('Gist'))) {
            // Posting and content operations including Drafts
            await this.postHandler.handleMessage(message);
        }
        else if (cmd === 'createGist' || cmd === 'saveGistDraft' || cmd === 'loadGistDrafts' ||
            cmd === 'deleteGistDraft') {
            // GitHub Gist operations
            await this.gistHandler.handleMessage(message);
        }
        else if (cmd.startsWith('save') || cmd === 'loadConfiguration' || cmd.includes('Api')) {
            // Configuration operations (excluding loadPostHistory and loadAnalytics)
            await this.configHandler.handleMessage(message);
        }
        else {
            // Handle remaining commands directly
            await this.handleOtherCommands(message);
        }
    }

    private async handleOtherCommands(message: Message): Promise<void> {
        const cmd = message.command;

        try {
            switch (cmd) {
                case 'openOAuth': {
                    const platform = message.platform as string;

                    // GitHub Gist uses VS Code's built-in authentication
                    if (platform === 'gist') {
                        await this.handleGitHubGistAuth();
                        return;
                    }

                    const validPlatforms = ['linkedin', 'x'];
                    if (!platform || !validPlatforms.includes(platform)) {
                        this.sendError(`DotShare: Unknown OAuth platform "${platform}"`);
                        return;
                    }
                    const scheme = vscode.env.uriScheme;
                    const authUrl = `${AUTH_SERVER_URL}/auth/${platform}?scheme=${scheme}`;
                    Logger.info(`[MessageHandler] DotShare: Opening OAuth for ${platform} → ${authUrl}`);
                    vscode.env.openExternal(vscode.Uri.parse(authUrl));
                    break;
                }

                case 'openFullWebview': {
                    const page = (message.action === 'analytics' || message.page === 'analytics') ? 'analytics' : 'post';
                    const options = message.platform ? { platform: message.platform } : {};
                    vscode.commands.executeCommand('dotshare.openFullWebview', page, options);
                    break;
                }

                case 'triggerCodeSnap':
                    vscode.commands.executeCommand('dotshare.codeSnap');
                    break;

                case 'selectMediaFiles':
                    await this.handleSelectMediaFiles();
                    break;

                case 'uploadFile':
                    await this.handleUploadFile(message);
                    break;

                case 'attachMedia':
                    await this.handleAttachMedia(message);
                    break;

                case 'removeMedia':
                    await this.handleRemoveMedia();
                    break;


                case 'disconnectOAuth': {
                    const platform = message.platform as string;

                    // GitHub Gist
                    if (platform === 'gist') {
                        await TokenManager.clearGitHubToken();
                        this.sendSuccess('✅ GitHub disconnected');
                        // Reload config so UI updates
                        const { ConfigHandler } = await import('./ConfigHandler');
                        const cfgHandler = new ConfigHandler(this.view, this.context);
                        await cfgHandler.handleMessage({ command: 'loadConfiguration' });
                        return;
                    }

                    const validPlatforms = ['linkedin', 'x'];
                    if (!platform || !validPlatforms.includes(platform)) {
                        this.sendError(`Unknown platform: ${platform}`);
                        return;
                    }
                    switch (platform) {
                        case 'linkedin':
                            await this.context.secrets.store('linkedinToken', '');
                            break;
                        case 'x':
                            await TokenManager.clearToken(platform as 'x');
                            break;
                    }
                    // Reload full config so webview reflects disconnected state immediately
                    const { ConfigHandler } = await import('./ConfigHandler');
                    const cfgHandler = new ConfigHandler(this.view, this.context);
                    await cfgHandler.handleMessage({ command: 'loadConfiguration' });
                    this.sendSuccess(`${platform} disconnected`);
                    break;
                }

                case 'setGitHubToken': {
                    const token = message.token as string;
                    if (!token || token.trim().length === 0) {
                        this.sendError('⚠️ Token cannot be empty');
                        return;
                    }
                    try {
                        await TokenManager.setToken('github', token);
                        this.sendSuccess('✅ GitHub token stored securely!');
                        Logger.info('[MessageHandler] GitHub token saved from manual entry');
                    } catch (error: unknown) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        this.sendError(`Failed to store token: ${errorMessage}`);
                    }
                    break;
                }

                case 'forceRefresh': {
                    const platform = message.platform as 'x';
                    Logger.info(`[MessageHandler] Manual refresh requested for ${platform}`);
                    const success = await TokenManager.forceRefresh(platform);
                    if (success) {
                        this.sendSuccess(`${platform.toUpperCase()} connection refreshed!`);
                        // Reload config to update UI status
                        const { ConfigHandler } = await import('./ConfigHandler');
                        const cfgHandler = new ConfigHandler(this.view, this.context);
                        await cfgHandler.handleMessage({ command: 'loadConfiguration' });
                    } else {
                        this.sendError(`${platform.toUpperCase()} refresh failed. Please try reconnecting.`);
                    }
                    break;
                }

                case 'changeLanguage': {
                    const language = message.language as string || 'en';
                    const validLanguages = ['en', 'ar', 'ru'];
                    if (!validLanguages.includes(language)) {
                        this.sendError(`Invalid language: ${language}`);
                        return;
                    }
                    await this.context.globalState.update('dotshareLanguage', language);

                    let translations = {};
                    try {
                        const filePath = path.join(this.context.extensionPath, 'media', 'locales', `${language}.json`);
                        if (fs.existsSync(filePath)) {
                            translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        }
                    } catch (e) {
                        Logger.warn(`[MessageHandler] Failed to load translations for ${language}`, e);
                    }

                    this.view.webview.postMessage({ command: 'languageChanged', language, translations });
                    this.sendSuccess(`Language changed to ${language}`);
                    break;
                }

                case 'logout': {
                    // 🔴 Emergency logout - show confirmation dialog
                    Logger.info('[MessageHandler] Logout requested from Sidebar');
                    vscode.commands.executeCommand('dotshare.confirmLogout');
                    break;
                }

                case 'fetchProfile': {
                    await this.handleFetchProfile();
                    break;
                }

                case 'connectToDashboard': {
                    const BASE_URL = DOTSUITE_WEB_URL;
                    const scheme = vscode.env.uriScheme;
                    const loginUrl = `${BASE_URL}/en/login?intent=vscode&scheme=${scheme}`;
                    Logger.info(`[MessageHandler] Opening dashboard login: ${loginUrl}`);
                    vscode.env.openExternal(vscode.Uri.parse(loginUrl));
                    break;
                }

                case 'loginWithApiKey': {
                    const token = message.token as string;
                    if (!token) {
                        this.view.webview.postMessage({ command: 'loginResult', success: false, error: 'API key cannot be empty.' });
                        return;
                    }
                    try {
                        await DotShareAuth.storeToken(this.context, token);
                        const verification = await DotShareAuth.verifyToken(this.context);
                        if (verification.valid) {
                            await this.handleFetchProfile();
                            this.view.webview.postMessage({ command: 'loginResult', success: true });
                        } else if (verification.reason === 'server_error') {
                            // Token saved but server unreachable — still show as connected
                            await this.handleFetchProfile();
                            this.view.webview.postMessage({ command: 'loginResult', success: true, warning: 'Server unreachable — key saved, will verify later.' });
                        } else {
                            await DotShareAuth.logout(this.context);
                            this.view.webview.postMessage({ command: 'loginResult', success: false, error: 'Invalid API key. Check it and try again.' });
                        }
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : String(error);
                        this.view.webview.postMessage({ command: 'loginResult', success: false, error: msg });
                    }
                    break;
                }

                default:
                    Logger.info('[MessageHandler] Unhandled command:', cmd);
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Error: ${errorMessage}`);
        }
    }

    private async handleFetchProfile(): Promise<void> {
        try {
            const token = await DotShareAuth.getToken(this.context);
            if (!token) {
                Logger.info("[MessageHandler] No API token found, skipping profile fetch.");
                vscode.window.showInformationMessage("Please log in to view your profile and connect your accounts.", "Log In").then(selection => {
                    if (selection === "Log In") {
                        const BASE_URL = DOTSUITE_WEB_URL;
                        const scheme = vscode.env.uriScheme;
                        const loginUrl = `${BASE_URL}/en/login?intent=vscode&scheme=${scheme}`;
                        vscode.env.openExternal(vscode.Uri.parse(loginUrl));
                    }
                });
                this.view.webview.postMessage({ command: 'LOGOUT_SUCCESS' });
                return;
            }

            const baseUrl = DotShareAuth.getApiBaseUrl();
            const response = await axios.get(`${baseUrl}/v1/users/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                validateStatus: () => true // Prevent axios from throwing on 4xx/5xx
            });

            if (response.status >= 200 && response.status < 300) {
                this.view.webview.postMessage({ command: 'SET_PROFILE', data: response.data });
                // 🔥 Sync connections immediately after profile fetch so UI buttons unlock automatically
                this.postHandler.handleMessage({ command: 'loadOAuthConnections' });
            } else if (response.status === 401) {
                Logger.warn("[MessageHandler] Token invalid or expired (401). Auto-logging out.");
                await DotShareAuth.logout(this.context);
                vscode.window.showErrorMessage("Session expired. Please log in again.");
                this.view.webview.postMessage({ command: 'LOGOUT_SUCCESS' });
            } else {
                Logger.warn(`[MessageHandler] Failed to fetch profile: ${response.status}`);
                vscode.window.showErrorMessage(`Failed to load profile (Status: ${response.status}).`);
            }
        } catch (error: unknown) {
            Logger.error('[MessageHandler] Error fetching profile:', error);
            // Exit loading state gracefully — token may still be valid, just no network
            this.view.webview.postMessage({ command: 'LOGOUT_SUCCESS' });
        }
    }

    private async handleSelectMediaFiles(): Promise<void> {
        try {
            const fileUris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: true,
                filters: {
                    'Images': ['jpg', 'jpeg', 'png', 'gif'],
                    'Videos': ['mp4'],
                    'All supported': ['jpg', 'jpeg', 'png', 'gif', 'mp4']
                },
                openLabel: 'Select Media Files from Anywhere'
            });

            if (fileUris && fileUris.length > 0) {
                const mediaFiles: Array<{
                    mediaPath: string;
                    mediaFilePath: string;
                    fileName: string;
                    fileSize: number;
                }> = [];

                for (const uri of fileUris) {
                    try {
                        const stats = await vscode.workspace.fs.stat(uri);
                        const fileName = path.basename(uri.fsPath);
                        const fileSize = stats.size;

                        mediaFiles.push({
                            mediaPath: uri.fsPath,
                            mediaFilePath: uri.fsPath,
                            fileName: fileName,
                            fileSize: fileSize
                        });
                    } catch (error: unknown) {
                        Logger.warn(`[MessageHandler] Could not get stats for ${uri.fsPath}:`, error);
                    }
                }

                if (mediaFiles.length > 0) {
                    this.view.webview.postMessage({
                        command: 'mediaSelected',
                        mediaFiles: mediaFiles
                    });

                    this.sendSuccess(`${mediaFiles.length} file(s) selected successfully!`);
                }
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Error selecting files: ${errorMessage}`);
        }
    }

    private async handleUploadFile(message: Message): Promise<void> {
        try {
            const file = message.file as { name: string; size: number; type: string; base64Data: string } | undefined;

            if (!file || !file.name || !file.base64Data) {
                this.sendError('Invalid file data provided.');
                return;
            }

            this.view.webview.postMessage({ command: 'status', status: 'Uploading media to Cloudflare R2...', type: 'info' });

            // Sanitize client-supplied values before forwarding to the backend.
            // The Rust server validates via magic bytes too, but this is defence-in-depth.
            const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            const sanitizedType = ALLOWED_TYPES.includes(file.type) ? file.type : 'image/jpeg';
            // Strip any path components and restrict to safe characters
            const sanitizedName = (file.name || 'upload')
                .replace(/.*[/\\]/, '')             // strip path traversal
                .replace(/[^a-zA-Z0-9._-]/g, '_')  // replace unsafe chars
                .substring(0, 64);

            const result = await SchedulerClient.uploadMediaBase64(this.context, sanitizedName, file.base64Data, sanitizedType);


            if (result.success && result.url) {
                this.view.webview.postMessage({
                    command: 'fileUploaded',
                    mediaPath: result.url,
                    mediaFilePath: result.url,
                    fileName: file.name,
                    fileSize: file.size,
                    threadIndex: message.threadIndex,
                    // Echo back so the webview can replace the drag-and-drop placeholder in-place
                    placeholderRef: message.placeholderRef ?? null
                });

                this.sendSuccess(`File "${file.name}" uploaded successfully!`);
            } else {
                this.sendError(result.message || 'Failed to upload media to server.');
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Error uploading file: ${errorMessage}`);
        }
    }

    private async handleAttachMedia(message: Message): Promise<void> {
        try {
            const mediaFilePath = message.mediaFilePath as string | undefined;
            const mediaFilePaths = message.mediaFilePaths as string[] | undefined;
            const mediaPath = message.mediaPath as string | undefined;
            const fileName = message.fileName as string | undefined;
            const fileSize = message.fileSize as number | undefined;

            if (mediaFilePaths && Array.isArray(mediaFilePaths)) {
                const mediaFiles = mediaFilePaths.map((filePath: string) => ({
                    mediaPath: filePath,
                    mediaFilePath: filePath,
                    fileName: fileName || path.basename(filePath),
                    fileSize: fileSize || 0
                }));

                this.view.webview.postMessage({
                    command: 'mediaAttached',
                    mediaFiles: mediaFiles
                });

                this.sendSuccess(`${mediaFilePaths.length} file(s) attached successfully!`);
            }
            else if (mediaFilePath || mediaPath) {
                const filePath = mediaFilePath || mediaPath || '';
                const mediaFiles = [{
                    mediaPath: mediaPath || filePath,
                    mediaFilePath: filePath,
                    fileName: fileName || path.basename(filePath),
                    fileSize: fileSize || 0
                }];

                this.view.webview.postMessage({
                    command: 'mediaAttached',
                    mediaFiles: mediaFiles
                });

                this.sendSuccess(`File attached successfully!`);
            } else {
                this.sendError('No media files provided for attachment.');
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Error attaching media: ${errorMessage}`);
        }
    }

    private async handleRemoveMedia(): Promise<void> {
        try {
            this.view.webview.postMessage({
                command: 'mediaRemoved'
            });

            this.sendSuccess('Media attachment removed.');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Error removing media: ${errorMessage}`);
        }
    }
    /**
     * Handle GitHub Gist authentication using VS Code's built-in GitHub provider
     * This is the "magic" — VS Code handles OAuth, token storage, and refresh automatically!
     */
    private async handleGitHubGistAuth(): Promise<void> {
        try {
            Logger.info('[MessageHandler] Starting VS Code GitHub authentication for Gist...');

            // Request GitHub session with 'gist' scope
            // This pops up a dialog asking the user for permission
            const session = await vscode.authentication.getSession('github', ['gist'], { createIfNone: true });

            if (!session || !session.accessToken) {
                this.sendError('Failed to get GitHub authentication token');
                Logger.warn('[MessageHandler] GitHub authentication session is empty');
                return;
            }

            // Store token securely via TokenManager
            await TokenManager.setToken('github', session.accessToken);

            Logger.info('[MessageHandler] ✅ GitHub Gist authentication successful!');
            Logger.info(`[MessageHandler] GitHub user: ${session.account.label}`);

            // Notify UI of successful authentication
            this.view.webview.postMessage({
                command: 'gitHubAuthSuccess',
                user: session.account.label
            });

            this.sendSuccess(`✅ Connected to GitHub as ${session.account.label}`);

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error('[MessageHandler] GitHub authentication failed:', errorMessage);

            // User cancelled the auth dialog or network error
            if (errorMessage.includes('User cancelled')) {
                Logger.info('[MessageHandler] User cancelled GitHub authentication');
                return; // Silent fail for user cancellation
            }

            this.sendError(`GitHub authentication failed: ${errorMessage}`);
        }
    }
    private isValidMessage(message: unknown): message is Message {
        return typeof message === 'object' && message !== null && 'command' in message && typeof (message as Message).command === 'string';
    }

    private sendSuccess(message: string) {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'success' });
    }

    private sendError(message: string) {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'error' });
    }
}
