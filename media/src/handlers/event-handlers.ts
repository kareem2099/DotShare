interface VSCodeAPI {
    postMessage(message: unknown): void;
}



declare const vscode: VSCodeAPI;

declare global {
    interface Window {

    }
}

// Lazy vscode accessor to avoid import-time undefined issues
const getVscode = () => vscode;

import { openModal, closeModalFunc, applyModel, switchProviderTab, closeSavedApisModal, openSavedApisModal, handleDirectShare, openScheduleModal, closeScheduleModalFunc, schedulePost } from './modal-handlers';
import {
    postText,
    editPostBtn,
    editControls,
    linkedinToken,
    telegramBot,
    telegramChat,
    discordWebhook,
    blueskyIdentifier,
    blueskyPassword,
    selectedModel,
    updateButtonStates,
    checkPlatformAvailability,
    showStatus,
    currentLang,
    updateCurrentLang
} from '../core/utils';
import { updateTexts } from '../core/translations';
import { logger } from '../utils/Logger';

// Variables for post editing
export let originalPost = '';

// Platform field configurations - moved from app.ts
export const platformConfigs: { [key: string]: { name: string; fields: { key: string; label: string; type: string; placeholder?: string }[] } } = {
    linkedin: {
        name: 'LinkedIn',
        fields: [
            { key: 'linkedinToken', label: 'Access Token', type: 'password', placeholder: 'Enter your LinkedIn Access Token' }
        ]
    },
    telegram: {
        name: 'Telegram',
        fields: [
            { key: 'telegramBot', label: 'Bot Token', type: 'password', placeholder: 'Enter your Telegram Bot Token' },
            { key: 'telegramChat', label: 'Chat ID', type: 'text', placeholder: '@username or Chat ID' }
        ]
    },
    x: {
        name: 'X/Twitter',
        fields: [
            { key: 'xAccessToken', label: 'Access Token', type: 'password', placeholder: 'Enter your X Access Token' },
            { key: 'xAccessSecret', label: 'Access Secret', type: 'password', placeholder: 'Enter your X Access Secret' }
        ]
    },

    discord: {
        name: 'Discord',
        fields: [
            { key: 'discordWebhook', label: 'Webhook URL', type: 'url', placeholder: 'Enter your Discord webhook URL' }
        ]
    },

    bluesky: {
        name: 'BlueSky',
        fields: [
            { key: 'blueskyIdentifier', label: 'Username/Handle', type: 'text', placeholder: 'your-handle.bsky.social' },
            { key: 'blueskyPassword', label: 'App Password', type: 'password', placeholder: 'Enter your BlueSky app password' }
        ]
    }
};

// Saved APIs Management - moved from app.ts
export const currentSavedApisPlatform = '';

// Function to set up all platform input event listeners (called in window load)
export function setupPlatformEventListeners() {
    // LinkedIn
    const linkedinTokenInput = document.getElementById('linkedinToken') as HTMLInputElement;
    if (linkedinTokenInput) {
        linkedinTokenInput.addEventListener('input', updateButtonStates);
        linkedinTokenInput.addEventListener('blur', () => {
            if (linkedinTokenInput.value.trim()) {
                getVscode()?.postMessage({ command: 'saveLinkedinToken', linkedinToken: linkedinTokenInput.value });
            }
        });
    }

    // Telegram
    const telegramBotInput = document.getElementById('telegramBot') as HTMLInputElement;
    const telegramChatInput = document.getElementById('telegramChat') as HTMLInputElement;
    if (telegramBotInput) {
        telegramBotInput.addEventListener('input', updateButtonStates);
        telegramBotInput.addEventListener('blur', () => {
            if (telegramBotInput.value.trim() || telegramChatInput?.value.trim()) {
                getVscode()?.postMessage({
                    command: 'saveTelegramCredentials',
                    telegramBot: telegramBotInput.value,
                    telegramChat: telegramChatInput?.value || ''
                });
            }
        });
    }
    if (telegramChatInput) {
        telegramChatInput.addEventListener('input', updateButtonStates);
        telegramChatInput.addEventListener('blur', () => {
            if (telegramBotInput?.value.trim() || telegramChatInput.value.trim()) {
                getVscode()?.postMessage({
                    command: 'saveTelegramCredentials',
                    telegramBot: telegramBotInput?.value || '',
                    telegramChat: telegramChatInput.value
                });
            }
        });
    }



    // Discord
    const discordWebhookInput = document.getElementById('discordWebhook') as HTMLInputElement;
    if (discordWebhookInput) {
        discordWebhookInput.addEventListener('input', updateButtonStates);
        discordWebhookInput.addEventListener('blur', () => {
            if (discordWebhookInput.value.trim()) {
                getVscode()?.postMessage({
                    command: 'saveDiscordWebhook',
                    discordWebhookUrl: discordWebhookInput.value
                });
            }
        });
    }

    // X/Twitter
    const xAccessTokenInput = document.getElementById('xAccessToken') as HTMLInputElement;
    const xAccessSecretInput = document.getElementById('xAccessSecret') as HTMLInputElement;
    if (xAccessTokenInput && xAccessSecretInput) {
        xAccessTokenInput.addEventListener('input', updateButtonStates);
        xAccessSecretInput.addEventListener('input', updateButtonStates);
        xAccessTokenInput.addEventListener('blur', () => {
            if (xAccessTokenInput.value.trim() && xAccessSecretInput?.value.trim()) {
                getVscode()?.postMessage({
                    command: 'saveXCredentials',
                    xAccessToken: xAccessTokenInput.value,
                    xAccessSecret: xAccessSecretInput.value
                });
                setTimeout(() => checkPlatformAvailability(), 100);
            }
        });
        xAccessSecretInput.addEventListener('blur', () => {
            if (xAccessTokenInput?.value.trim() && xAccessSecretInput.value.trim()) {
                getVscode()?.postMessage({
                    command: 'saveXCredentials',
                    xAccessToken: xAccessTokenInput.value,
                    xAccessSecret: xAccessSecretInput.value
                });
                setTimeout(() => checkPlatformAvailability(), 100);
            }
        });
    }

    // BlueSky
    const blueskyIdentifierInput = document.getElementById('blueskyIdentifier') as HTMLInputElement;
    const blueskyPasswordInput = document.getElementById('blueskyPassword') as HTMLInputElement;
    if (blueskyIdentifierInput && blueskyPasswordInput) {
        blueskyIdentifierInput.addEventListener('input', updateButtonStates);
        blueskyPasswordInput.addEventListener('input', updateButtonStates);
        blueskyIdentifierInput.addEventListener('blur', () => {
            if (blueskyIdentifierInput.value.trim() || blueskyPasswordInput.value.trim()) {
                getVscode()?.postMessage({
                    command: 'saveBlueSkyCredentials',
                    blueskyIdentifier: blueskyIdentifierInput.value,
                    blueskyPassword: blueskyPasswordInput.value
                });
            }
        });
        blueskyPasswordInput.addEventListener('blur', () => {
            if (blueskyIdentifierInput.value.trim() || blueskyPasswordInput.value.trim()) {
                getVscode()?.postMessage({
                    command: 'saveBlueSkyCredentials',
                    blueskyIdentifier: blueskyIdentifierInput.value,
                    blueskyPassword: blueskyPasswordInput.value
                });
            }
        });
    }

    // GitHub Token (for Gist)
    const githubTokenInput = document.getElementById('githubToken') as HTMLInputElement;
    if (githubTokenInput) {
        githubTokenInput.addEventListener('input', updateButtonStates);
        githubTokenInput.addEventListener('blur', () => {
            if (githubTokenInput.value.trim()) {
                getVscode()?.postMessage({
                    command: 'setGitHubToken',
                    token: githubTokenInput.value
                });
            }
        });
    }
}



// ── OAuth Connect Buttons ──────────────────────────────────────────────────────

/** Wire up OAuth buttons for LinkedIn and X. */
export function setupOAuthButtons() {
    const oauthPlatforms = [
        { platform: 'linkedin', label: 'Connect with LinkedIn' },
        { platform: 'x',        label: 'Connect with X'        },
    ];

    oauthPlatforms.forEach(({ platform, label }) => {
        // Connect Button
        const btn = document.getElementById(`oauthConnect_${platform}`) as HTMLButtonElement | null;
        if (btn) {
            btn.addEventListener('click', (e) => {
                if (platform === 'reddit') {
                    e.preventDefault();
                    return;
                }
                btn.disabled = true;
                btn.innerHTML = '<span class="oauth-icon">⏳</span><span>Opening browser…</span>';

                getVscode()?.postMessage({ command: 'openOAuth', platform });

                // Re-enable after 6s ONLY if disconnected
                setTimeout(() => {
                    if (!btn.classList.contains('oauth-connect-btn--connected')) {
                        btn.disabled = false;
                        btn.innerHTML = `<span class="oauth-icon">🔗</span><span class="oauth-btn-text">${label}</span>`;
                    }
                }, 6000);
            });
        }

        // Disconnect Button
        const disconnectBtn = document.getElementById(`oauthDisconnect_${platform}`) as HTMLButtonElement | null;
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => {
                if (platform === 'linkedin') {
                    getVscode()?.postMessage({ command: 'saveLinkedinToken', linkedinToken: '' });
                } else if (platform === 'x') {
                    getVscode()?.postMessage({ command: 'saveXCredentials', xAccessToken: '', xAccessSecret: '' });
                }
                
                // Immediately request a config reload to update the UI
                setTimeout(() => {
                    getVscode()?.postMessage({ command: 'loadConfiguration' });
                }, 100);
            });
        }

        // Advanced Toggle
        const toggleBtn = document.getElementById(`oauthAdvancedToggle_${platform}`);
        const advancedContent = document.getElementById(`oauthAdvancedContent_${platform}`);
        if (toggleBtn && advancedContent) {
            toggleBtn.addEventListener('click', () => {
                const isOpen = advancedContent.style.display !== 'none';
                if (isOpen) {
                    advancedContent.style.display = 'none';
                    toggleBtn.classList.remove('open');
                } else {
                    advancedContent.style.display = 'block';
                    toggleBtn.classList.add('open');
                }
            });
        }
    });
}

/**
 * Call this after `updateConfiguration` is received from the extension.
 * Shows "✅ Connected" badge and sets UI for tokens presence.
 */
export function showOAuthStatus(config: {
    linkedinToken?: string;
    xAccessToken?: string;
}) {
    const map = [
        { platform: 'linkedin', token: config.linkedinToken, label: 'Connect with LinkedIn', connectedText: 'LinkedIn Connected' },
        { platform: 'x',        token: config.xAccessToken,  label: 'Connect with X',        connectedText: 'X Connected' },
    ];

    map.forEach(({ platform, token, label, connectedText }) => {
        const btn            = document.getElementById(`oauthConnect_${platform}`) as HTMLButtonElement | null;
        const disconnectBtn  = document.getElementById(`oauthDisconnect_${platform}`) as HTMLButtonElement | null;
        const advancedToggle = document.getElementById(`oauthAdvancedToggle_${platform}`) as HTMLElement | null;
        const advancedContent= document.getElementById(`oauthAdvancedContent_${platform}`) as HTMLElement | null;

        if (!btn) return;

        if (token) {
            // Connected State
            btn.classList.add('oauth-connect-btn--connected');
            btn.disabled = true; // Typically don't need to click when connected unless doing something else
            btn.innerHTML = `<span class="oauth-icon">✅</span><span>${connectedText}</span>`;
            
            if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
            
            // Hide manual input completely
            if (advancedToggle) advancedToggle.style.display = 'none';
            if (advancedContent) advancedContent.style.display = 'none';
        } else {
            // Disconnected State
            btn.classList.remove('oauth-connect-btn--connected');
            btn.disabled = false;
            btn.title = '';
            btn.innerHTML = `<span class="oauth-icon">🔗</span><span class="oauth-btn-text">${label}</span>`;
            
            if (disconnectBtn) disconnectBtn.style.display = 'none';
            
            // Show advanced toggle
            if (advancedToggle) {
                advancedToggle.style.display = 'inline-flex';
                advancedToggle.classList.remove('open');
            }
            if (advancedContent) advancedContent.style.display = 'none';
        }
    });
}

// ────────────────────────────────────────────────────────────────────────────



// Initialize all critical event listeners immediately
export function initializeCriticalEventListeners() {
    // Copy from app.ts - critical event listeners
    const selectModelBtn = document.getElementById('configureAIBtn') as HTMLButtonElement;
    const generateBtnElement = document.getElementById('generateBtn') as HTMLButtonElement;
    const shareLinkedInBtnElement = document.getElementById('shareLinkedInBtn') as HTMLButtonElement;
    const shareTelegramBtnElement = document.getElementById('shareTelegramBtn') as HTMLButtonElement;

    const shareDiscordBtn = document.getElementById('shareDiscordBtn') as HTMLButtonElement;
    const shareBlueSkyBtn = document.getElementById('shareBlueSkyBtn') as HTMLButtonElement;
    const languageSelect = document.getElementById('languageSelect') as HTMLSelectElement;
    const savedApiButtons = document.querySelectorAll('.saved-apis-btn');
    const shareBtn = document.getElementById('shareBtn') as HTMLButtonElement;
    const editPostBtnElement = document.getElementById('editPostBtn') as HTMLButtonElement;
    const savePostBtnElement = document.getElementById('savePostBtn') as HTMLButtonElement;
    const cancelPostBtnElement = document.getElementById('cancelPostBtn') as HTMLButtonElement;
    const scheduleBtnElement = document.getElementById('scheduleBtn') as HTMLButtonElement;


    // AI Model selection button
    if (selectModelBtn) {
        selectModelBtn.addEventListener('click', openModal);
    }

    // Language select dropdown
    if (languageSelect) {
        languageSelect.value = currentLang;
        languageSelect.addEventListener('change', (e) => {
            const newLang = (e.target as HTMLSelectElement).value;
            updateCurrentLang(newLang);
            localStorage.setItem('lang', newLang);
            document.documentElement.lang = newLang;
            document.body.classList.toggle('rtl', newLang === 'ar');
            updateTexts();
        });
    }

    // Generate AI Post button (primary editor button)
    if (generateBtnElement) {
        generateBtnElement.addEventListener('click', () => {
            // This button is now for "Generate AI Content" - can enhance existing manual post
            if (selectedModel && selectedModel.apiKey) {
                const existingText = postText?.value || '';
                const prompt = existingText.trim()
                    ? `Enhance this social media post: "${existingText}"`
                    : 'Generate an engaging social media post';

                getVscode()?.postMessage({
                    command: 'generatePost',
                    selectedModel,  // {provider, apiKey, model}
                    prompt: prompt
                });
            } else {
                showStatus('Please configure an AI model first', 'error');
            }
        });
    }

    // Individual platform share buttons
    if (shareLinkedInBtnElement) {
        shareLinkedInBtnElement.addEventListener('click', () => {
            if (!postText?.value.trim()) {
                showStatus('Please enter a post first.', 'error');
                return;
            }

            getVscode()?.postMessage({
                command: 'shareToLinkedIn',
                linkedinToken: linkedinToken?.value,
                post: postText.value
            });
        });
    }

    if (shareTelegramBtnElement) {
        shareTelegramBtnElement.addEventListener('click', () => {
            if (!postText?.value.trim()) {
                showStatus('Please enter a post first.', 'error');
                return;
            }

            getVscode()?.postMessage({
                command: 'shareToTelegram',
                telegramBot: telegramBot?.value,
                telegramChat: telegramChat?.value,
                post: postText.value
            });
        });
    }

    if (shareDiscordBtn) {
        shareDiscordBtn.addEventListener('click', () => {
            getVscode()?.postMessage({ command: 'shareToDiscord', discordWebhook: discordWebhook?.value });
        });
    }

    if (shareBlueSkyBtn) {
        shareBlueSkyBtn.addEventListener('click', () => {
            getVscode()?.postMessage({
                command: 'shareToBlueSky',
                blueskyIdentifier: blueskyIdentifier?.value,
                blueskyPassword: blueskyPassword?.value
            });
        });
    }

    // Share button
    if (shareBtn) {
        shareBtn.addEventListener('click', handleDirectShare);
    }

    // Saved APIs buttons
    savedApiButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const platform = (e.target as HTMLElement).getAttribute('data-platform');
            logger.info('Saved APIs button clicked, platform:', platform);

            if (platform) {
                openSavedApisModal(platform);
            } else {
                showStatus('Error: Could not identify platform', 'error');
            }
        });
    });

    // Tab navigation buttons
    const tabButtons = document.querySelectorAll('.tab-nav-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            if (tabName) {
                // Switch tab active state
                document.querySelectorAll('.tab-nav-btn').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Switch tab content
                document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
                const tabContent = document.getElementById(`${tabName}Tab`);
                if (tabContent) tabContent.classList.add('active');

                // Load fresh data when switching to analytics tab
                if (tabName === 'analytics') {
                    getVscode()?.postMessage({ command: 'loadAnalytics' });
                }

                logger.info('Switched to tab:', tabName);
            }
        });
    });

    // Modal event listeners
    const closeModalBtn = document.getElementById('closeModal') as HTMLElement;
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModalFunc);
    }

    const closeSavedApisModalBtn = document.getElementById('closeSavedApisModal') as HTMLElement;
    if (closeSavedApisModalBtn) {
        closeSavedApisModalBtn.addEventListener('click', closeSavedApisModal);
    }

    const applyModalBtn = document.getElementById('applyModelBtn') as HTMLElement;
    if (applyModalBtn) {
        applyModalBtn.addEventListener('click', applyModel);
    }

    const providerTabs = document.querySelectorAll('.tab-btn');
    providerTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const provider = target.getAttribute('data-provider');
            if (provider) {
                switchProviderTab(provider);
            }
        });
    });

    // Edit post buttons
    if (editPostBtnElement) {
        editPostBtnElement.addEventListener('click', enablePostEditing);
    }

    if (savePostBtnElement) {
        savePostBtnElement.addEventListener('click', savePostChanges);
    }

    if (cancelPostBtnElement) {
        cancelPostBtnElement.addEventListener('click', cancelPostChanges);
    }

    // Schedule post button
    if (scheduleBtnElement) {
        scheduleBtnElement.addEventListener('click', openScheduleModal);
    }

    // Schedule modal buttons
    const cancelScheduleBtn = document.getElementById('cancelScheduleBtn') as HTMLButtonElement;
    const confirmScheduleBtn = document.getElementById('confirmScheduleBtn') as HTMLButtonElement;
    const closeScheduleModalBtn = document.getElementById('closeScheduleModal') as HTMLSpanElement;

    if (cancelScheduleBtn) cancelScheduleBtn.addEventListener('click', closeScheduleModalFunc);
    if (confirmScheduleBtn) confirmScheduleBtn.addEventListener('click', schedulePost);
    if (closeScheduleModalBtn) closeScheduleModalBtn.addEventListener('click', closeScheduleModalFunc);



    logger.info('Critical event listeners initialized - buttons should now work!');
}

export { updateButtonStates } from '../core/utils';

// Post editing functions
export function enablePostEditing() {
    if (!postText) return;

    originalPost = postText.value;
    postText.readOnly = false;
    postText.focus();
    if (editPostBtn) editPostBtn.style.display = 'none';
    if (editControls) editControls.style.display = 'flex';
}

export function savePostChanges() {
    originalPost = postText?.value || '';
    if (postText) postText.readOnly = true;
    if (editPostBtn) editPostBtn.style.display = 'inline-block';
    if (editControls) editControls.style.display = 'none';
    // Would show success message
}

export function cancelPostChanges() {
    if (postText) postText.value = originalPost;
    if (postText) postText.readOnly = true;
    if (editPostBtn) editPostBtn.style.display = 'inline-block';
    if (editControls) editControls.style.display = 'none';
}
