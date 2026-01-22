import * as vscode from 'vscode';
import { AnalyticsService } from '../services/AnalyticsService';
import { HistoryService } from '../services/HistoryService';

export class AnalyticsPanel {
    public static currentPanel: AnalyticsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, private readonly historyService: HistoryService, private readonly analyticsService: AnalyticsService) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._update(); // Initial render

        // Real-time updates
        historyService.onDidChangeHistory(() => {
            this._update();
        }, null, this._disposables);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri, historyService: HistoryService, analyticsService: AnalyticsService) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (AnalyticsPanel.currentPanel) {
            AnalyticsPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dotShareAnalytics',
            'DotShare Analytics',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        AnalyticsPanel.currentPanel = new AnalyticsPanel(panel, extensionUri, historyService, analyticsService);
    }

    public dispose() {
        AnalyticsPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const history = this.historyService.getHistory();
        const stats = this.analyticsService.calculate(history);

        // Calculate max value for bar charts to normalize
        const maxPlatformShares = Math.max(
            stats.linkedinShares, stats.telegramShares, stats.xShares,
            stats.facebookShares, stats.discordShares, stats.redditShares, stats.blueskyShares,
            1 // Avoid division by zero
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DotShare Analytics</title>
    <style>
        :root {
            --primary: #3794ff;
            --success: #4caf50;
            --danger: #f44336;
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --card-bg: var(--vscode-editor-inactiveSelectionBackground); 
            --border: var(--vscode-panel-border);
        }
        
        body {
            background-color: var(--bg);
            color: var(--fg);
            font-family: var(--vscode-font-family);
            padding: 20px;
            max-width: 900px;
            margin: 0 auto;
        }

        h1, h2, h3 { font-weight: 500; }
        
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 30px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 20px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .card {
            background: var(--card-bg);
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }

        .stat-value {
            font-size: 2.5em;
            font-weight: bold;
            color: var(--primary);
            margin: 10px 0;
        }

        .stat-label {
            opacity: 0.8;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .chart-container {
            background: var(--card-bg);
            border-radius: 8px;
            padding: 25px;
            margin-bottom: 30px;
        }

        .bar-chart {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-top: 20px;
        }

        .bar-row {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .bar-label {
            width: 100px;
            text-align: right;
            font-size: 0.9em;
        }

        .bar-track {
            flex: 1;
            background: rgba(255,255,255,0.05);
            height: 24px;
            border-radius: 4px;
            overflow: hidden;
            position: relative;
        }

        .bar-fill {
            height: 100%;
            background: var(--primary);
            border-radius: 4px;
            transition: width 1s ease-out;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding-right: 8px;
            font-size: 0.8em;
            color: white;
            min-width: 2px;
        }
        
        .recent-list {
            list-style: none;
            padding: 0;
        }
        
        .recent-item {
            background: rgba(255,255,255,0.03);
            margin-bottom: 10px;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid var(--primary);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .glass-effect {
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
        }

        /* Success Rate Ring */
        .circle-chart {
            width: 150px;
            height: 150px;
            border-radius: 50%;
            background: conic-gradient(var(--success) ${stats.successRate * 3.6}deg, rgba(255,255,255,0.05) 0deg);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto;
            position: relative;
        }
        
        .circle-inner {
            width: 120px;
            height: 120px;
            background: var(--card-bg);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
        }

        .icon { font-size: 1.2em; margin-right: 5px; }

    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Analytics Dashboard</h1>
        <div style="opacity: 0.7">DotShare v2.2.0</div>
    </div>

    <div class="stats-grid">
        <div class="card">
            <div class="stat-label">Total Posts</div>
            <div class="stat-value">${stats.totalPosts}</div>
            <div>Lifetime shares</div>
        </div>
        
        <div class="card" style="text-align: center;">
            <div class="stat-label">Success Rate</div>
            <div style="margin-top: 15px;">
                <div class="circle-chart">
                    <div class="circle-inner">
                        <span style="font-size: 1.8em; font-weight: bold; color: var(--success)">${stats.successRate}%</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="stat-label">Engagement</div>
            <div class="stat-value">${stats.successfulShares}</div>
            <div style="color: var(--success)">Successful Shares</div>
            <div style="margin-top: 5px; font-size: 0.9em; opacity: 0.7">
                Failed: <span style="color: var(--danger)">${stats.failedShares}</span>
            </div>
        </div>
    </div>

    <div class="chart-container">
        <h3>Platform Distribution</h3>
        <div class="bar-chart">
            ${this._renderBar('LinkedIn', stats.linkedinShares, maxPlatformShares)}
            ${this._renderBar('Twitter / X', stats.xShares, maxPlatformShares)}
            ${this._renderBar('Telegram', stats.telegramShares, maxPlatformShares)}
            ${this._renderBar('Reddit', stats.redditShares, maxPlatformShares)}
            ${this._renderBar('Discord', stats.discordShares, maxPlatformShares)}
            ${this._renderBar('Facebook', stats.facebookShares, maxPlatformShares)}
            ${this._renderBar('BlueSky', stats.blueskyShares, maxPlatformShares)}
        </div>
    </div>

    <div class="chart-container">
        <h3>Recent Specifications</h3>
        <ul class="recent-list">
            ${history.slice(0, 5).map(post => {
            const safeText = post.postData.text
                .replace(/(token|key|auth|secret|password):[^\s]+/gi, '****')
                .replace(/[a-zA-Z0-9]{20,}/g, '****'); // Aggressive catch-all for long strings that look like tokens

            return `
                <li class="recent-item">
                    <div>
                        <div style="font-weight: 500; margin-bottom: 4px;">${safeText.substring(0, 60)}${safeText.length > 60 ? '...' : ''}</div>
                        <div style="font-size: 0.85em; opacity: 0.7;">
                            ${new Date(post.timestamp).toLocaleDateString()} • ${post.aiProvider} • ${post.shares.length} platforms
                        </div>
                    </div>
                    <div style="text-align: right">
                       ${post.shares.map(s => s.success ? '✅' : '❌').join(' ')}
                    </div>
                </li>
            `}).join('')}
            ${history.length === 0 ? '<div style="opacity: 0.5; padding: 10px;">No posts yet. Start sharing to see your history!</div>' : ''}
        </ul>
    </div>
</body>
</html>`;
    }

    private _renderBar(label: string, value: number, max: number): string {
        const percentage = (value / max) * 100;
        return `
            <div class="bar-row">
                <div class="bar-label">${label}</div>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${percentage}%">
                        ${value > 0 ? value : ''}
                    </div>
                </div>
            </div>
        `;
    }
}
