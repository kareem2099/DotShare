import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { GistService } from '../services/GistService';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

interface Message {
    command: string;
    [key: string]: unknown;
}

interface GistDraft {
    fileName: string;
    code: string;
    description: string;
    visibility: 'public' | 'secret';
    timestamp: number;
}

/**
 * GistHandler — Manages GitHub Gist creation and draft saving
 * Handles: createGist, saveGistDraft, loadGistDrafts
 */
export class GistHandler {
    private draftsStorageKey = 'gistDrafts';

    constructor(
        private view: vscode.WebviewView,
        private context: vscode.ExtensionContext
    ) {}

    public async handleMessage(message: unknown): Promise<void> {
        if (!this.isValidMessage(message)) {
            Logger.error('[GistHandler] Invalid message format');
            return;
        }

        const cmd = message.command;

        try {
            switch (cmd) {
                case 'createGist':
                    await this.handleCreateGist(message);
                    break;

                case 'saveGistDraft':
                    await this.handleSaveGistDraft(message);
                    break;

                case 'loadGistDrafts':
                    await this.handleLoadGistDrafts();
                    break;

                case 'deleteGistDraft':
                    await this.handleDeleteGistDraft(message);
                    break;

                default:
                    Logger.info('[GistHandler] Unhandled command:', cmd);
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error('[GistHandler] Error:', errorMessage);
            this.sendError(`Failed to process Gist command: ${errorMessage}`);
        }
    }

    /**
     * Create a GitHub Gist from the provided code
     */
    private async handleCreateGist(message: Message): Promise<void> {
        const fileName = message.fileName as string;
        const code = message.code as string;
        const description = message.description as string;
        const visibility = message.visibility as 'public' | 'secret';

        if (!fileName || !code) {
            this.sendError('File name and code are required');
            return;
        }

        try {
            Logger.info('[GistHandler] Creating gist:', fileName);

            const files = {
                [fileName]: {
                    content: code
                }
            };

            const gistUrl = await GistService.createGist(files, description || '', visibility === 'public');

            if (gistUrl) {
                Logger.info('[GistHandler] Gist created successfully:', gistUrl);

                // Send success response to webview
                this.view.webview.postMessage({
                    command: 'gistCreated',
                    success: true,
                    url: gistUrl
                });

                this.sendSuccess(`✅ Gist created! Opened in browser.`);

                // Open gist in browser
                vscode.env.openExternal(vscode.Uri.parse(gistUrl));
            } else {
                this.view.webview.postMessage({
                    command: 'gistCreated',
                    success: false,
                    error: 'GitHub authentication was cancelled or failed.'
                });
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error('[GistHandler] Failed to create gist:', errorMessage);

            this.sendError(`Failed to create gist: ${errorMessage}`);

            this.view.webview.postMessage({
                command: 'gistCreated',
                success: false,
                error: errorMessage
            });
        }
    }

    /**
     * Save gist draft locally in VS Code storage
     */
    private async handleSaveGistDraft(message: Message): Promise<void> {
        const fileName = message.fileName as string;
        const code = message.code as string;
        const description = message.description as string;
        const visibility = message.visibility as 'public' | 'secret';

        if (!fileName && !code) {
            this.sendError('Nothing to save');
            return;
        }

        try {
            // Load existing drafts
            let drafts: GistDraft[] = this.context.globalState.get(this.draftsStorageKey) || [];

            // Create new draft
            const draft: GistDraft = {
                fileName: fileName || 'untitled.txt',
                code,
                description,
                visibility,
                timestamp: Date.now()
            };

            // Add to drafts (keep last 20)
            drafts = [draft, ...drafts].slice(0, 20);

            // Save to storage
            await this.context.globalState.update(this.draftsStorageKey, drafts);

            Logger.info('[GistHandler] Gist draft saved:', fileName);
            this.sendSuccess(`💾 Draft saved! (${drafts.length} total)`);

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error('[GistHandler] Failed to save draft:', errorMessage);
            this.sendError(`Failed to save draft: ${errorMessage}`);
        }
    }

    /**
     * Load all saved gist drafts
     */
    private async handleLoadGistDrafts(): Promise<void> {
        try {
            const drafts: GistDraft[] = this.context.globalState.get(this.draftsStorageKey) || [];

            this.view.webview.postMessage({
                command: 'gistDraftsLoaded',
                drafts
            });

            Logger.info(`[GistHandler] Loaded ${drafts.length} gist drafts`);

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error('[GistHandler] Failed to load drafts:', errorMessage);
            this.sendError(`Failed to load drafts: ${errorMessage}`);
        }
    }

    /**
     * Delete a saved gist draft
     */
    private async handleDeleteGistDraft(message: Message): Promise<void> {
        const timestamp = message.timestamp as number;

        try {
            let drafts: GistDraft[] = this.context.globalState.get(this.draftsStorageKey) || [];

            // Remove draft with matching timestamp
            drafts = drafts.filter(d => d.timestamp !== timestamp);

            await this.context.globalState.update(this.draftsStorageKey, drafts);

            Logger.info('[GistHandler] Gist draft deleted');
            this.sendSuccess('✅ Draft deleted');

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error('[GistHandler] Failed to delete draft:', errorMessage);
            this.sendError(`Failed to delete draft: ${errorMessage}`);
        }
    }

    private isValidMessage(message: unknown): message is Message {
        return typeof message === 'object' && message !== null && 'command' in message && typeof (message as Message).command === 'string';
    }

    private sendSuccess(message: string): void {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'success' });
    }

    private sendError(message: string): void {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'error' });
    }
}
