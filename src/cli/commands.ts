import { Command } from 'commander';

import axios from 'axios';
import * as readline from 'readline';
import { ConfigManager } from './config';
import { DEFAULT_SERVER_URL } from '../constants';
import { Logger } from './logger';

let cachedConfigManager: ConfigManager | undefined;
const configManager = (): ConfigManager => cachedConfigManager ??= new ConfigManager();

// Create readline interface for user input
function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

function question(rl: readline.Interface, query: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
}

// Init command
export function setupInitCommand(program: Command) {
    program
        .command('init')
        .description('Initialize DotShare CLI configuration')
        .action(async () => {
            Logger.info('🚀 Welcome to DotShare CLI Setup!\n');

            const rl = createReadlineInterface();

            try {
                // Get server URL
                const currentConfig = configManager().getConfig();
                
                // Use the constant here instead of manually writing the URL
                const defaultServerUrl = currentConfig.serverUrl || DEFAULT_SERVER_URL;

                const serverUrl = await question(rl, `Python server URL [${defaultServerUrl}]: `);
                const finalServerUrl = serverUrl.trim() || defaultServerUrl;

                configManager().setServerUrl(finalServerUrl);
                Logger.info(`✅ Server URL set to: ${finalServerUrl}\n`);

                // Test server connection
                Logger.info('🔍 Testing server connection...');
                try {
                    const response = await axios.get(`${finalServerUrl}/`, { timeout: 5000 });
                    if (response.status === 200) {
                        Logger.info('✅ Server connection successful!\n');
                    }
                } catch {
                    Logger.info('⚠️  Server connection failed. Make sure the Python server is running.\n');
                }

                Logger.info('🎉 DotShare CLI initialized successfully!');
                Logger.info('Next steps:');
                Logger.info('  • Run "dotshare login telegram" to authenticate Telegram');
                Logger.info('  • Run "dotshare login linkedin" to authenticate LinkedIn');

                Logger.info('  • Run "dotshare whoami" to check your setup');
                Logger.info('  • Run "dotshare \'Hello World!\'" to post to all platforms');

            } catch (error) {
                Logger.error('❌ Error during initialization:', error);
            } finally {
                rl.close();
            }
        });
}

// Login commands
export function setupLoginCommand(program: Command) {
    program.command('login <platform>').description('Use named local accounts instead of legacy relay credentials')
        .action(() => {
            Logger.info('Use dotshare accounts add <id> --platform <platform>. Its terminal prompts hide credentials and save them only to the required OS keyring.');
            process.exitCode = 1;
        });
}

// Whoami command
export function setupWhoamiCommand(program: Command) {
    program
        .command('whoami')
        .description('Show current configuration and status')
        .action(() => {
            const config = configManager().getConfig();
            const platforms = configManager().getConfiguredPlatforms();

            Logger.info('🔍 DotShare CLI Status\n');

            Logger.info(`📡 Server URL: ${config.serverUrl}`);

            Logger.info('\n🔐 Authenticated Platforms:');
            if (platforms.length === 0) {
                Logger.info('   None - Run "dotshare login <platform>" to authenticate');
            } else {
                platforms.forEach(platform => {
                    Logger.info(`   ✅ ${platform.charAt(0).toUpperCase() + platform.slice(1)}`);
                });
            }

            Logger.info('\n📊 Configuration:');
            Logger.info(`   Config file: ~/.dotshare/config.json`);

            if (platforms.length > 0) {
                Logger.info('\n🚀 Ready to post! Try:');
                Logger.info('   dotshare accounts list');
                Logger.info('   dotshare drafts list');
            } else {
                Logger.info('\n⚠️  Setup incomplete. Run "dotshare init" to get started.');
            }
        });
}

// Default posting command
export function setupDefaultCommand(program: Command) {
    program.arguments('[message]').option('--media <path>').option('--platforms <list>')
        .description('Legacy publishing is disabled; use saved drafts or publish with named local accounts')
        .action(() => {
            Logger.info('Legacy publishing forwarded platform credentials to a relay and is disabled. Use dotshare-agent accounts add, then drafts preview/publish or publish --input with named local accounts.');
            process.exitCode = 1;
        });
}

export { setupAgentCommands } from '../agent/commands';
