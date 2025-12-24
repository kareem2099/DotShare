import { Command } from 'commander';

import axios from 'axios';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from './config';
import { DEFAULT_SERVER_URL } from '../constants';

// Platform-specific payload interfaces
interface TelegramPayload {
    text: string;
    media_urls: string[];
    bot_token: string;
    chat_id: string;
}

interface LinkedInPayload {
    text: string;
    media_urls: string[];
    access_token: string;
}

interface RedditPayload {
    text: string;
    media_urls: string[];
    access_token: string;
    subreddit: string;
    title: string;
}

// Union type for payload that can be any platform-specific type
type PlatformPayload = TelegramPayload | LinkedInPayload | RedditPayload;

const configManager = new ConfigManager();

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
            console.log('🚀 Welcome to DotShare CLI Setup!\n');

            const rl = createReadlineInterface();

            try {
                // Get server URL
                const currentConfig = configManager.getConfig();
                
                // ✅ 2. استخدام الثابت هنا بدلاً من كتابة الرابط يدوياً
                const defaultServerUrl = currentConfig.serverUrl || DEFAULT_SERVER_URL;

                const serverUrl = await question(rl, `Python server URL [${defaultServerUrl}]: `);
                const finalServerUrl = serverUrl.trim() || defaultServerUrl;

                configManager.setServerUrl(finalServerUrl);
                console.log(`✅ Server URL set to: ${finalServerUrl}\n`);

                // Test server connection
                console.log('🔍 Testing server connection...');
                try {
                    const response = await axios.get(`${finalServerUrl}/`, { timeout: 5000 });
                    if (response.status === 200) {
                        console.log('✅ Server connection successful!\n');
                    }
                } catch (error) {
                    console.log('⚠️  Server connection failed. Make sure the Python server is running.\n');
                }

                console.log('🎉 DotShare CLI initialized successfully!');
                console.log('Next steps:');
                console.log('  • Run "dotshare login telegram" to authenticate Telegram');
                console.log('  • Run "dotshare login linkedin" to authenticate LinkedIn');
                console.log('  • Run "dotshare login reddit" to authenticate Reddit');
                console.log('  • Run "dotshare whoami" to check your setup');
                console.log('  • Run "dotshare \'Hello World!\'" to post to all platforms');

            } catch (error) {
                console.error('❌ Error during initialization:', error);
            } finally {
                rl.close();
            }
        });
}

// Login commands
export function setupLoginCommand(program: Command) {
    const loginCmd = program
        .command('login')
        .description('Authenticate with social platforms');

    loginCmd
        .command('telegram')
        .description('Authenticate with Telegram')
        .action(async () => {
            console.log('🔐 Telegram Authentication');
            console.log('This will open your browser to authenticate with Telegram.\n');

            const config = configManager.getConfig();
            const serverUrl = config.serverUrl;

            try {
                // Check server connection
                await axios.get(`${serverUrl}/`, { timeout: 3000 });

                // Open browser to Python server
                const authUrl = `${serverUrl}/?provider=telegram`;
                console.log(`🌐 Opening: ${authUrl}`);
                // Dynamic import used correctly here
                const open = (await import('open')).default;
                await open(authUrl);

                console.log('\n📝 Instructions:');
                console.log('1. Complete the authentication in your browser');
                console.log('2. Copy the access token from the success page');
                console.log('3. Run the following command with your token:');
                console.log('   dotshare login telegram --token YOUR_TOKEN --chat YOUR_CHAT_ID');

                // Wait for user to provide token
                const rl = createReadlineInterface();
                try {
                    const token = await question(rl, '\nEnter Telegram bot token: ');
                    const chatId = await question(rl, 'Enter Telegram chat ID: ');

                    if (token.trim() && chatId.trim()) {
                        configManager.setTelegramCredentials(token.trim(), chatId.trim());
                        console.log('✅ Telegram credentials saved!');
                    } else {
                        console.log('❌ Token or chat ID cannot be empty');
                    }
                } finally {
                    rl.close();
                }

            } catch (error) {
                console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
                console.log('💡 Make sure the Python server is running on', serverUrl);
            }
        });

    loginCmd
        .command('linkedin')
        .description('Authenticate with LinkedIn')
        .action(async () => {
            console.log('🔐 LinkedIn Authentication');
            console.log('This will open your browser to authenticate with LinkedIn.\n');

            const config = configManager.getConfig();
            const serverUrl = config.serverUrl;

            try {
                // Check server connection
                await axios.get(`${serverUrl}/`, { timeout: 3000 });

                // Open browser to Python server
                const authUrl = `${serverUrl}/?provider=linkedin`;
                console.log(`🌐 Opening: ${authUrl}`);
                const open = (await import('open')).default;
                await open(authUrl);

                console.log('\n📝 Instructions:');
                console.log('1. Complete the LinkedIn OAuth flow in your browser');
                console.log('2. Copy the access token from the success page');
                console.log('3. Run the following command with your token:');
                console.log('   dotshare login linkedin --token YOUR_TOKEN');

                // Wait for user to provide token
                const rl = createReadlineInterface();
                try {
                    const token = await question(rl, '\nEnter LinkedIn access token: ');

                    if (token.trim()) {
                        configManager.setLinkedInToken(token.trim());
                        console.log('✅ LinkedIn credentials saved!');
                    } else {
                        console.log('❌ Token cannot be empty');
                    }
                } finally {
                    rl.close();
                }

            } catch (error) {
                console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
                console.log('💡 Make sure the Python server is running on', serverUrl);
            }
        });

    loginCmd
        .command('reddit')
        .description('Authenticate with Reddit')
        .action(async () => {
            console.log('🔐 Reddit Authentication');
            console.log('This will open your browser to authenticate with Reddit.\n');

            const config = configManager.getConfig();
            const serverUrl = config.serverUrl;

            try {
                // Check server connection
                await axios.get(`${serverUrl}/`, { timeout: 3000 });

                // Open browser to Python server
                const authUrl = `${serverUrl}/?provider=reddit`;
                console.log(`🌐 Opening: ${authUrl}`);
                const open = (await import('open')).default;
                await open(authUrl);

                console.log('\n📝 Instructions:');
                console.log('1. Complete the Reddit OAuth flow in your browser');
                console.log('2. Copy the access token from the success page');
                console.log('3. Run the following command with your token:');
                console.log('   dotshare login reddit --token YOUR_TOKEN');

                // Wait for user to provide token
                const rl = createReadlineInterface();
                try {
                    const token = await question(rl, '\nEnter Reddit access token: ');
                    const refreshToken = await question(rl, 'Enter Reddit refresh token (optional): ');

                    if (token.trim()) {
                        configManager.setRedditCredentials(token.trim(), refreshToken.trim() || undefined);
                        console.log('✅ Reddit credentials saved!');
                    } else {
                        console.log('❌ Token cannot be empty');
                    }
                } finally {
                    rl.close();
                }

            } catch (error) {
                console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
                console.log('💡 Make sure the Python server is running on', serverUrl);
            }
        });
}

// Whoami command
export function setupWhoamiCommand(program: Command) {
    program
        .command('whoami')
        .description('Show current configuration and status')
        .action(() => {
            const config = configManager.getConfig();
            const platforms = configManager.getConfiguredPlatforms();

            console.log('🔍 DotShare CLI Status\n');

            console.log(`📡 Server URL: ${config.serverUrl}`);

            console.log('\n🔐 Authenticated Platforms:');
            if (platforms.length === 0) {
                console.log('   None - Run "dotshare login <platform>" to authenticate');
            } else {
                platforms.forEach(platform => {
                    console.log(`   ✅ ${platform.charAt(0).toUpperCase() + platform.slice(1)}`);
                });
            }

            console.log('\n📊 Configuration:');
            console.log(`   Config file: ~/.dotshare/config.json`);

            if (platforms.length > 0) {
                console.log('\n🚀 Ready to post! Try:');
                console.log('   dotshare "Hello from CLI!"');
                console.log('   dotshare "Check this image" --media ./image.jpg');
            } else {
                console.log('\n⚠️  Setup incomplete. Run "dotshare init" to get started.');
            }
        });
}

// Default posting command
export function setupDefaultCommand(program: Command) {
    program
        .arguments('[message]')
        .option('--media <path>', 'Path to media file')
        .option('--platforms <list>', 'Comma-separated list of platforms (telegram,linkedin,reddit)')
        .description('Post message to configured platforms')
        .action(async (message: string | undefined, options: { media?: string; platforms?: string }) => {
            if (!message && !options.media) {
                console.log('❌ Error: Message or media file is required\n');
                console.log('Usage examples:');
                console.log('  dotshare "Hello World!"');
                console.log('  dotshare --media ./image.jpg');
                console.log('  dotshare "Check this out" --media ./video.mp4 --platforms telegram,linkedin');
                return;
            }

            const config = configManager.getConfig();
            const availablePlatforms = configManager.getConfiguredPlatforms();

            if (availablePlatforms.length === 0) {
                console.log('❌ No platforms configured. Run "dotshare login <platform>" first.');
                return;
            }

            // Parse platforms option
            let targetPlatforms: ('telegram' | 'linkedin' | 'reddit')[];
            if (options.platforms) {
                targetPlatforms = options.platforms.split(',').map(p => p.trim().toLowerCase()) as ('telegram' | 'linkedin' | 'reddit')[];
                // Validate platforms
                const invalidPlatforms = targetPlatforms.filter(p => !availablePlatforms.includes(p));
                if (invalidPlatforms.length > 0) {
                    console.log(`❌ Invalid platforms: ${invalidPlatforms.join(', ')}`);
                    console.log(`Available platforms: ${availablePlatforms.join(', ')}`);
                    return;
                }
            } else {
                targetPlatforms = availablePlatforms;
            }

            console.log('🚀 Posting to platforms:', targetPlatforms.join(', '));

            // Prepare media data URLs if media file provided
            let mediaUrls: string[] = [];
            if (options.media && fs.existsSync(options.media)) {
                console.log(`📎 Media: ${options.media}`);

                const fileContent = fs.readFileSync(options.media);
                const ext = path.extname(options.media).toLowerCase();
                let mimeType = 'application/octet-stream';
                if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
                else if (ext === '.png') mimeType = 'image/png';
                else if (ext === '.gif') mimeType = 'image/gif';
                else if (ext === '.mp4') mimeType = 'video/mp4';

                const dataUrl = `data:${mimeType};base64,${fileContent.toString('base64')}`;
                mediaUrls = [dataUrl];
            }

            // Post to each platform
            const results: { platform: string; success: boolean; error?: string }[] = [];

            for (const platform of targetPlatforms) {
                try {
                    console.log(`📤 Posting to ${platform}...`);

                    let endpoint: string;
                    let payload: PlatformPayload;

                    switch (platform) {
                        case 'telegram':
                            endpoint = '/api/post/telegram';
                            if (!config.credentials.telegram?.botToken || !config.credentials.telegram?.chatId) {
                                throw new Error('Telegram credentials not configured');
                            }
                            payload = {
                                text: message || '',
                                media_urls: mediaUrls,
                                bot_token: config.credentials.telegram.botToken,
                                chat_id: config.credentials.telegram.chatId
                            };
                            break;
                        case 'linkedin':
                            endpoint = '/api/post/linkedin';
                            if (!config.credentials.linkedin?.accessToken) {
                                throw new Error('LinkedIn credentials not configured');
                            }
                            payload = {
                                text: message || '',
                                media_urls: mediaUrls,
                                access_token: config.credentials.linkedin.accessToken
                            };
                            break;
                        case 'reddit':
                            endpoint = '/api/post/reddit';
                            if (!config.credentials.reddit?.accessToken) {
                                throw new Error('Reddit credentials not configured');
                            }
                            payload = {
                                text: message || '',
                                media_urls: mediaUrls,
                                access_token: config.credentials.reddit.accessToken,
                                subreddit: 'test', // Default subreddit
                                title: message?.substring(0, 300) || 'Posted from DotShare CLI'
                            };
                            break;
                        default:
                            throw new Error(`Unsupported platform: ${platform}`);
                    }

                    const response = await axios.post(`${config.serverUrl}${endpoint}`, payload, {
                        timeout: 30000
                    });

                    if (response.data.success) {
                        console.log(`✅ ${platform}: Success`);
                        results.push({ platform, success: true });
                    } else {
                        console.log(`❌ ${platform}: ${response.data.error || 'Unknown error'}`);
                        results.push({ platform, success: false, error: response.data.error });
                    }

                } catch (error: unknown) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    console.log(`❌ ${platform}: ${errorMsg}`);
                    results.push({ platform, success: false, error: errorMsg });
                }
            }

            // Summary
            const successful = results.filter(r => r.success).length;
            const total = results.length;

            console.log(`\n📊 Results: ${successful}/${total} successful`);

            if (successful === total) {
                console.log('🎉 All posts successful!');
            } else if (successful > 0) {
                console.log('⚠️  Some posts failed. Check the errors above.');
            } else {
                console.log('💥 All posts failed. Check your configuration and server.');
            }
        });
}
