import * as vscode from 'vscode';
import { DotShareProvider } from './ui/DotShareProvider';
import { WhatsNewProvider } from './ui/WhatsNewProvider';
import { StorageManager } from './storage/storage-manager';
import { AnalyticsPanel } from './ui/AnalyticsPanel';
import { HistoryService } from './services/HistoryService';
import { AnalyticsService } from './services/AnalyticsService';
import { Scheduler } from './core/scheduler';
import { Logger } from './utils/Logger';

export async function activate(context: vscode.ExtensionContext) {
    Logger.info('DotShare extension is now active!');

    // Run migration for legacy data to secure storage
    const storageManager = new StorageManager(context);
    storageManager.migrateLegacyData().catch(Logger.error);

    const historyService = new HistoryService(context.globalState);
    const analyticsService = new AnalyticsService();

    const provider = new DotShareProvider(context.extensionUri, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DotShareProvider.viewType, provider)
    );

    // --- NEW: Register the URI Handler to catch OAuth redirects ---
    const uriHandler = new DotShareUriHandler(context, provider);
    context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));
    // --------------------------------------------------------------

    // Simple commands that just focus the view or show info
    const commands = ['generatePost', 'shareToLinkedIn', 'shareToTelegram'];
    commands.forEach(cmd => {
        context.subscriptions.push(vscode.commands.registerCommand(`dotshare.${cmd}`, () => {
            // You can focus the view here
            vscode.commands.executeCommand('workbench.view.extension.dotshare-activity-bar');
        }));
    });

    // What's New command
    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.whatsNew', () => {
            WhatsNewProvider.show(context);
        })
    );

    // Magic addition: auto-run on update
    await checkVersionAndShowWhatsNew(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('dotshare.showAnalytics', () => {
            AnalyticsPanel.createOrShow(context.extensionUri, historyService, analyticsService);
        })
    );

    // Start the scheduler for scheduled posts
    const storagePath = context.globalStorageUri ? context.globalStorageUri.fsPath : context.extensionPath;

    // Create credentials getter for scheduler
    const credentialsGetter = async () => {
        const linkedinToken = await context.secrets.get('linkedinToken') || '';
        const telegramBot = await context.secrets.get('telegramBot') || '';
        const telegramChat = await context.secrets.get('telegramChat') || '';
        const xAccessToken = await context.secrets.get('xAccessToken') || '';
        const xAccessSecret = await context.secrets.get('xAccessSecret') || '';
        const facebookToken = await context.secrets.get('facebookToken') || '';
        const discordWebhook = await context.secrets.get('discordWebhook') || '';
        const redditAccessToken = await context.secrets.get('redditAccessToken') || '';
        const redditRefreshToken = await context.secrets.get('redditRefreshToken') || '';
        const blueskyIdentifier = await context.secrets.get('blueskyIdentifier') || '';
        const blueskyPassword = await context.secrets.get('blueskyPassword') || '';

        return {
            linkedinToken,
            telegramBot,
            telegramChat,
            xAccessToken,
            xAccessSecret,
            facebookToken,
            discordWebhook,
            redditAccessToken,
            redditRefreshToken,
            blueskyIdentifier,
            blueskyPassword
        };
    };

    const scheduler = new Scheduler(storagePath, undefined, credentialsGetter);
    scheduler.start();

    // Clean up scheduler on deactivation
    context.subscriptions.push({
        dispose: () => scheduler.stop()
    });
}

// Helper function to keep activate clean
async function checkVersionAndShowWhatsNew(context: vscode.ExtensionContext) {
    try {
        const currentVersion = context.extension.packageJSON.version;
        const previousVersion = context.globalState.get<string>('dotshareVersion');

        if (currentVersion !== previousVersion) {
            // If version changed, open what's new page
            WhatsNewProvider.show(context);
            // And save new version so it doesn't open again next time
            await context.globalState.update('dotshareVersion', currentVersion);
        }
    } catch (error) {
        Logger.error('Failed to check for updates:', error);
    }
}

// --- NEW: Custom URI Handler Class ---
class DotShareUriHandler implements vscode.UriHandler {
    constructor(private context: vscode.ExtensionContext, private provider: DotShareProvider) {}

    public async handleUri(uri: vscode.Uri): Promise<void> {
        Logger.info(`Received URI: ${uri.toString()}`);
        
        // Parse the query parameters (e.g., ?token=XYZ)
        const query = new URLSearchParams(uri.query);

        // Check if the redirect is for Facebook Auth
        if (uri.path === '/facebook' || uri.path.includes('facebook')) {
            const token = query.get('token');
            
            if (token) {
                // Save the token securely
                await this.context.secrets.store('facebookToken', token);
                vscode.window.showInformationMessage('DotShare: Facebook connected successfully! 🎉');
                
                // If you have a method in DotShareProvider to refresh the Webview UI, call it here:
                // this.provider.refreshWebview();
            } else {
                vscode.window.showErrorMessage('DotShare: Facebook authentication failed. No token received.');
            }
        }
    }
}
// -------------------------------------

export function deactivate(): void {
    // Cleanup if needed - currently no resources to clean up
}