interface VSCodeAPI {
    postMessage(message: unknown): void;
}

interface PendingRedditShare {
    text: string;
    mediaFilePaths: string[];
}

declare const vscode: VSCodeAPI;

declare global {
    interface Window {
        pendingRedditShare?: PendingRedditShare;
    }
}

// Lazy vscode accessor to avoid import-time undefined issues
const getVscode = () => vscode;

import { openModal, closeModalFunc, applyModel, switchProviderTab, closeSavedApisModal, openSavedApisModal, handleDirectShare } from './modal-handlers';
import {
    postText,
    editPostBtn,
    editControls,
    linkedinToken,
    telegramBot,
    telegramChat,
    facebookToken,
    discordWebhook,
    redditAccessToken,
    blueskyIdentifier,
    blueskyPassword,
    selectedModel,
    updateButtonStates,
    checkPlatformAvailability,
    themes,
    applyTheme,
    currentThemeVariant,
    currentLang,
    updateThemeToggle,
    updateThemeVariant,
    updateCurrentLang,
    showStatus
} from '../core/utils';
import { updateTexts } from '../core/translations';

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

    // Facebook
    const facebookTokenInput = document.getElementById('facebookToken') as HTMLInputElement;
    const facebookPageTokenInput = document.getElementById('facebookPageToken') as HTMLInputElement;
    const facebookPageIdInput = document.getElementById('facebookPageId') as HTMLInputElement;
    if (facebookTokenInput) {
        facebookTokenInput.addEventListener('input', updateButtonStates);
        facebookTokenInput.addEventListener('blur', () => {
            if (facebookTokenInput.value.trim() || facebookPageTokenInput?.value.trim() || facebookPageIdInput?.value.trim()) {
                getVscode()?.postMessage({
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
                getVscode()?.postMessage({
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
                getVscode()?.postMessage({
                    command: 'saveFacebookToken',
                    facebookToken: facebookTokenInput?.value || '',
                    facebookPageToken: facebookPageTokenInput?.value || '',
                    facebookPageId: facebookPageIdInput.value
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
}

// Function to set up Reddit event listeners
export function setupRedditEventListeners() {
    const redditAccessToken = document.getElementById('redditAccessToken') as HTMLInputElement;
    const redditRefreshToken = document.getElementById('redditRefreshToken') as HTMLInputElement;
    const generateRedditTokensBtn = document.getElementById('generateRedditTokensBtn') as HTMLButtonElement;
    const redditClientId = document.getElementById('redditClientId') as HTMLInputElement;
    const redditClientSecret = document.getElementById('redditClientSecret') as HTMLInputElement;
    const redditUsername = document.getElementById('redditUsername') as HTMLInputElement;
    const redditPassword = document.getElementById('redditPassword') as HTMLInputElement;
    const redditApiName = document.getElementById('redditApiName') as HTMLInputElement;

    // Add listener for Reddit token generation
    if (generateRedditTokensBtn) {
        generateRedditTokensBtn.addEventListener('click', () => {
            const clientId = redditClientId?.value.trim();
            const clientSecret = redditClientSecret?.value.trim();
            const username = redditUsername?.value.trim();
            const password = redditPassword?.value.trim();
            const apiName = redditApiName?.value.trim() || 'Reddit Account';

            if (!clientId || !clientSecret || !username || !password) {
                showStatus('All Reddit credentials are required.', 'error');
                return;
            }

            generateRedditTokensBtn.disabled = true;
            generateRedditTokensBtn.textContent = '🔄 Generating...';

            getVscode()?.postMessage({
                command: 'generateRedditTokens',
                redditClientId: clientId,
                redditClientSecret: clientSecret,
                redditUsername: username,
                redditPassword: password,
                redditApiName: apiName
            });
        });
    }

    if (redditAccessToken) {
        redditAccessToken.addEventListener('input', updateButtonStates);
        redditAccessToken.addEventListener('blur', () => {
            if (redditAccessToken.value.trim() || redditRefreshToken?.value.trim()) {
                getVscode()?.postMessage({
                    command: 'saveRedditCredentials',
                    redditAccessToken: redditAccessToken.value,
                    redditRefreshToken: redditRefreshToken?.value || ''
                });
            }
        });
    }
}



// Initialize all critical event listeners immediately
export function initializeCriticalEventListeners() {
    // Copy from app.ts - critical event listeners
    const selectModelBtn = document.getElementById('configureAIBtn') as HTMLButtonElement;
    const generateBtnElement = document.getElementById('generateBtn') as HTMLButtonElement;
    const shareLinkedInBtnElement = document.getElementById('shareLinkedInBtn') as HTMLButtonElement;
    const shareTelegramBtnElement = document.getElementById('shareTelegramBtn') as HTMLButtonElement;
    const shareFacebookBtn = document.getElementById('shareFacebookBtn') as HTMLButtonElement;
    const shareDiscordBtn = document.getElementById('shareDiscordBtn') as HTMLButtonElement;
    const shareBlueSkyBtn = document.getElementById('shareBlueSkyBtn') as HTMLButtonElement;
    const themeToggle = document.getElementById('themeToggle') as HTMLButtonElement;
    const languageSelect = document.getElementById('languageSelect') as HTMLSelectElement;
    const savedApiButtons = document.querySelectorAll('.saved-apis-btn');
    const shareBtn = document.getElementById('shareBtn') as HTMLButtonElement;
    const editPostBtnElement = document.getElementById('editPostBtn') as HTMLButtonElement;
    const savePostBtnElement = document.getElementById('savePostBtn') as HTMLButtonElement;
    const cancelPostBtnElement = document.getElementById('cancelPostBtn') as HTMLButtonElement;
    const scheduleBtnElement = document.getElementById('scheduleBtn') as HTMLButtonElement;
    const loadRedditPostsBtn = document.getElementById('loadRedditPostsBtn') as HTMLButtonElement;

    // AI Model selection button
    if (selectModelBtn) {
        selectModelBtn.addEventListener('click', openModal);
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
            const newLang = (e.target as HTMLSelectElement).value;
            updateCurrentLang(newLang);
            localStorage.setItem('lang', newLang);
            document.documentElement.lang = newLang;
            document.body.classList.toggle('rtl', newLang === 'ar');
            updateTexts();
            updateThemeToggle();
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

    if (shareFacebookBtn) {
        shareFacebookBtn.addEventListener('click', () => {
            getVscode()?.postMessage({ command: 'shareToFacebook', facebookToken: facebookToken?.value });
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
            console.log('Saved APIs button clicked, platform:', platform);

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

                console.log('Switched to tab:', tabName);
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
        scheduleBtnElement.addEventListener('click', () => {
            // Schedule post functionality
            const scheduleModal = document.getElementById('scheduleModal') as HTMLElement;
            if (scheduleModal) scheduleModal.style.display = 'flex';
        });
    }

    // Load Reddit posts button
    if (loadRedditPostsBtn) {
        loadRedditPostsBtn.addEventListener('click', () => {
            const accessToken = document.getElementById('redditAccessToken') as HTMLInputElement;
            if (!accessToken?.value.trim()) {
                showStatus('Reddit access token required.', 'error');
                return;
            }

            getVscode()?.postMessage({
                command: 'getRedditUserPosts',
                username: 'me' // Get current user's posts
            });
        });
    }

    // Reddit subreddit input and suggestions
    const redditPostSubreddit = document.getElementById('redditPostSubreddit') as HTMLInputElement;
    const subredditSuggestions = document.querySelectorAll('.subreddit-suggestion') as NodeListOf<HTMLButtonElement>;

    // Handle dynamic prefix updating for subreddit/user input
    if (redditPostSubreddit) {
        redditPostSubreddit.addEventListener('input', (e) => {
            const input = e.target as HTMLInputElement;
            const value = input.value;
            const prefixElement = input.previousElementSibling as HTMLElement;

            if (value.startsWith('u/')) {
                prefixElement.textContent = 'u/';
                input.value = value.substring(2); // Remove prefix from input value
            } else if (value.startsWith('r/')) {
                prefixElement.textContent = 'r/';
                input.value = value.substring(2); // Remove prefix from input value
            } else {
                prefixElement.textContent = 'r/'; // Default to r/
            }
        });
    }

    // Handle subreddit suggestion buttons
    subredditSuggestions.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const subreddit = button.getAttribute('data-subreddit');
            if (subreddit && redditPostSubreddit) {
                const prefixElement = redditPostSubreddit.parentElement?.previousElementSibling as HTMLElement;
                if (subreddit.startsWith('r/') && prefixElement) {
                    prefixElement.textContent = 'r/';
                    redditPostSubreddit.value = subreddit.substring(2);
                } else if (subreddit.startsWith('u/') && prefixElement) {
                    prefixElement.textContent = 'u/';
                    redditPostSubreddit.value = subreddit.substring(2);
                } else {
                    redditPostSubreddit.value = subreddit;
                }
            }
        });
    });

    // Reddit modal buttons (fallback for any existing modal usage)
    const shareRedditPostBtn = document.getElementById('shareRedditPostBtn') as HTMLButtonElement;
    const cancelRedditPostBtn = document.getElementById('cancelRedditPostBtn') as HTMLButtonElement;
    const closeRedditPostModal = document.getElementById('closeRedditPostModal') as HTMLElement;

    // Share Reddit post button (modal-based sharing - now secondary)
    if (shareRedditPostBtn) {
        shareRedditPostBtn.addEventListener('click', () => {
            const subredditInput = document.getElementById('redditSubreddit') as HTMLInputElement;
            const titleInput = document.getElementById('redditTitle') as HTMLInputElement;
            const flairSelect = document.getElementById('redditFlair') as HTMLSelectElement;
            const spoilerCheckbox = document.getElementById('redditSpoiler') as HTMLInputElement;
            const postTypeInputs = document.querySelectorAll('input[name="redditPostType"]') as NodeListOf<HTMLInputElement>;

            if (!subredditInput?.value.trim()) {
                showStatus('Please enter a subreddit name.', 'error');
                return;
            }

            if (!titleInput?.value.trim()) {
                showStatus('Please enter a post title.', 'error');
                return;
            }

            // Get pending share data from window
            const pendingShare = window.pendingRedditShare;
            if (!pendingShare) {
                showStatus('No post data found. Please try again.', 'error');
                return;
            }

            // Determine post type
            let postType = 'self'; // default
            postTypeInputs.forEach(input => {
                if (input.checked) postType = input.value;
            });

            // Collect data and share
            const postData = {
                text: pendingShare.text,
                mediaFilePaths: pendingShare.mediaFilePaths ?? [],
                subreddit: subredditInput.value.trim(),
                title: titleInput.value.trim(),
                flairId: flairSelect?.value || undefined,
                isSelfPost: postType === 'self',
                spoiler: spoilerCheckbox?.checked || false
            };

            getVscode()?.postMessage({
                command: 'shareToReddit',
                redditAccessToken: redditAccessToken?.value || '',
                redditRefreshToken: (document.getElementById('redditRefreshToken') as HTMLInputElement)?.value || '',
                subreddit: postData.subreddit,
                title: postData.title,
                text: postData.text,
                postType: postType,
                flairId: postData.flairId,
                spoiler: postData.spoiler,
                mediaFilePaths: postData.mediaFilePaths
            });

            // Close modal
            const redditModal = document.getElementById('redditPostModal') as HTMLElement;
            if (redditModal) redditModal.style.display = 'none';

            // Clear pending data
            if (window.pendingRedditShare) delete window.pendingRedditShare;

            showStatus('Sharing to Reddit...', 'success');
        });
    }

    // Cancel Reddit post button
    if (cancelRedditPostBtn) {
        cancelRedditPostBtn.addEventListener('click', () => {
            const redditModal = document.getElementById('redditPostModal') as HTMLElement;
            if (redditModal) redditModal.style.display = 'none';

            // Clear pending data
            if (window.pendingRedditShare) delete window.pendingRedditShare;

            showStatus('Reddit sharing cancelled.', 'success');
        });
    }

    // Close Reddit modal
    if (closeRedditPostModal) {
        closeRedditPostModal.addEventListener('click', () => {
            const redditModal = document.getElementById('redditPostModal') as HTMLElement;
            if (redditModal) redditModal.style.display = 'none';

            // Clear pending data
            if (window.pendingRedditShare) delete window.pendingRedditShare;

            showStatus('Reddit sharing cancelled.', 'success');
        });
    }

    console.log('Critical event listeners initialized - buttons should now work!');
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
