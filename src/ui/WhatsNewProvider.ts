import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class WhatsNewProvider {
    public static readonly viewType = 'whatsNew';

    public static async show(context: vscode.ExtensionContext): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            WhatsNewProvider.viewType,
            "What's New in DotShare",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [context.extensionUri]
            }
        );

        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'close':
                        panel.dispose();
                        return;
                }
            },
            undefined,
            context.subscriptions
        );

        panel.webview.html = await WhatsNewProvider.getHtmlForWebview(panel.webview, context.extensionUri);
    }

    private static async getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri): Promise<string> {
        const whatsNewPath = path.join(extensionUri.fsPath, 'WHATS_NEW.md');

        let markdownContent = '';
        try {
            markdownContent = await fs.promises.readFile(whatsNewPath, 'utf-8');
        } catch (error) {
            markdownContent = '# Error Loading Updates\n\nCould not load the updates file. Please check if WHATS_NEW.md exists.';
        }

        const htmlContent = WhatsNewProvider.markdownToHtml(markdownContent);
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'assets', 'style.css'));

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>What's New in DotShare</title>
                <link href="${cssUri.toString()}" rel="stylesheet">
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        margin: 0;
                        padding: 20px;
                        line-height: 1.6;
                    }
                    .whats-new-container { max-width: 800px; margin: 0 auto; }

                    /* Typography */
                    h1 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; margin-bottom: 20px; font-size: 2em; color: var(--vscode-textLink-foreground); }
                    h2 { margin-top: 30px; margin-bottom: 15px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px; color: var(--vscode-textLink-foreground); }
                    h3 { margin-top: 20px; color: var(--vscode-editor-foreground); opacity: 0.9; }
                    p { margin-bottom: 15px; }
                    ul { padding-left: 20px; margin-bottom: 15px; }
                    li { margin-bottom: 5px; }
                    strong { color: var(--vscode-textPreformat-foreground); }
                    em { opacity: 0.8; }
                    a { color: var(--vscode-textLink-foreground); text-decoration: none; }
                    a:hover { text-decoration: underline; }

                    /* Table Styles for Video Thumbnails */
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 8px; overflow: hidden; }
                    th { background: var(--vscode-button-background); color: var(--vscode-button-foreground); padding: 10px; text-align: center; }
                    td { padding: 15px; text-align: center; border: 1px solid var(--vscode-panel-border); }
                    img { max-width: 100%; height: auto; border-radius: 6px; transition: transform 0.2s; }
                    img:hover { transform: scale(1.02); }

                    /* Close Button */
                    .close-button {
                        position: fixed; top: 20px; right: 20px; z-index: 100;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none; padding: 8px 12px; border-radius: 4px;
                        cursor: pointer; font-family: inherit;
                    }
                    .close-button:hover { background: var(--vscode-button-hoverBackground); }
                </style>
            </head>
            <body>
                <div class="whats-new-container">
                    <button class="close-button" id="closeBtn">✕ Close</button>
                    ${htmlContent}
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    document.getElementById('closeBtn').addEventListener('click', () => {
                        vscode.postMessage({ command: 'close' });
                    });
                </script>
            </body>
            </html>
        `;
    }

    private static markdownToHtml(markdown: string): string {
        let html = markdown;

        // 1. Image Links: [![alt](src)](url) -> <a href="url"><img src="src" alt="alt"></a>
        // Important: Process this BEFORE generic links
        html = html.replace(
            /\[!\[(.*?)\]\((.*?)\)\]\((.*?)\)/g,
            '<a href="$3" target="_blank"><img src="$2" alt="$1"></a>'
        );

        // 2. Images: ![alt](src)
        html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">');

        // 3. Links: [text](url)
        html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

        // 4. Tables (Basic Support for the Changelog grid)
        // Convert header row | ... |
        html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
            if (content.includes('---')) return ''; // Skip separator lines
            const cells = content.split('|').map((c: string) => c.trim()).filter((c: string) => c);
            const tag = match.includes('Complete Architecture') || match.includes('Critical Security') ? 'th' : 'td';
            return `<tr>${cells.map((c: string) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
        });

        // Wrap table rows in <table> (Simple heuristic)
        html = html.replace(/(<tr>[\s\S]*?<\/tr>)/g, '<table>$1</table>');
        // Fix multiple tables merging (cleanup)
        html = html.replace(/<\/table>\s*<table>/g, '');

        // 5. Standard Markdown
        html = html
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^- (.*$)/gim, '<li>$1</li>')
            .replace(/\n\n/g, '<br><br>');

        // 6. Wrap Lists
        html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
        html = html.replace(/<\/ul>\s*<ul>/g, '');

        return html;
    }
}
