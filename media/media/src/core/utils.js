import { translations } from './translations';
// DOM Elements variables - these will be initialized by ui-initialization.ts
export let generateBtn = null;
export let shareLinkedInBtn = null;
export let shareTelegramBtn = null;
export let postText = null;
export let editPostBtn = null;
export let savePostBtn = null;
export let cancelPostBtn = null;
export let editControls = null;
export let statusMessage = null;
export let selectModelBtn = null;
export let selectedModelDisplay = null;
export let modelModal = null;
export let closeModal = null;
export let applyModelBtn = null;
// Platform input elements
export let linkedinToken = null;
export let telegramBot = null;
export let telegramChat = null;
export let facebookToken = null;
export let facebookPageToken = null;
export let facebookPageId = null;
export let discordWebhook = null;
export let blueskyIdentifier = null;
export let blueskyPassword = null;
// Media attachment elements
export let mediaAttachment = null;
export let uploadArea = null;
export let uploadBtn = null;
export let fileInput = null;
export let attachedFile = null;
export let fileNameSpan = null;
export let fileSizeSpan = null;
export let removeMediaBtn = null;
// Schedule modal elements
export let scheduleBtn = null;
export let scheduleModal = null;
export let closeScheduleModal = null;
export let scheduleDate = null;
export let scheduleLinkedIn = null;
export let scheduleTelegram = null;
export let scheduleReddit = null;
export let scheduledPostText = null;
export let scheduledMediaPreview = null;
export let cancelScheduleBtn = null;
export let confirmScheduleBtn = null;
export let editScheduledModal = null;
export let closeEditScheduledModal = null;
export let editScheduleDate = null;
export let editScheduleLinkedIn = null;
export let editScheduleTelegram = null;
export let editScheduleReddit = null;
export let editScheduledPostText = null;
export let editScheduledMediaPreview = null;
export let cancelEditScheduledBtn = null;
export let saveEditScheduledBtn = null;
export let scheduledPosts = null;
export let scheduledList = null;
// Theme variables (moved from app.ts)
export const themes = ['light-elegant', 'light-pure', 'dark-nebula', 'dark-cyber'];
export let currentThemeVariant = localStorage.getItem('theme') || 'light-elegant';
// Language variable (moved from app.ts)
export let currentLang = localStorage.getItem('lang') || 'en';
// Variable for scheduled post editing (moved from app.ts)
export let currentEditingPostId = null;
// Variable for post editing (moved from app.ts)
export let originalPost = '';
// Utility functions
export function formatFileSize(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
export function showStatus(message, type) {
    if (!statusMessage)
        return;
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'flex';
    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (statusMessage)
            statusMessage.style.display = 'none';
    }, 5000);
}
export function validateFile(file) {
    const maxSize = 8 * 1024 * 1024; // 8MB limit
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'];
    if (file.size > maxSize) {
        showStatus('File size must be less than 8MB.', 'error');
        return false;
    }
    if (!allowedTypes.includes(file.type)) {
        showStatus('Only JPG, PNG, GIF images and MP4 videos are supported.', 'error');
        return false;
    }
    return true;
}
export function formatTimestamp(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (minutes < 1)
        return 'Just now';
    if (minutes < 60)
        return `${minutes}m ago`;
    if (hours < 24)
        return `${hours}h ago`;
    if (days < 7)
        return `${days}d ago`;
    return date.toLocaleDateString();
}
export function getProviderEmoji(provider) {
    switch (provider) {
        case 'gemini': return '🔮';
        case 'openai': return '🤖';
        case 'xai': return '🦄';
        default: return '🤔';
    }
}
export function getStatusEmoji(success) {
    return success ? '✅' : '❌';
}
export function getScheduledStatusBadge(status) {
    switch (status) {
        case 'scheduled': return '<span class="status-badge scheduled">⏰ Scheduled</span>';
        case 'processing': return '<span class="status-badge processing">⚡ Processing</span>';
        case 'posted': return '<span class="status-badge posted">✅ Posted</span>';
        case 'failed': return '<span class="status-badge failed">❌ Failed</span>';
        default: return '<span class="status-badge unknown">❓ Unknown</span>';
    }
}
export function getPlatformIcon(platform) {
    const icons = {
        linkedin: '💼',
        x: '🐦',
        facebook: '📘',
        telegram: '📱',
        discord: '💬',
        reddit: '🟠',
        bluesky: '🦋'
    };
    return icons[platform] || '🔗';
}
export function getDefaultScheduleTime() {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    return now.toISOString().slice(0, 16);
}
export function updateThemeToggle() {
    const themeIcon = document.querySelector('#themeToggle .icon');
    const themeText = document.querySelector('#themeToggle .text');
    if (themeIcon && themeText) {
        const themeNames = {
            'light-elegant': 'Elegant Light 🌿',
            'light-pure': 'Pure Light ✨',
            'dark-nebula': 'Nebula Dark 🌌',
            'dark-cyber': 'Cyber Dark 🤖'
        };
        themeText.textContent = themeNames[currentThemeVariant] || currentThemeVariant;
        themeIcon.textContent = currentThemeVariant.startsWith('dark') ? '🌙' : '☀️';
    }
}
export function applyTheme() {
    // Remove all theme classes
    themes.forEach(theme => document.body.classList.remove(theme));
    // Add current
    document.body.classList.add(currentThemeVariant);
    // Set data-theme
    document.body.setAttribute('data-theme', currentThemeVariant);
    // Set dark class if dark theme
    const isDark = currentThemeVariant.startsWith('dark');
    document.body.classList.toggle('dark', isDark);
    updateThemeToggle();
}
export function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    // Update tab content
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.getElementById(`${tabName}Tab`).classList.add('active');
}
// Global variables for platform availability
export let availablePlatforms = [];
export function checkPlatformAvailability() {
    const newAvailablePlatforms = [];
    // LinkedIn: requires linkedinToken
    if (linkedinToken && linkedinToken.value.trim()) {
        newAvailablePlatforms.push('linkedin');
    }
    // X/Twitter: requires xAccessToken and xAccessSecret
    const xToken = document.getElementById('xAccessToken')?.value.trim();
    const xSecret = document.getElementById('xAccessSecret')?.value.trim();
    if (xToken && xSecret) {
        newAvailablePlatforms.push('x');
    }
    // Telegram: requires telegramBot and telegramChat
    if (telegramBot && telegramBot.value.trim() && telegramChat && telegramChat.value.trim()) {
        newAvailablePlatforms.push('telegram');
    }
    // Facebook: requires facebookToken
    if (facebookToken && facebookToken.value.trim()) {
        newAvailablePlatforms.push('facebook');
    }
    // Discord: requires discordWebhook
    if (discordWebhook && discordWebhook.value.trim()) {
        newAvailablePlatforms.push('discord');
    }
    // Reddit: requires redditAccessToken and redditRefreshToken
    const redditToken = document.getElementById('redditAccessToken')?.value.trim();
    const redditRefresh = document.getElementById('redditRefreshToken')?.value.trim();
    if (redditToken && redditRefresh) {
        newAvailablePlatforms.push('reddit');
    }
    // BlueSky: requires blueskyIdentifier and blueskyPassword
    if (blueskyIdentifier && blueskyIdentifier.value.trim() && blueskyPassword && blueskyPassword.value.trim()) {
        newAvailablePlatforms.push('bluesky');
    }
    availablePlatforms = newAvailablePlatforms;
}
export function updateDynamicPlatformSelector() {
    const selector = document.getElementById('dynamicPlatformSelector');
    if (!selector)
        return;
    // Clear existing content
    selector.innerHTML = '';
    if (availablePlatforms.length === 0) {
        // Show message to configure platforms first
        selector.innerHTML = `
            <div class="no-platforms-available">
                <span class="no-platforms-icon">⚠️</span>
                <span class="no-platforms-text">Configure your API keys in the Platforms tab first</span>
                <button class="switch-to-platforms-btn">Go to Platforms</button>
            </div>
        `;
        // Add event listener for the button
        const switchBtn = selector.querySelector('.switch-to-platforms-btn');
        if (switchBtn) {
            switchBtn.addEventListener('click', () => switchTab('platforms'));
        }
        return;
    }
    // Create platform groups and choices
    const groups = {
        'professional': { label: '💼 Professional', platforms: [] },
        'social': { label: '📱 Social', platforms: [] },
        'communities': { label: '💬 Communities', platforms: [] },
        'decentralized': { label: '🌐 Decentralized', platforms: [] }
    };
    const platformMapping = {
        linkedin: { name: 'LinkedIn', desc: 'Professional network', group: 'professional' },
        x: { name: 'X/Twitter', desc: 'Real-time updates', group: 'professional' },
        facebook: { name: 'Facebook', desc: 'Connect with audience', group: 'social' },
        telegram: { name: 'Telegram', desc: 'Send to channels/groups', group: 'communities' },
        discord: { name: 'Discord', desc: 'Community engagement', group: 'communities' },
        reddit: { name: 'Reddit', desc: 'Discussion forums', group: 'communities' },
        bluesky: { name: 'BlueSky', desc: 'Decentralized social', group: 'decentralized' }
    };
    // Group available platforms
    availablePlatforms.forEach(platform => {
        const mapping = platformMapping[platform];
        if (mapping) {
            groups[mapping.group].platforms.push(platform);
        }
    });
    // Create HTML for each group
    Object.entries(groups).forEach(([groupKey, group]) => {
        if (group.platforms.length > 0) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'platform-group';
            groupDiv.innerHTML = `<div class="group-label">${group.label}</div>`;
            group.platforms.forEach(platform => {
                const mapping = platformMapping[platform];
                const choiceLabel = document.createElement('label');
                choiceLabel.className = 'platform-choice';
                choiceLabel.innerHTML = `
                    <input type="checkbox" id="platform${platform.charAt(0).toUpperCase() + platform.slice(1)}" class="platform-checkbox" checked>
                    <div class="platform-info">
                        <span class="platform-icon">${getPlatformIcon(platform)}</span>
                        <div>
                            <span class="platform-name">${mapping.name}</span>
                            <span class="platform-desc">${mapping.desc}</span>
                        </div>
                    </div>
                `;
                groupDiv.appendChild(choiceLabel);
            });
            selector.appendChild(groupDiv);
        }
    });
}
export function updatePlatformSelection() {
    if (!postText)
        return;
    const selectedPlatforms = Array.from(document.querySelectorAll('.platform-checkbox:checked'))
        .map(cb => cb.id);
    // Update count display
    const countElement = document.querySelector('.preview-count');
    if (countElement) {
        countElement.textContent = `${selectedPlatforms.length} selected`;
    }
    // Update preview
    const previewList = document.querySelector('.platform-preview-list');
    if (previewList) {
        const placeholder = previewList.querySelector('.preview-placeholder');
        const platformPreviews = [];
        selectedPlatforms.forEach(platformId => {
            let icon = '';
            let name = '';
            switch (platformId) {
                case 'platformLinkedIn':
                    icon = '💼';
                    name = 'LinkedIn';
                    break;
                case 'platformX':
                    icon = '🐦';
                    name = 'X/Twitter';
                    break;
                case 'platformFacebook':
                    icon = '📘';
                    name = 'Facebook';
                    break;
                case 'platformInstagram':
                    icon = '📸';
                    name = 'Instagram';
                    break;
                case 'platformBlusky':
                    icon = '🦋';
                    name = 'BlueSky';
                    break;
                case 'platformDiscord':
                    icon = '💬';
                    name = 'Discord';
                    break;
                case 'platformReddit':
                    icon = '🟠';
                    name = 'Reddit';
                    break;
                case 'platformMastodon':
                    icon = '🦏';
                    name = 'Mastodon';
                    break;
            }
            if (icon && name) {
                platformPreviews.push(`
                    <div class="platform-preview-item">
                        <span class="platform-preview-icon">${icon}</span>
                        <span class="platform-preview-name">${name}</span>
                    </div>
                `);
            }
        });
        if (platformPreviews.length > 0) {
            if (placeholder)
                placeholder.style.display = 'none';
            const existingPreviews = previewList.querySelectorAll('.platform-preview-item');
            existingPreviews.forEach(p => p.remove());
            const previewContainer = document.createElement('div');
            previewContainer.className = 'platform-preview-items';
            previewContainer.innerHTML = platformPreviews.join('');
            previewList.appendChild(previewContainer);
        }
        else {
            if (placeholder)
                placeholder.style.display = 'flex';
            const previewContainer = previewList.querySelector('.platform-preview-items');
            if (previewContainer)
                previewContainer.remove();
        }
    }
}
export function updateButtonStates() {
    if (generateBtn && selectedModel)
        generateBtn.disabled = !selectedModel.apiKey?.trim();
    if (shareLinkedInBtn && linkedinToken)
        shareLinkedInBtn.disabled = !linkedinToken.value.trim();
    if (shareTelegramBtn && telegramBot && telegramChat)
        shareTelegramBtn.disabled = !(telegramBot.value.trim() && telegramChat.value.trim());
    // Update new platform buttons
    if (facebookToken) {
        const shareFacebookBtn = document.getElementById('shareFacebookBtn');
        if (shareFacebookBtn)
            shareFacebookBtn.disabled = !facebookToken.value.trim();
    }
    if (discordWebhook) {
        const shareDiscordBtn = document.getElementById('shareDiscordBtn');
        if (shareDiscordBtn)
            shareDiscordBtn.disabled = !discordWebhook.value.trim();
    }
    if (blueskyIdentifier && blueskyPassword) {
        const shareBlueSkyBtn = document.getElementById('shareBlueSkyBtn');
        if (shareBlueSkyBtn)
            shareBlueSkyBtn.disabled = !(blueskyIdentifier.value.trim() && blueskyPassword.value.trim());
    }
    // Update schedule button based on platform selections
    if (scheduleBtn) {
        const selectedPlatforms = document.querySelectorAll('.platform-checkbox:checked').length;
        scheduleBtn.disabled = selectedPlatforms === 0;
    }
    // Update share selected button
    if (postText) {
        const shareSelectedBtn = document.getElementById('shareSelectedBtn');
        if (shareSelectedBtn) {
            const selectedPlatforms = document.querySelectorAll('.platform-checkbox:checked').length;
            shareSelectedBtn.disabled = selectedPlatforms === 0 || !postText.value.trim();
        }
    }
}
// AI Model related variables
export let selectedModel = {
    provider: 'gemini',
    model: '',
    apiKey: ''
};
export function populateModelDropdown(selectElement, models, currentModel) {
    selectElement.innerHTML = ''; // Clear existing options
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        if (model === currentModel) {
            option.selected = true;
        }
        selectElement.appendChild(option);
    });
    // If no option was selected, auto-select the first (latest) model
    if (selectElement.selectedIndex === -1 && models.length > 0) {
        selectElement.selectedIndex = 0;
    }
}
export function updateSelectedModelDisplay() {
    if (!selectedModelDisplay)
        return;
    const providerNames = {
        gemini: 'Gemini',
        openai: 'ChatGPT',
        xai: 'X-AI'
    };
    if (selectedModel.model) {
        selectedModelDisplay.textContent = `${providerNames[selectedModel.provider]} (${selectedModel.model})`;
    }
    else {
        selectedModelDisplay.textContent = translations["noProvider"]?.[currentLang] || 'No provider selected - Click to configure';
    }
}
export function setGeneratingState(isGenerating) {
    if (!generateBtn)
        return;
    const originalText = translations["generateAI"]?.[currentLang] || 'Generate AI Post';
    if (isGenerating) {
        generateBtn.disabled = true;
        generateBtn.textContent = '🔄 Generating...';
        generateBtn.classList.add('loading');
    }
    else {
        generateBtn.disabled = !(selectedModel.apiKey?.trim());
        generateBtn.textContent = originalText;
        generateBtn.classList.remove('loading');
    }
}
// Function to update selectedModel
export function updateSelectedModel(newModel) {
    selectedModel = newModel;
}
// Function to update current theme
export function updateThemeVariant(newTheme) {
    currentThemeVariant = newTheme;
}
// Function to update current language
export function updateCurrentLang(newLang) {
    currentLang = newLang;
}
// Function to set current editing post ID
export function setCurrentEditingPostId(id) {
    currentEditingPostId = id;
}
// Function to set original post
export function setOriginalPost(value) {
    originalPost = value;
}
// DOM element initialization function
export function initializeGlobalDomElements() {
    // Button elements
    const generateBtnElement = document.getElementById('generateBtn');
    if (generateBtnElement)
        generateBtn = generateBtnElement;
    const shareLinkedInBtnElement = document.getElementById('shareLinkedInBtn');
    if (shareLinkedInBtnElement)
        shareLinkedInBtn = shareLinkedInBtnElement;
    const shareTelegramBtnElement = document.getElementById('shareTelegramBtn');
    if (shareTelegramBtnElement)
        shareTelegramBtn = shareTelegramBtnElement;
    const selectModelBtnElement = document.getElementById('configureAIBtn');
    if (selectModelBtnElement)
        selectModelBtn = selectModelBtnElement;
    // Post editor elements
    const postTextElement = document.getElementById('postText');
    if (postTextElement)
        postText = postTextElement;
    const editPostBtnElement = document.getElementById('editPostBtn');
    if (editPostBtnElement)
        editPostBtn = editPostBtnElement;
    const savePostBtnElement = document.getElementById('savePostBtn');
    if (savePostBtnElement)
        savePostBtn = savePostBtnElement;
    const cancelPostBtnElement = document.getElementById('cancelPostBtn');
    if (cancelPostBtnElement)
        cancelPostBtn = cancelPostBtnElement;
    const editControlsElement = document.getElementById('editControls');
    if (editControlsElement)
        editControls = editControlsElement;
    // Status message
    const statusMessageElement = document.getElementById('statusMessage');
    if (statusMessageElement)
        statusMessage = statusMessageElement;
    const selectedModelDisplayElement = document.getElementById('selectedAIDisplay');
    if (selectedModelDisplayElement)
        selectedModelDisplay = selectedModelDisplayElement;
    const modelModalElement = document.getElementById('modelModal');
    if (modelModalElement)
        modelModal = modelModalElement;
    const closeModalElement = document.getElementById('closeModal');
    if (closeModalElement)
        closeModal = closeModalElement;
    const applyModelBtnElement = document.getElementById('applyModelBtn');
    if (applyModelBtnElement)
        applyModelBtn = applyModelBtnElement;
    // Platform input elements
    const linkedinTokenElement = document.getElementById('linkedinToken');
    if (linkedinTokenElement)
        linkedinToken = linkedinTokenElement;
    const telegramBotElement = document.getElementById('telegramBot');
    if (telegramBotElement)
        telegramBot = telegramBotElement;
    const telegramChatElement = document.getElementById('telegramChat');
    if (telegramChatElement)
        telegramChat = telegramChatElement;
    const facebookTokenElement = document.getElementById('facebookToken');
    if (facebookTokenElement)
        facebookToken = facebookTokenElement;
    const facebookPageTokenElement = document.getElementById('facebookPageToken');
    if (facebookPageTokenElement)
        facebookPageToken = facebookPageTokenElement;
    const facebookPageIdElement = document.getElementById('facebookPageId');
    if (facebookPageIdElement)
        facebookPageId = facebookPageIdElement;
    const discordWebhookElement = document.getElementById('discordWebhook');
    if (discordWebhookElement)
        discordWebhook = discordWebhookElement;
    const blueskyIdentifierElement = document.getElementById('blueskyIdentifier');
    if (blueskyIdentifierElement)
        blueskyIdentifier = blueskyIdentifierElement;
    const blueskyPasswordElement = document.getElementById('blueskyPassword');
    if (blueskyPasswordElement)
        blueskyPassword = blueskyPasswordElement;
    // Media attachment elements
    const mediaAttachmentElement = document.getElementById('mediaAttachment');
    if (mediaAttachmentElement)
        mediaAttachment = mediaAttachmentElement;
    const uploadAreaElement = document.getElementById('uploadArea');
    if (uploadAreaElement)
        uploadArea = uploadAreaElement;
    const uploadBtnElement = document.getElementById('uploadBtn');
    if (uploadBtnElement)
        uploadBtn = uploadBtnElement;
    const fileInputElement = document.getElementById('fileInput');
    if (fileInputElement)
        fileInput = fileInputElement;
    const attachedFileElement = document.getElementById('attachedFile');
    if (attachedFileElement)
        attachedFile = attachedFileElement;
    const fileNameSpanElement = document.getElementById('fileName');
    if (fileNameSpanElement)
        fileNameSpan = fileNameSpanElement;
    const fileSizeSpanElement = document.getElementById('fileSize');
    if (fileSizeSpanElement)
        fileSizeSpan = fileSizeSpanElement;
    const removeMediaBtnElement = document.getElementById('removeMediaBtn');
    if (removeMediaBtnElement)
        removeMediaBtn = removeMediaBtnElement;
    // Schedule modal elements
    const scheduleBtnElement = document.getElementById('scheduleBtn');
    if (scheduleBtnElement)
        scheduleBtn = scheduleBtnElement;
    const scheduleModalElement = document.getElementById('scheduleModal');
    if (scheduleModalElement)
        scheduleModal = scheduleModalElement;
    const closeScheduleModalElement = document.getElementById('closeScheduleModal');
    if (closeScheduleModalElement)
        closeScheduleModal = closeScheduleModalElement;
    const scheduleDateElement = document.getElementById('scheduleDate');
    if (scheduleDateElement)
        scheduleDate = scheduleDateElement;
    const scheduleLinkedInElement = document.getElementById('scheduleLinkedIn');
    if (scheduleLinkedInElement)
        scheduleLinkedIn = scheduleLinkedInElement;
    const scheduleTelegramElement = document.getElementById('scheduleTelegram');
    if (scheduleTelegramElement)
        scheduleTelegram = scheduleTelegramElement;
    const scheduleRedditElement = document.getElementById('scheduleReddit');
    if (scheduleRedditElement)
        scheduleReddit = scheduleRedditElement;
    const scheduledPostTextElement = document.getElementById('scheduledPostText');
    if (scheduledPostTextElement)
        scheduledPostText = scheduledPostTextElement;
    const scheduledMediaPreviewElement = document.getElementById('scheduledMediaPreview');
    if (scheduledMediaPreviewElement)
        scheduledMediaPreview = scheduledMediaPreviewElement;
    const cancelScheduleBtnElement = document.getElementById('cancelScheduleBtn');
    if (cancelScheduleBtnElement)
        cancelScheduleBtn = cancelScheduleBtnElement;
    const confirmScheduleBtnElement = document.getElementById('confirmScheduleBtn');
    if (confirmScheduleBtnElement)
        confirmScheduleBtn = confirmScheduleBtnElement;
    // Edit scheduled modal elements
    const editScheduledModalElement = document.getElementById('editScheduledModal');
    if (editScheduledModalElement)
        editScheduledModal = editScheduledModalElement;
    const closeEditScheduledModalElement = document.getElementById('closeEditScheduledModal');
    if (closeEditScheduledModalElement)
        closeEditScheduledModal = closeEditScheduledModalElement;
    const editScheduleDateElement = document.getElementById('editScheduleDate');
    if (editScheduleDateElement)
        editScheduleDate = editScheduleDateElement;
    const editScheduleLinkedInElement = document.getElementById('editScheduleLinkedIn');
    if (editScheduleLinkedInElement)
        editScheduleLinkedIn = editScheduleLinkedInElement;
    const editScheduleTelegramElement = document.getElementById('editScheduleTelegram');
    if (editScheduleTelegramElement)
        editScheduleTelegram = editScheduleTelegramElement;
    const editScheduleRedditElement = document.getElementById('editScheduleReddit');
    if (editScheduleRedditElement)
        editScheduleReddit = editScheduleRedditElement;
    const editScheduledPostTextElement = document.getElementById('editScheduledPostText');
    if (editScheduledPostTextElement)
        editScheduledPostText = editScheduledPostTextElement;
    const editScheduledMediaPreviewElement = document.getElementById('editScheduledMediaPreview');
    if (editScheduledMediaPreviewElement)
        editScheduledMediaPreview = editScheduledMediaPreviewElement;
    const cancelEditScheduledBtnElement = document.getElementById('cancelEditScheduledBtn');
    if (cancelEditScheduledBtnElement)
        cancelEditScheduledBtn = cancelEditScheduledBtnElement;
    const saveEditScheduledBtnElement = document.getElementById('saveEditScheduledBtn');
    if (saveEditScheduledBtnElement)
        saveEditScheduledBtn = saveEditScheduledBtnElement;
    // Scheduled posts display
    const scheduledPostsElement = document.getElementById('scheduledPosts');
    if (scheduledPostsElement)
        scheduledPosts = scheduledPostsElement;
    const scheduledListElement = document.getElementById('scheduledList');
    if (scheduledListElement)
        scheduledList = scheduledListElement;
    console.log('Global DOM elements initialized successfully');
}
