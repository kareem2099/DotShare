import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { HistoryService } from '../services/HistoryService';
import { AnalyticsService } from '../services/AnalyticsService';
import { MediaService } from '../services/MediaService';
import { ConfigHandler } from './ConfigHandler';
import { RedditHandler } from './RedditHandler';
import { PostHandler } from './PostHandler';
import { Logger } from '../utils/Logger';

interface Message {
    command: string;
    [key: string]: unknown;
}

export class MessageHandler {
    private configHandler: ConfigHandler;
    private redditHandler: RedditHandler;
    private postHandler: PostHandler;

    constructor(
        private view: vscode.WebviewView,
        private context: vscode.ExtensionContext,
        private historyService: HistoryService,
        private analyticsService: AnalyticsService,
        private mediaService: MediaService
    ) {
        // Initialize sub-handlers
        this.configHandler = new ConfigHandler(view, context);
        this.redditHandler = new RedditHandler(view, context, historyService);
        this.postHandler = new PostHandler(view, context, historyService, analyticsService);
    }

    public async handleMessage(message: unknown) {
        if (!this.isValidMessage(message)) {
            Logger.error('Invalid message format');
            return;
        }
        const cmd = message.command;

        // Smart routing based on command patterns - check specific commands first
        if (cmd.startsWith('share') || cmd === 'generatePost' || cmd === 'loadPostHistory' || cmd === 'loadAnalytics' || cmd === 'schedulePost' || cmd === 'editScheduledPost') {
            // Posting and content operations
            await this.postHandler.handleMessage(message);
        }
        else if (cmd.includes('Reddit') || cmd === 'generateRedditTokens' || cmd === 'getRedditFlairs' ||
                 cmd === 'getRedditUserPosts' || cmd === 'editRedditPost' || cmd === 'deleteRedditPost') {
            // Reddit-specific operations
            await this.redditHandler.handleMessage(message);
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

                default:
                    Logger.info('MessageHandler: Unhandled command:', cmd);
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Error: ${errorMessage}`);
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
                        Logger.warn(`Could not get stats for ${uri.fsPath}:`, error);
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

            const storageUri = this.context.globalStorageUri || vscode.Uri.file(path.join(os.tmpdir(), 'dotshare-media'));
            const mediaDir = vscode.Uri.joinPath(storageUri, 'media');

            try {
                await vscode.workspace.fs.createDirectory(mediaDir);
            } catch (error: unknown) {
                Logger.warn('Could not create media directory:', error);
            }

            const binaryString = atob(file.base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const fileName = `${Date.now()}-${file.name}`;
            const fileUri = vscode.Uri.joinPath(mediaDir, fileName);

            await vscode.workspace.fs.writeFile(fileUri, bytes);

            this.view.webview.postMessage({
                command: 'fileUploaded',
                mediaPath: fileUri.fsPath,
                mediaFilePath: fileUri.fsPath,
                fileName: file.name,
                fileSize: file.size
            });

            this.sendSuccess(`File "${file.name}" uploaded successfully!`);

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
