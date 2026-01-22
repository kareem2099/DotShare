import * as vscode from 'vscode';
import { HistoryService } from '../services/HistoryService';
import { Logger } from '../utils/Logger';

interface Message {
    command: string;
    [key: string]: unknown;
}

export class RedditHandler {
    constructor(
        private view: vscode.WebviewView,
        private context: vscode.ExtensionContext,
        private historyService: HistoryService
    ) {}

    public async handleMessage(message: Message): Promise<void> {
        const cmd = message.command;

        try {
            switch (cmd) {
                case 'generateRedditTokens':
                    await this.handleGenerateRedditTokens(message);
                    break;

                case 'getRedditFlairs':
                    await this.handleGetRedditFlairs(message);
                    break;

                case 'getRedditUserPosts':
                    await this.handleGetRedditUserPosts(message);
                    break;

                case 'editRedditPost':
                    await this.handleEditRedditPost(message);
                    break;

                case 'deleteRedditPost':
                    await this.handleDeleteRedditPost(message);
                    break;

                default:
                    Logger.info('RedditHandler: Unhandled command:', cmd);
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.sendError(`Reddit error: ${errorMessage}`);
        }
    }

    private async handleGenerateRedditTokens(message: Message): Promise<void> {
        const clientId = message.redditClientId as string | undefined;
        const clientSecret = message.redditClientSecret as string | undefined;
        const username = message.redditUsername as string | undefined;
        const password = message.redditPassword as string | undefined;

        if (!clientId || !clientSecret || !username || !password ||
            clientId.trim() === '' || clientSecret.trim() === '' ||
            username.trim() === '' || password.trim() === '') {
            this.view.webview.postMessage({
                command: 'status',
                status: 'All Reddit credentials are required. Please fill in Client ID, Secret, Username, and Password.',
                type: 'error'
            });
            return;
        }

        const savedClientId = await this.context.secrets.get('redditClientId') || '';
        const savedClientSecret = await this.context.secrets.get('redditClientSecret') || '';
        const savedUsername = await this.context.secrets.get('redditUsername') || '';
        const savedPassword = await this.context.secrets.get('redditPassword') || '';
        const savedApiName = this.context.globalState.get('redditApiName', '');
        const savedAccessToken = await this.context.secrets.get('redditAccessToken') || '';

        const currentClientId = clientId.trim();
        const currentClientSecret = clientSecret.trim();
        const currentUsername = username.trim();
        const currentPassword = password.trim();
        const currentApiName = (message.redditApiName as string) || 'Reddit Account';

        const configChanged = (
            savedClientId !== currentClientId ||
            savedClientSecret !== currentClientSecret ||
            savedUsername !== currentUsername ||
            savedPassword !== currentPassword ||
            savedApiName !== currentApiName
        );

        const userEnteredAccessToken = (message.redditAccessToken as string | undefined)?.trim();
        if (userEnteredAccessToken && !configChanged) {
            this.view.webview.postMessage({
                command: 'status',
                status: 'You already have a Reddit access token in the field. Clear the access token field if you want to generate a new one.',
                type: 'error'
            });
            return;
        }

        await this.context.secrets.store('redditClientId', currentClientId);
        await this.context.secrets.store('redditClientSecret', currentClientSecret);
        await this.context.secrets.store('redditUsername', currentUsername);
        await this.context.secrets.store('redditPassword', currentPassword);
        this.context.globalState.update('redditApiName', currentApiName);

        const { generateRedditTokens } = await import('../reddit');
        const tokenData = await generateRedditTokens(
            currentClientId,
            currentClientSecret,
            currentUsername,
            currentPassword
        );

        await this.context.secrets.store('redditAccessToken', tokenData.access_token || '');
        if (tokenData.refresh_token) {
            await this.context.secrets.store('redditRefreshToken', tokenData.refresh_token);
        } else {
            await this.context.secrets.delete('redditRefreshToken');
        }

        const successMessage = configChanged && savedAccessToken
            ? 'Reddit tokens regenerated successfully! Old token replaced.'
            : 'Reddit tokens generated successfully!';

        this.view.webview.postMessage({
            command: 'redditTokensGenerated',
            tokens: {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token
            }
        });

        this.sendSuccess(successMessage);
    }

    private async handleGetRedditFlairs(message: Message): Promise<void> {
        const accessToken = await this.context.secrets.get('redditAccessToken') || '';

        if (!accessToken) {
            this.sendError('Reddit access token required.');
            return;
        }

        const { getRedditFlairs } = await import('../reddit');
        const subreddit = message.subreddit as string;
        const flairs = await getRedditFlairs(accessToken, subreddit);
        this.view.webview.postMessage({
            command: 'redditFlairsLoaded',
            subreddit: subreddit,
            flairs: flairs
        });
    }

    private async handleGetRedditUserPosts(message: Message): Promise<void> {
        const accessToken = await this.context.secrets.get('redditAccessToken') || '';

        if (!accessToken) {
            this.sendError('Reddit access token required.');
            return;
        }

        const { getRedditUserPosts } = await import('../reddit');
        const username = message.username as string;
        const limit = message.limit as number | undefined;
        const posts = await getRedditUserPosts(accessToken, username, limit);
        this.view.webview.postMessage({
            command: 'redditUserPostsRetrieved',
            posts: posts
        });
    }

    private async handleEditRedditPost(message: Message): Promise<void> {
        const accessToken = await this.context.secrets.get('redditAccessToken') || '';

        if (!accessToken) {
            this.sendError('Reddit credentials required.');
            return;
        }

        const { editRedditPost } = await import('../reddit');
        const postId = message.postId as string;
        const newText = message.newText as string;
        const success = await editRedditPost(accessToken, postId, newText);

        if (success) {
            this.sendSuccess('Reddit post updated successfully!');
        } else {
            this.sendError('Failed to update Reddit post.');
        }
    }

    private async handleDeleteRedditPost(message: Message): Promise<void> {
        const accessToken = await this.context.secrets.get('redditAccessToken') || '';

        if (!accessToken) {
            this.sendError('Reddit credentials required.');
            return;
        }

        const { deleteRedditPost } = await import('../reddit');
        const postId = message.postId as string;
        const success = await deleteRedditPost(accessToken, postId);

        if (success) {
            this.sendSuccess('Reddit post deleted successfully!');
        } else {
            this.sendError('Failed to delete Reddit post.');
        }
    }

    private sendSuccess(message: string) {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'success' });
    }

    private sendError(message: string) {
        this.view.webview.postMessage({ command: 'status', status: message, type: 'error' });
    }
}
