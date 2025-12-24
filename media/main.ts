interface VSCodeAPI {
    postMessage(message: unknown): void;
}

declare global {
    interface Window {
        vscode: VSCodeAPI;
    }
}

declare const acquireVsCodeApi: () => VSCodeAPI;

// SINGLE VS Code API instance - shared globally
const vscode = acquireVsCodeApi();
window.vscode = vscode;

// Lazy vscode accessor to avoid undefined issues
const getVscode = () => vscode;

import { Message } from '../src/types';
import {
    applyTheme,
    showStatus,
    postText,
    setGeneratingState,
    checkPlatformAvailability,
    updateButtonStates,
    linkedinToken,
    telegramBot,
    telegramChat,
    facebookToken,
    facebookPageToken,
    facebookPageId,
    discordWebhook,
    blueskyIdentifier,
    blueskyPassword,
    setOriginalPost,
    updateSelectedModel,
    updateSelectedModelDisplay,
    currentLang
} from './src/core/utils';
import { updateTexts } from './src/core/translations';
import { initializeDOMElements, updateRedditSubredditSectionVisibility } from './src/ui/ui-initialization';
import { initializeCriticalEventListeners, setupPlatformEventListeners, setupRedditEventListeners } from './src/handlers/event-handlers';
import {
    loadHistoryAndAnalytics,
    updatePostHistory,
    updateAnalytics,
    showPostHistory
} from './src/management/post-history';
import { attachMultipleMedia, attachMedia, showMediaAttachment, initializeMediaUpload, addDragOverStyles } from './src/management/media-attachments';
import {
    loadSavedApisForAllPlatforms,
    loadSavedApis,
    currentSavedApisPlatform
} from './src/management/saved-apis';
import { displaySavedApis, handleModelUpdate } from './src/handlers/modal-handlers';
import { updateScheduledPosts } from './src/management/scheduled-posts';
import { displayRedditPosts } from './src/management/platform-handlers';
import { updateDynamicPlatformSelector } from './src/core/utils';

// Apply initial settings
document.documentElement.lang = currentLang;
if (currentLang === 'ar') document.body.classList.add('rtl');
applyTheme();

// Show media attachment immediately (always visible)
showMediaAttachment();

// Initialize all critical event listeners immediately
initializeCriticalEventListeners();

window.addEventListener('load', () => {
    try {
        console.log('DOM loaded, initializing application...');

        // Initialize DOM elements after page load
        initializeDOMElements();

        // Setup platform input event listeners
        setupPlatformEventListeners();

        // Setup Reddit-specific event listeners
        setupRedditEventListeners();

        console.log('Translations loaded statically');
        updateTexts();

        // Load history and analytics
        loadHistoryAndAnalytics();

        // Load saved APIs for all platforms
        loadSavedApisForAllPlatforms();

        // Initialize media upload functionality
        initializeMediaUpload();
        addDragOverStyles();

        // Add event listeners for platform checkboxes to enable/disable buttons
        const platformCheckboxes = document.querySelectorAll('.platform-checkbox');
        platformCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', updateButtonStates);
        });

        // Add event listener for post text changes to update buttons
        if (postText) {
            postText.addEventListener('input', updateButtonStates);
        }

        // Initialize Reddit subreddit section visibility
        updateRedditSubredditSectionVisibility();

        console.log('Application initialization complete!');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

// Message listener for updates from extension
window.addEventListener('message', (event: MessageEvent<Message>) => {
    const message = event.data;
    switch (message.command) {
        case 'updatePost':
            if (message.post && postText) {
                postText.value = message.post;
                setOriginalPost(message.post);
                setGeneratingState(false);
                showMediaAttachment();
            }
            break;
        case 'status':
            if (message.status && message.type) {
                showStatus(message.status, message.type);

                // Reset Reddit token generation button if we get an error status (likely for token generation)
                if (message.type === 'error' && message.status.includes('Reddit access token')) {
                    const generateBtn = document.getElementById('generateRedditTokensBtn') as HTMLButtonElement;
                    if (generateBtn) {
                        generateBtn.disabled = false;
                        generateBtn.textContent = '🔑 Generate Tokens';
                    }
                }
            }
            break;
        case 'updateConfiguration':
            // Handle model selection
            if (message.selectedModel) {
                updateSelectedModel(message.selectedModel);
                updateSelectedModelDisplay();
            }
            // Handle auto-fill of platform inputs
            if (message.linkedinToken !== undefined) {
                const liToken = linkedinToken;
                if (liToken) liToken.value = message.linkedinToken;
            }
            if (message.telegramBot !== undefined) {
                const tgBot = telegramBot;
                if (tgBot) tgBot.value = message.telegramBot;
            }
            if (message.telegramChat !== undefined) {
                const tgChat = telegramChat;
                if (tgChat) tgChat.value = message.telegramChat;
            }
            if (message.facebookToken !== undefined) {
                const fbToken = facebookToken;
                if (fbToken) fbToken.value = message.facebookToken;
            }
            if (message.facebookPageToken !== undefined) {
                const fbPageToken = facebookPageToken;
                if (fbPageToken) fbPageToken.value = message.facebookPageToken;
            }
            if (message.facebookPageId !== undefined) {
                const fbPageId = facebookPageId;
                if (fbPageId) fbPageId.value = message.facebookPageId;
            }
            if (message.discordWebhookUrl !== undefined) {
                const dWebhook = discordWebhook;
                if (dWebhook) dWebhook.value = message.discordWebhookUrl;
            }
            if (message.redditAccessToken !== undefined) {
                const redditToken = document.getElementById('redditAccessToken') as HTMLInputElement;
                if (redditToken) redditToken.value = message.redditAccessToken;
            }
            if (message.redditRefreshToken !== undefined) {
                const redditRefresh = document.getElementById('redditRefreshToken') as HTMLInputElement;
                if (redditRefresh) redditRefresh.value = message.redditRefreshToken;
            }
            // Auto-fill Reddit app credentials
            if (message.redditClientId !== undefined) {
                const clientIdInput = document.getElementById('redditClientId') as HTMLInputElement;
                if (clientIdInput) clientIdInput.value = message.redditClientId;
            }
            if (message.redditClientSecret !== undefined) {
                const clientSecretInput = document.getElementById('redditClientSecret') as HTMLInputElement;
                if (clientSecretInput) clientSecretInput.value = message.redditClientSecret;
            }
            if (message.redditUsername !== undefined) {
                const usernameInput = document.getElementById('redditUsername') as HTMLInputElement;
                if (usernameInput) usernameInput.value = message.redditUsername;
            }
            if (message.redditPassword !== undefined) {
                const passwordInput = document.getElementById('redditPassword') as HTMLInputElement;
                if (passwordInput) passwordInput.value = message.redditPassword;
            }
            if (message.redditApiName !== undefined) {
                const apiNameInput = document.getElementById('redditApiName') as HTMLInputElement;
                if (apiNameInput) apiNameInput.value = message.redditApiName;
            }
            if (message.blueskyIdentifier !== undefined) {
                const bsIdentifier = blueskyIdentifier;
                if (bsIdentifier) bsIdentifier.value = message.blueskyIdentifier;
            }
            if (message.blueskyPassword !== undefined) {
                const bsPassword = blueskyPassword;
                if (bsPassword) bsPassword.value = message.blueskyPassword;
            }

            checkPlatformAvailability();
            updateButtonStates();
            updateDynamicPlatformSelector();
            updateRedditSubredditSectionVisibility();
            break;
        case 'updateModels':
            handleModelUpdate(message);
            break;
        case 'mediaSelected':
            if (message.mediaFiles && message.mediaFiles.length > 0) {
                attachMultipleMedia(message.mediaFiles);
            } else if (message.mediaPath && message.mediaFilePath && message.fileName && message.fileSize !== undefined) {
                attachMedia(message.mediaPath, message.mediaFilePath, message.fileName, message.fileSize);
            }
            break;
        case 'updatePostHistory':
            if (message.postHistory) {
                updatePostHistory(message.postHistory);
                showPostHistory();
            }
            break;
        case 'updateAnalytics':
            if (message.analytics) {
                updateAnalytics(message.analytics);
            }
            break;
        case 'updateScheduledPosts':
            if (message.scheduledPosts) {
                updateScheduledPosts(message.scheduledPosts);
            }
            break;
        case 'savedApisLoaded':
            if (message.platform && message.savedApis) {
                displaySavedApis(message.savedApis);
            }
            break;
        case 'apiConfigurationLoaded':
            if (message.apiConfig) {
                // Reload configuration to update all input fields in the main UI
                getVscode()?.postMessage({ command: 'loadConfiguration' });
            }
            break;
        case 'apiConfigurationSaved':
            // Reload the list after saving
            loadSavedApis(currentSavedApisPlatform);
            break;
        case 'defaultConfigurationSet':
            // Reload the list to show the updated default status
            loadSavedApis(currentSavedApisPlatform);
            break;
        case 'redditTokensGenerated':
            if (message.tokens) {
                // Auto-fill the token input fields with generated tokens
                const accessTokenInput = document.getElementById('redditAccessToken') as HTMLInputElement;
                const refreshTokenInput = document.getElementById('redditRefreshToken') as HTMLInputElement;

                if (accessTokenInput) accessTokenInput.value = message.tokens.accessToken;
                if (refreshTokenInput) refreshTokenInput.value = message.tokens.refreshToken;

                // Auto-save the generated tokens to VS Code settings
                getVscode()?.postMessage({
                    command: 'saveRedditCredentials',
                    redditAccessToken: message.tokens.accessToken,
                    redditRefreshToken: message.tokens.refreshToken
                });

                // Reset the button state and update UI
                const generateBtn = document.getElementById('generateRedditTokensBtn') as HTMLButtonElement;
                if (generateBtn) {
                    generateBtn.disabled = false;
                    generateBtn.textContent = '🔑 Generate Tokens';
                }

                showStatus('Reddit tokens generated, auto-filled, and saved successfully!', 'success');

                // Update platform availability after auto-saving tokens
                setTimeout(() => checkPlatformAvailability(), 100);
                setTimeout(() => updateButtonStates(), 200);
                setTimeout(() => updateRedditSubredditSectionVisibility(), 300);
            }
            break;
        case 'redditUserPostsRetrieved':
            if (message.posts) {
                displayRedditPosts(message.posts);
            }
            break;
    }
});
