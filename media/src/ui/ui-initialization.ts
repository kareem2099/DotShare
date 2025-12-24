import { initializeGlobalDomElements } from '../core/utils';
import { initializePostHistoryElements } from '../management/post-history';

// From app.ts - DOM element initialization wrapper
export function initializeDOMElements(): void {
    // Call the global DOM element initialization function from utils.ts
    initializeGlobalDomElements();

    // Initialize post history elements for analytics
    initializePostHistoryElements();
}

import { mediaAttachment } from '../core/utils';

// Function to show media attachment (now always visible)
export function showMediaAttachment(): void {
    if (mediaAttachment) mediaAttachment.style.display = 'block';
}

// Helper function to get DOM elements safely for saved APIs
export function getDomElements() {
    return {
        savedApisModal: document.getElementById('savedApisModal') as HTMLDivElement,
        closeSavedApisModalBtn: document.getElementById('closeSavedApisModal') as HTMLSpanElement,
        savedApisList: document.getElementById('savedApisList') as HTMLDivElement,
        addNewApiSetBtn: document.getElementById('addNewApiSetBtn') as HTMLButtonElement,
        editApiForm: document.getElementById('editApiForm') as HTMLDivElement,
        apiSetNameInput: document.getElementById('apiSetName') as HTMLInputElement,
        apiFieldsContainer: document.getElementById('apiFields') as HTMLDivElement,
        saveApiSetBtn: document.getElementById('saveApiSetBtn') as HTMLButtonElement,
        cancelApiEditBtn: document.getElementById('cancelApiEditBtn') as HTMLButtonElement
    };
}

// Function to show/hide Reddit subreddit selection based on Reddit availability
export function updateRedditSubredditSectionVisibility() {
    const redditSection = document.getElementById('redditSubredditSection') as HTMLElement;
    if (!redditSection) return;

    const redditAccessToken = (document.getElementById('redditAccessToken') as HTMLInputElement)?.value.trim();
    const redditAvailable = redditAccessToken && redditAccessToken.length > 0;

    if (redditAvailable) {
        redditSection.style.display = 'block';
    } else {
        redditSection.style.display = 'none';
    }
}

// Modal elements - for AI model selection modal
export const providerTabBtns = document.querySelectorAll('.tab-btn');
export const providerPanels = document.querySelectorAll('.provider-panel');
export const geminiKeyModal = document.getElementById('geminiKeyModal') as HTMLInputElement;
export const geminiModelSelect = document.getElementById('geminiModel') as HTMLSelectElement;
export const openaiKeyInput = document.getElementById('openaiKey') as HTMLInputElement;
export const openaiModelSelect = document.getElementById('openaiModel') as HTMLSelectElement;
export const xaiKeyInput = document.getElementById('xaiKey') as HTMLInputElement;
export const xaiModelSelect = document.getElementById('xaiModel') as HTMLSelectElement;
