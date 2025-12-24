#!/usr/bin/env node

/**
 * Simple CLI to test Telegram posting via the Python server
 * Usage: node test-telegram.js "Your message" --media /path/to/image.jpg
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    let message = '';
    let mediaPath = null;
    let botToken = null;
    let chatId = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            switch (args[i]) {
                case '--media':
                    mediaPath = args[i + 1];
                    i++;
                    break;
                case '--token':
                    botToken = args[i + 1];
                    i++;
                    break;
                case '--chat':
                    chatId = args[i + 1];
                    i++;
                    break;
                case '--help':
                case '-h':
                    showHelp();
                    process.exit(0);
                    break;
            }
        } else if (!message) {
            message = args[i];
        }
    }

    return { message, mediaPath, botToken, chatId };
}

function showHelp() {
    console.log(`
Telegram Test CLI

Test posting to Telegram via the Python server.

USAGE:
    node test-telegram.js "Your message" [OPTIONS]

OPTIONS:
    --media PATH    Path to media file (image/video)
    --token TOKEN   Telegram bot token
    --chat ID       Telegram chat ID
    --help, -h      Show this help

ENVIRONMENT VARIABLES:
    TELEGRAM_BOT_TOKEN    Your Telegram bot token
    TELEGRAM_CHAT_ID      Your Telegram chat ID
    DOTSHARE_SERVER_URL   Python server URL (default: http://localhost:3000)

EXAMPLES:
    node test-telegram.js "Hello World!"
    node test-telegram.js "Check this image" --media ./image.jpg
    node test-telegram.js "Test" --token YOUR_BOT_TOKEN --chat YOUR_CHAT_ID
`);
}

async function main() {
    const { message, mediaPath, botToken, chatId } = parseArgs();

    if (!message) {
        console.error('❌ Error: Message is required');
        console.log('Use --help for usage information');
        process.exit(1);
    }

    // Get credentials from environment or command line
    const finalBotToken = botToken || process.env.TELEGRAM_BOT_TOKEN;
    const finalChatId = chatId || process.env.TELEGRAM_CHAT_ID;
    const serverUrl = process.env.DOTSHARE_SERVER_URL || 'http://localhost:3000';

    if (!finalBotToken) {
        console.error('❌ Error: Telegram bot token not provided');
        console.log('Set TELEGRAM_BOT_TOKEN environment variable or use --token');
        process.exit(1);
    }

    if (!finalChatId) {
        console.error('❌ Error: Telegram chat ID not provided');
        console.log('Set TELEGRAM_CHAT_ID environment variable or use --chat');
        process.exit(1);
    }

    console.log('🚀 Testing Telegram posting...');
    console.log(`📡 Server: ${serverUrl}`);
    console.log(`🤖 Bot: ${finalBotToken.substring(0, 10)}...`);
    console.log(`💬 Chat: ${finalChatId}`);
    console.log(`📝 Message: "${message}"`);

    try {
        // Prepare media URLs (convert to data URLs if file exists)
        let mediaUrls = [];
        if (mediaPath && fs.existsSync(mediaPath)) {
            console.log(`📎 Media: ${mediaPath}`);

            const fileContent = fs.readFileSync(mediaPath);
            const ext = path.extname(mediaPath).toLowerCase();
            let mimeType = 'application/octet-stream';
            if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            else if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.gif') mimeType = 'image/gif';
            else if (ext === '.mp4') mimeType = 'video/mp4';

            const dataUrl = `data:${mimeType};base64,${fileContent.toString('base64')}`;
            mediaUrls = [dataUrl];
        }

        // Send request to Python server
        const response = await axios.post(`${serverUrl}/api/post/telegram`, {
            bot_token: finalBotToken,
            chat_id: finalChatId,
            text: message,
            media_urls: mediaUrls
        }, {
            timeout: 30000
        });

        if (response.data.success) {
            console.log('✅ Success!');
            console.log(`📨 ${response.data.message}`);
        } else {
            console.error('❌ Failed!');
            console.error(`Error: ${response.data.error}`);
        }

    } catch (error) {
        console.error('❌ Request failed!');
        if (error.code === 'ECONNREFUSED') {
            console.error('💡 Make sure the Python server is running on port 3000');
        } else if (error.response) {
            console.error(`Server error: ${error.response.status}`);
            console.error(`Details: ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            console.error(`Error: ${error.message}`);
        }
        process.exit(1);
    }
}

// Run the CLI
main().catch(error => {
    console.error('💥 Unexpected error:', error.message);
    process.exit(1);
});
