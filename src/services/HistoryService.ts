import * as vscode from 'vscode';
import { PostData, HistoricalPost, ShareRecord } from '../types';

export class HistoryService {
    private _onDidChangeHistory = new vscode.EventEmitter<void>();
    public readonly onDidChangeHistory = this._onDidChangeHistory.event;

    constructor(private globalState: vscode.Memento) { }

    private generatePostId(): string {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    public savePost(aiProvider: 'gemini' | 'openai' | 'xai', aiModel: string, postData: PostData): void {
        const history = this.getHistory();
        const historicalPost: HistoricalPost = {
            id: this.generatePostId(),
            timestamp: new Date().toISOString(),
            aiProvider,
            aiModel,
            postData,
            shares: []
        };

        // Keep last 50
        history.unshift(historicalPost);
        if (history.length > 50) history.splice(50);

        this.globalState.update('postHistory', history);
        this.globalState.update('lastPost', postData);
        this._onDidChangeHistory.fire();
    }

    public recordShare(postId: string, platform: ShareRecord['platform'], success: boolean, errorMessage?: string, postIdOnPlatform?: string): void {
        const history = this.getHistory();
        const postIndex = history.findIndex(post => post.id === postId);

        if (postIndex !== -1) {
            const shareRecord: ShareRecord = {
                platform,
                timestamp: new Date().toISOString(),
                success,
                errorMessage,
                postId: postIdOnPlatform
            };
            history[postIndex].shares.push(shareRecord);
            this.globalState.update('postHistory', history);
            this._onDidChangeHistory.fire();
        }
    }

    public getHistory(): HistoricalPost[] {
        return this.globalState.get('postHistory', [] as HistoricalPost[]);
    }

    public getLastPost(): PostData | undefined {
        return this.globalState.get('lastPost');
    }
}
