#!/usr/bin/env node

/**
 * DotShare CLI Scheduler
 * Runs scheduled posts independently of VS Code
 * Usage: node bin/dotshare-scheduler.js [--config config.json]
 */

// MUST set up mocking BEFORE any other imports/requires
const mockVscode = {
    window: null, // This makes isVscodeEnvironment = false
    Uri: null,
    env: null
};

// Override require globally to intercept 'vscode' imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

// Override the module resolution
Module._load = function(request, parent) {
    if (request === 'vscode') {
        return mockVscode;
    }
    return originalLoad.apply(this, arguments);
};

// Also override resolve to prevent filesystem lookup
Module._resolveFilename = function(request, parent, isMain) {
    if (request === 'vscode') {
        return 'vscode';
    }
    return originalResolveFilename.apply(this, arguments);
};

// Cache the mocked module
require.cache['vscode'] = {
    id: 'vscode',
    filename: 'vscode',
    loaded: true,
    exports: mockVscode
};

// Now we can import safely
const fs = require('fs');
const path = require('path');

// Now require the modules after mocking vscode
const { ScheduledPostsStorage } = require('../out/scheduled-posts.js');
const { Scheduler } = require('../out/scheduler.js');
const { shareToLinkedIn } = require('../out/linkedin.js');
const { shareToTelegram } = require('../out/telegram.js');

// Default config location
const DEFAULT_CONFIG_PATH = path.join(require('os').homedir(), '.dotshare-config.json');

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    let configPath = DEFAULT_CONFIG_PATH;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--config' && i + 1 < args.length) {
            configPath = args[i + 1];
            i++;
        } else if (args[i] === '--help' || args[i] === '-h') {
            showHelp();
            process.exit(0);
        }
    }

    return { configPath };
}

function showHelp() {
    console.log(`
DotShare CLI Scheduler

Runs scheduled social media posts independently of VS Code.

USAGE:
    node bin/dotshare-scheduler.js [OPTIONS]

OPTIONS:
    --config PATH    Path to config file (default: ~/.dotshare-config.json)
    --help, -h       Show this help message

CONFIG FILE FORMAT:
{
  "storagePath": "/home/user/.config/Code/User/globalStorage/freerave.dotshare",
  "credentials": {
    "linkedinToken": "your_linkedin_token_here",
    "telegramBot": "your_telegram_bot_token",
    "telegramChat": "your_telegram_chat_id"
  }
}

EXAMPLE CRON SETUP (Linux/Mac):
# Check every 5 minutes
*/5 * * * * cd /path/to/dotshare && /usr/bin/node bin/dotshare-scheduler.js

# Check every minute
* * * * * cd /path/to/dotshare && /usr/bin/node bin/dotshare-scheduler.js
`);
}

// Load configuration from file
function loadConfig(configPath) {
    try {
        if (!fs.existsSync(configPath)) {
            console.error(`Config file not found: ${configPath}`);
            console.error('Please create the config file with your credentials.');
            console.error('Run with --help for config file format.');
            process.exit(1);
        }

        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);

        if (!config.storagePath) {
            console.error('Config error: storagePath is required');
            process.exit(1);
        }

        if (!config.credentials) {
            config.credentials = {};
        }

        return config;
    } catch (error) {
        console.error('Error loading config:', error.message);
        process.exit(1);
    }
}

// Create credentials getter that uses the static credentials from config
function createCredentialsGetter(credentials) {
    return async () => ({
        linkedinToken: credentials.linkedinToken,
        telegramBot: credentials.telegramBot,
        telegramChat: credentials.telegramChat
    });
}

// Main function
async function main() {
    console.log('🚀 Starting DotShare CLI Scheduler...\n');

    const args = parseArgs();
    const config = loadConfig(args.configPath);

    console.log(`📂 Using storage path: ${config.storagePath}`);
    console.log('🔐 Credentials loaded');

    // Create storage
    const storage = new ScheduledPostsStorage(config.storagePath);

    // Create logger callbacks for CLI
    const loggerCallbacks = {
        onSuccess: (message) => console.log(`✅ ${message}`),
        onError: (message) => console.error(`❌ ${message}`),
        onOpenLink: (url) => console.log(`🔗 Link prepared: ${url}`)
    };

    // Create scheduler with credentials getter
    const credentialsGetter = createCredentialsGetter(config.credentials || {});
    const scheduler = new Scheduler(config.storagePath, undefined, credentialsGetter, loggerCallbacks);

    console.log('⏰ Starting scheduler...\n');

    // Start the scheduler
    scheduler.start();

    // Keep the process running
    process.on('SIGINT', () => {
        console.log('\n⏹️  Stopping scheduler...');
        scheduler.stop();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n⏹️  Stopping scheduler...');
        scheduler.stop();
        process.exit(0);
    });
}

// Run main function
main().catch(error => {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
});
