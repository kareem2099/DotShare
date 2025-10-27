import { initializeGlobalDomElements } from '../core/utils';
import { initializePostHistoryElements } from '../management/post-history';
// From app.ts - DOM element initialization wrapper
export function initializeDOMElements() {
    // Call the global DOM element initialization function from utils.ts
    initializeGlobalDomElements();
    // Initialize post history elements for analytics
    initializePostHistoryElements();
}
import { postText, mediaAttachment } from '../core/utils';
// Function to show media attachment when postText is not empty
export function showMediaAttachment() {
    if (postText && postText.value.trim()) {
        if (mediaAttachment)
            mediaAttachment.style.display = 'block';
    }
}
// Helper function to get DOM elements safely for saved APIs
export function getDomElements() {
    return {
        savedApisModal: document.getElementById('savedApisModal'),
        closeSavedApisModalBtn: document.getElementById('closeSavedApisModal'),
        savedApisList: document.getElementById('savedApisList'),
        addNewApiSetBtn: document.getElementById('addNewApiSetBtn'),
        editApiForm: document.getElementById('editApiForm'),
        apiSetNameInput: document.getElementById('apiSetName'),
        apiFieldsContainer: document.getElementById('apiFields'),
        saveApiSetBtn: document.getElementById('saveApiSetBtn'),
        cancelApiEditBtn: document.getElementById('cancelApiEditBtn')
    };
}
// Modal elements - for AI model selection modal
export const providerTabBtns = document.querySelectorAll('.tab-btn');
export const providerPanels = document.querySelectorAll('.provider-panel');
export const geminiKeyModal = document.getElementById('geminiKeyModal');
export const geminiModelSelect = document.getElementById('geminiModel');
export const openaiKeyInput = document.getElementById('openaiKey');
export const openaiModelSelect = document.getElementById('openaiModel');
export const xaiKeyInput = document.getElementById('xaiKey');
export const xaiModelSelect = document.getElementById('xaiModel');
