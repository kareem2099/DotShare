
const vscode = acquireVsCodeApi();
import { postText, editPostBtn, editControls, linkedinToken, telegramBot, telegramChat, facebookToken, discordWebhook, blueskyIdentifier, blueskyPassword, selectedModel, updateButtonStates, checkPlatformAvailability, themes, applyTheme, currentThemeVariant, currentLang, updateThemeToggle, updateThemeVariant, updateCurrentLang, showStatus } from '../core/utils';
import { updateTexts } from '../core/translations';
import { shareSelectedPlatforms } from '../management/platform-handlers';
import { openSavedApisModal } from './modal-handlers';
// Variables for post editing
export let originalPost = '';
// Platform field configurations - moved from app.ts
export const platformConfigs = {
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
    facebook: {
        name: 'Facebook',
        fields: [
            { key: 'facebookToken', label: 'Access Token', type: 'password', placeholder: 'Enter your Facebook Access Token' },
            { key: 'facebookPageToken', label: 'Page Token (Optional)', type: 'password', placeholder: 'Page access token for posting to pages' },
            { key: 'facebookPageId', label: 'Page ID (Optional)', type: 'text', placeholder: 'Facebook page ID' }
        ]
    },
    discord: {
        name: 'Discord',
        fields: [
            { key: 'discordWebhook', label: 'Webhook URL', type: 'url', placeholder: 'Enter your Discord webhook URL' }
        ]
    },
    reddit: {
        name: 'Reddit',
        fields: [
            { key: 'redditAccessToken', label: 'Access Token', type: 'password', placeholder: 'Enter your Reddit Access Token' }
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
export let currentSavedApisPlatform = '';
// Function to set up all platform input event listeners (called in window load)
export function setupPlatformEventListeners() {
    // LinkedIn
    const linkedinTokenInput = document.getElementById('linkedinToken');
    if (linkedinTokenInput) {
        linkedinTokenInput.addEventListener('input', updateButtonStates);
        linkedinTokenInput.addEventListener('blur', () => {
            if (linkedinTokenInput.value.trim()) {
                vscode.postMessage({ command: 'saveLinkedinToken', linkedinToken: linkedinTokenInput.value });
            }
        });
    }
    // Telegram
    const telegramBotInput = document.getElementById('telegramBot');
    const telegramChatInput = document.getElementById('telegramChat');
    if (telegramBotInput) {
        telegramBotInput.addEventListener('input', updateButtonStates);
        telegramBotInput.addEventListener('blur', () => {
            if (telegramBotInput.value.trim() || telegramChatInput?.value.trim()) {
                vscode.postMessage({
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
                vscode.postMessage({
                    command: 'saveTelegramCredentials',
                    telegramBot: telegramBotInput?.value || '',
                    telegramChat: telegramChatInput.value
                });
            }
        });
    }
    // Facebook
    const facebookTokenInput = document.getElementById('facebookToken');
    const facebookPageTokenInput = document.getElementById('facebookPageToken');
    const facebookPageIdInput = document.getElementById('facebookPageId');
    if (facebookTokenInput) {
        facebookTokenInput.addEventListener('input', updateButtonStates);
        facebookTokenInput.addEventListener('blur', () => {
            if (facebookTokenInput.value.trim() || facebookPageTokenInput?.value.trim() || facebookPageIdInput?.value.trim()) {
                vscode.postMessage({
                    command: 'saveFacebookToken',
                    facebookToken: facebookTokenInput.value,
                    facebookPageToken: facebookPageTokenInput?.value || '',
                    facebookPageId: facebookPageIdInput?.value || ''
                });
            }
        });
    }
    if (facebookPageTokenInput) {
        facebookPageTokenInput.addEventListener('blur', () => {
            if (facebookTokenInput?.value.trim() || facebookPageTokenInput.value.trim() || facebookPageIdInput?.value.trim()) {
                vscode.postMessage({
                    command: 'saveFacebookToken',
                    facebookToken: facebookTokenInput?.value || '',
                    facebookPageToken: facebookPageTokenInput.value,
                    facebookPageId: facebookPageIdInput?.value || ''
                });
            }
        });
    }
    if (facebookPageIdInput) {
        facebookPageIdInput.addEventListener('blur', () => {
            if (facebookTokenInput?.value.trim() || facebookPageTokenInput?.value.trim() || facebookPageIdInput.value.trim()) {
                vscode.postMessage({
                    command: 'saveFacebookToken',
                    facebookToken: facebookTokenInput?.value || '',
                    facebookPageToken: facebookPageTokenInput?.value || '',
                    facebookPageId: facebookPageIdInput.value
                });
            }
        });
    }
    // Discord
    const discordWebhookInput = document.getElementById('discordWebhook');
    if (discordWebhookInput) {
        discordWebhookInput.addEventListener('input', updateButtonStates);
        discordWebhookInput.addEventListener('blur', () => {
            if (discordWebhookInput.value.trim()) {
                vscode.postMessage({
                    command: 'saveDiscordWebhook',
                    discordWebhookUrl: discordWebhookInput.value
                });
            }
        });
    }
    // X/Twitter
    const xAccessTokenInput = document.getElementById('xAccessToken');
    const xAccessSecretInput = document.getElementById('xAccessSecret');
    if (xAccessTokenInput && xAccessSecretInput) {
        xAccessTokenInput.addEventListener('input', updateButtonStates);
        xAccessSecretInput.addEventListener('input', updateButtonStates);
        xAccessTokenInput.addEventListener('blur', () => {
            if (xAccessTokenInput.value.trim() && xAccessSecretInput?.value.trim()) {
                vscode.postMessage({
                    command: 'saveXCredentials',
                    xAccessToken: xAccessTokenInput.value,
                    xAccessSecret: xAccessSecretInput.value
                });
                setTimeout(() => checkPlatformAvailability(), 100);
            }
        });
        xAccessSecretInput.addEventListener('blur', () => {
            if (xAccessTokenInput?.value.trim() && xAccessSecretInput.value.trim()) {
                vscode.postMessage({
                    command: 'saveXCredentials',
                    xAccessToken: xAccessTokenInput.value,
                    xAccessSecret: xAccessSecretInput.value
                });
                setTimeout(() => checkPlatformAvailability(), 100);
            }
        });
    }
    // BlueSky
    const blueskyIdentifierInput = document.getElementById('blueskyIdentifier');
    const blueskyPasswordInput = document.getElementById('blueskyPassword');
    if (blueskyIdentifierInput && blueskyPasswordInput) {
        blueskyIdentifierInput.addEventListener('input', updateButtonStates);
        blueskyPasswordInput.addEventListener('input', updateButtonStates);
        blueskyIdentifierInput.addEventListener('blur', () => {
            if (blueskyIdentifierInput.value.trim() || blueskyPasswordInput.value.trim()) {
                vscode.postMessage({
                    command: 'saveBlueSkyCredentials',
                    blueskyIdentifier: blueskyIdentifierInput.value,
                    blueskyPassword: blueskyPasswordInput.value
                });
            }
        });
        blueskyPasswordInput.addEventListener('blur', () => {
            if (blueskyIdentifierInput.value.trim() || blueskyPasswordInput.value.trim()) {
                vscode.postMessage({
                    command: 'saveBlueSkyCredentials',
                    blueskyIdentifier: blueskyIdentifierInput.value,
                    blueskyPassword: blueskyPasswordInput.value
                });
            }
        });
    }
}
// Function to set up Reddit event listeners
export function setupRedditEventListeners() {
    const redditAccessToken = document.getElementById('redditAccessToken');
    const redditRefreshToken = document.getElementById('redditRefreshToken');
    const generateRedditTokensBtn = document.getElementById('generateRedditTokensBtn');
    // Add listener for Reddit token generation
    if (generateRedditTokensBtn) {
        generateRedditTokensBtn.addEventListener('click', () => {
            // Would handle Reddit token generation
        });
    }
    if (redditAccessToken) {
        redditAccessToken.addEventListener('blur', () => {
            // Would send saveRedditCredentials message
        });
    }
    if (redditRefreshToken) {
        redditRefreshToken.addEventListener('blur', () => {
            // Would send saveRedditCredentials message
        });
    }
}
// Initialize all critical event listeners immediately
export function initializeCriticalEventListeners() {
    // Copy from app.ts - critical event listeners
    const selectModelBtn = document.getElementById('configureAIBtn');
    const generateBtnElement = document.getElementById('generateBtn');
    const shareLinkedInBtnElement = document.getElementById('shareLinkedInBtn');
    const shareTelegramBtnElement = document.getElementById('shareTelegramBtn');
    const shareFacebookBtn = document.getElementById('shareFacebookBtn');
    const shareDiscordBtn = document.getElementById('shareDiscordBtn');
    const shareBlueSkyBtn = document.getElementById('shareBlueSkyBtn');
    const themeToggle = document.getElementById('themeToggle');
    const languageSelect = document.getElementById('languageSelect');
    const savedApiButtons = document.querySelectorAll('.saved-apis-btn');
    const shareSelectedBtn = document.getElementById('shareSelectedBtn');
    // AI Model selection button
    if (selectModelBtn) {
        selectModelBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'openModelSelection' });
        });
    }
    // Theme toggle button
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentIndex = themes.indexOf(currentThemeVariant);
            const nextIndex = (currentIndex + 1) % themes.length;
            const newTheme = themes[nextIndex];
            updateThemeVariant(newTheme);
            localStorage.setItem('theme', newTheme);
            applyTheme();
            updateThemeToggle();
        });
    }
    // Language select dropdown
    if (languageSelect) {
        languageSelect.value = currentLang;
        languageSelect.addEventListener('change', (e) => {
            const newLang = e.target.value;
            updateCurrentLang(newLang);
            localStorage.setItem('lang', newLang);
            document.documentElement.lang = newLang;
            document.body.classList.toggle('rtl', newLang === 'ar');
            updateTexts();
            updateThemeToggle();
        });
    }
    // Generate AI Post button
    if (generateBtnElement) {
        generateBtnElement.addEventListener('click', () => {
            if (selectedModel && selectedModel.apiKey) {
                vscode.postMessage({
                    command: 'generateAI',
                    model: selectedModel,
                    prompt: 'Generate an engaging social media post'
                });
            }
            else {
                showStatus('Please configure an AI model first', 'error');
            }
        });
    }
    // Individual platform share buttons
    if (shareLinkedInBtnElement) {
        shareLinkedInBtnElement.addEventListener('click', () => {
            vscode.postMessage({ command: 'shareToLinkedIn', linkedinToken: linkedinToken?.value });
        });
    }
    if (shareTelegramBtnElement) {
        shareTelegramBtnElement.addEventListener('click', () => {
            vscode.postMessage({
                command: 'shareToTelegram',
                telegramBot: telegramBot?.value,
                telegramChat: telegramChat?.value
            });
        });
    }
    if (shareFacebookBtn) {
        shareFacebookBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'shareToFacebook', facebookToken: facebookToken?.value });
        });
    }
    if (shareDiscordBtn) {
        shareDiscordBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'shareToDiscord', discordWebhook: discordWebhook?.value });
        });
    }
    if (shareBlueSkyBtn) {
        shareBlueSkyBtn.addEventListener('click', () => {
            vscode.postMessage({
                command: 'shareToBlueSky',
                blueskyIdentifier: blueskyIdentifier?.value,
                blueskyPassword: blueskyPassword?.value
            });
        });
    }
    // Share Selected button
    if (shareSelectedBtn) {
        shareSelectedBtn.addEventListener('click', shareSelectedPlatforms);
    }
    // Saved APIs buttons
    savedApiButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const platform = e.target.getAttribute('data-platform');
            Logger.info('Saved APIs button clicked, platform:', platform);
            if (platform) {
                openSavedApisModal(platform);
            }
            else {
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
                if (tabContent)
                    tabContent.classList.add('active');
                Logger.info('Switched to tab:', tabName);
            }
        });
    });
    Logger.info('Critical event listeners initialized - buttons should now work!');
}
export { updateButtonStates } from '../core/utils';
// Post editing functions
export function enablePostEditing() {
    if (!postText)
        return;
    originalPost = postText.value;
    postText.readOnly = false;
    postText.focus();
    if (editPostBtn)
        editPostBtn.style.display = 'none';
    if (editControls)
        editControls.style.display = 'flex';
}
export function savePostChanges() {
    originalPost = postText?.value || '';
    if (postText)
        postText.readOnly = true;
    if (editPostBtn)
        editPostBtn.style.display = 'inline-block';
    if (editControls)
        editControls.style.display = 'none';
    // Would show success message
}
export function cancelPostChanges() {
    if (postText)
        postText.value = originalPost;
    if (postText)
        postText.readOnly = true;
    if (editPostBtn)
        editPostBtn.style.display = 'inline-block';
    if (editControls)
        editControls.style.display = 'none';
}
