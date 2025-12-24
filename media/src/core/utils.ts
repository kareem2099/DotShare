import { SelectedModel } from '../../../src/types';
import { translations } from './translations';

// DOM Elements variables - these will be initialized by ui-initialization.ts
export let generateBtn: HTMLButtonElement | null = null;
export let shareLinkedInBtn: HTMLButtonElement | null = null;
export let shareTelegramBtn: HTMLButtonElement | null = null;
export let postText: HTMLTextAreaElement | null = null;
export let editPostBtn: HTMLButtonElement | null = null;
export let savePostBtn: HTMLButtonElement | null = null;
export let cancelPostBtn: HTMLButtonElement | null = null;
export let editControls: HTMLDivElement | null = null;
export let statusMessage: HTMLDivElement | null = null;
export let selectModelBtn: HTMLButtonElement | null = null;
export let selectedModelDisplay: HTMLDivElement | null = null;
export let modelModal: HTMLDivElement | null = null;
export let closeModal: HTMLSpanElement | null = null;
export let applyModelBtn: HTMLButtonElement | null = null;

// Platform input elements
export let linkedinToken: HTMLInputElement | null = null;
export let telegramBot: HTMLInputElement | null = null;
export let telegramChat: HTMLInputElement | null = null;
export let facebookToken: HTMLInputElement | null = null;
export let facebookPageToken: HTMLInputElement | null = null;
export let facebookPageId: HTMLInputElement | null = null;
export let discordWebhook: HTMLInputElement | null = null;
export let xAccessToken: HTMLInputElement | null = null;
export let xAccessSecret: HTMLInputElement | null = null;
export let redditAccessToken: HTMLInputElement | null = null;
export let blueskyIdentifier: HTMLInputElement | null = null;
export let blueskyPassword: HTMLInputElement | null = null;

// Media attachment elements
export let mediaAttachment: HTMLDivElement | null = null;
export let uploadArea: HTMLDivElement | null = null;
export let uploadBtn: HTMLButtonElement | null = null;
export let fileInput: HTMLInputElement | null = null;
export let attachedFile: HTMLDivElement | null = null;
export let fileNameSpan: HTMLSpanElement | null = null;
export let fileSizeSpan: HTMLSpanElement | null = null;
export let removeMediaBtn: HTMLButtonElement | null = null;

// Schedule modal elements
export let scheduleBtn: HTMLButtonElement | null = null;
export let scheduleModal: HTMLDivElement | null = null;
export let closeScheduleModal: HTMLSpanElement | null = null;
export let scheduleDate: HTMLInputElement | null = null;
export let scheduleLinkedIn: HTMLInputElement | null = null;
export let scheduleTelegram: HTMLInputElement | null = null;
export let scheduleReddit: HTMLInputElement | null = null;
export let scheduledPostText: HTMLTextAreaElement | null = null;
export let scheduledMediaPreview: HTMLDivElement | null = null;
export let cancelScheduleBtn: HTMLButtonElement | null = null;
export let confirmScheduleBtn: HTMLButtonElement | null = null;
export let editScheduledModal: HTMLDivElement | null = null;
export let closeEditScheduledModal: HTMLSpanElement | null = null;
export let editScheduleDate: HTMLInputElement | null = null;
export let editScheduleLinkedIn: HTMLInputElement | null = null;
export let editScheduleTelegram: HTMLInputElement | null = null;
export let editScheduleReddit: HTMLInputElement | null = null;
export let editScheduledPostText: HTMLTextAreaElement | null = null;
export let editScheduledMediaPreview: HTMLDivElement | null = null;
export let cancelEditScheduledBtn: HTMLButtonElement | null = null;
export let saveEditScheduledBtn: HTMLButtonElement | null = null;
export let scheduledPosts: HTMLDivElement | null = null;
export let scheduledList: HTMLDivElement | null = null;

// Theme variables (moved from app.ts)
export const themes = ['light-elegant', 'light-pure', 'dark-nebula', 'dark-cyber'];
export let currentThemeVariant: string = localStorage.getItem('theme') || 'light-elegant';

// Language variable (moved from app.ts)
export let currentLang: string = localStorage.getItem('lang') || 'en';

// Variable for scheduled post editing (moved from app.ts)
export let currentEditingPostId: string | null = null;

// Variable for post editing (moved from app.ts)
export let originalPost = '';

// Utility functions
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function showStatus(message: string, type: 'success' | 'error'): void {
    if (!statusMessage) return;

    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'flex';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (statusMessage) statusMessage.style.display = 'none';
    }, 5000);
}

export function validateFile(file: File): boolean {
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

export function formatTimestamp(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
}

export function getProviderEmoji(provider: 'gemini' | 'openai' | 'xai'): string {
    switch (provider) {
        case 'gemini': return '🔮';
        case 'openai': return '🤖';
        case 'xai': return '🦄';
        default: return '🤔';
    }
}

export function getStatusEmoji(success: boolean): string {
    return success ? '✅' : '❌';
}

export function getScheduledStatusBadge(status: string): string {
    switch (status) {
        case 'scheduled': return '<span class="status-badge scheduled">⏰ Scheduled</span>';
        case 'processing': return '<span class="status-badge processing">⚡ Processing</span>';
        case 'posted': return '<span class="status-badge posted">✅ Posted</span>';
        case 'failed': return '<span class="status-badge failed">❌ Failed</span>';
        default: return '<span class="status-badge unknown">❓ Unknown</span>';
    }
}

export function getPlatformIcon(platform: string): string {
    const icons: { [key: string]: string } = {
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

export function getDefaultScheduleTime(): string {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    return now.toISOString().slice(0, 16);
}

export function updateThemeToggle(): void {
    const themeIcon = document.querySelector('#themeToggle .icon') as HTMLElement;
    const themeText = document.querySelector('#themeToggle .text') as HTMLElement;
    if (themeIcon && themeText) {
        const themeNames = {
            'light-elegant': 'Elegant Light 🌿',
            'light-pure': 'Pure Light ✨',
            'dark-nebula': 'Nebula Dark 🌌',
            'dark-cyber': 'Cyber Dark 🤖'
        };
        themeText.textContent = themeNames[currentThemeVariant as keyof typeof themeNames] || currentThemeVariant;
        themeIcon.textContent = currentThemeVariant.startsWith('dark') ? '🌙' : '☀️';
    }
}

export function applyTheme(): void {
    console.log('Applying theme:', currentThemeVariant);
    // Remove all theme classes
    themes.forEach(theme => document.body.classList.remove(theme));
    // Add current
    document.body.classList.add(currentThemeVariant);
    // Set data-theme
    document.body.setAttribute('data-theme', currentThemeVariant);
    // Set dark class if dark theme
    const isDark = currentThemeVariant.startsWith('dark');
    document.body.classList.toggle('dark', isDark);
    console.log('Body classes after theme apply:', document.body.className);
    updateThemeToggle();
}



export function switchTab(tabName: string): void {
    // Update tab buttons
    document.querySelectorAll('.tab-nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.getElementById(`${tabName}Tab`)?.classList.add('active');
}

// Global variables for platform availability
export let availablePlatforms: string[] = [];

export function checkPlatformAvailability(): void {
    const newAvailablePlatforms: string[] = [];

    // LinkedIn: requires linkedinToken
    if (linkedinToken && linkedinToken.value.trim()) {
        newAvailablePlatforms.push('linkedin');
    }

    // X/Twitter: requires xAccessToken and xAccessSecret
    if (xAccessToken && xAccessToken.value.trim() && xAccessSecret && xAccessSecret.value.trim()) {
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

    // Reddit: requires redditAccessToken and redditRefreshToken - Reddit uses script app which only needs access_token initially
    // The refresh token may not be provided for script apps, so we'll just require the access token
    if (redditAccessToken && redditAccessToken.value.trim()) {
        newAvailablePlatforms.push('reddit');
    }

    // BlueSky: requires blueskyIdentifier and blueskyPassword
    if (blueskyIdentifier && blueskyIdentifier.value.trim() && blueskyPassword && blueskyPassword.value.trim()) {
        newAvailablePlatforms.push('bluesky');
    }

    availablePlatforms = newAvailablePlatforms;
}

export function updateDynamicPlatformSelector(): void {
    const selector = document.getElementById('dynamicPlatformSelector');
    if (!selector) return;

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
        const switchBtn = selector.querySelector('.switch-to-platforms-btn') as HTMLButtonElement;
        if (switchBtn) {
            switchBtn.addEventListener('click', () => switchTab('platforms'));
        }
        return;
    }

    // Create platform groups and choices
    const groups = {
        'professional': { label: '💼 Professional', platforms: [] as string[] },
        'social': { label: '📱 Social', platforms: [] as string[] },
        'communities': { label: '💬 Communities', platforms: [] as string[] },
        'decentralized': { label: '🌐 Decentralized', platforms: [] as string[] }
    };

    const platformMapping: { [key: string]: { name: string; desc: string; group: keyof typeof groups } } = {
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
    Object.entries(groups).forEach(([, group]) => {
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

export function updatePlatformSelection(): void {
    if (!postText) return;

    const selectedPlatforms = Array.from(document.querySelectorAll('.platform-checkbox:checked'))
        .map(cb => (cb as HTMLInputElement).id);

    // Update count display
    const countElement = document.querySelector('.preview-count') as HTMLElement;
    if (countElement) {
        countElement.textContent = `${selectedPlatforms.length} selected`;
    }

    // Update preview
    const previewList = document.querySelector('.platform-preview-list') as HTMLElement;
    if (previewList) {
        const placeholder = previewList.querySelector('.preview-placeholder') as HTMLElement;
        const platformPreviews: string[] = [];

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
            if (placeholder) placeholder.style.display = 'none';
            const existingPreviews = previewList.querySelectorAll('.platform-preview-item');
            existingPreviews.forEach(p => p.remove());

            const previewContainer = document.createElement('div');
            previewContainer.className = 'platform-preview-items';
            previewContainer.innerHTML = platformPreviews.join('');
            previewList.appendChild(previewContainer);
        } else {
            if (placeholder) placeholder.style.display = 'flex';
            const previewContainer = previewList.querySelector('.platform-preview-items');
            if (previewContainer) previewContainer.remove();
        }
    }
}

export function updateButtonStates(): void {
    if (generateBtn && selectedModel) generateBtn.disabled = !selectedModel.apiKey?.trim();
    if (shareLinkedInBtn && linkedinToken) shareLinkedInBtn.disabled = !linkedinToken.value.trim();
    if (shareTelegramBtn && telegramBot && telegramChat) shareTelegramBtn.disabled = !(telegramBot.value.trim() && telegramChat.value.trim());

    // Update new platform buttons
    if (facebookToken) {
        const shareFacebookBtn = document.getElementById('shareFacebookBtn') as HTMLButtonElement | null;
        if (shareFacebookBtn) shareFacebookBtn.disabled = !facebookToken.value.trim();
    }

    if (discordWebhook) {
        const shareDiscordBtn = document.getElementById('shareDiscordBtn') as HTMLButtonElement | null;
        if (shareDiscordBtn) shareDiscordBtn.disabled = !discordWebhook.value.trim();
    }

    if (blueskyIdentifier && blueskyPassword) {
        const shareBlueSkyBtn = document.getElementById('shareBlueSkyBtn') as HTMLButtonElement | null;
        if (shareBlueSkyBtn) shareBlueSkyBtn.disabled = !(blueskyIdentifier.value.trim() && blueskyPassword.value.trim());
    }

    // Update schedule button based on platform selections
    if (scheduleBtn) {
        const selectedPlatforms = document.querySelectorAll('.platform-checkbox:checked').length;
        scheduleBtn.disabled = selectedPlatforms === 0;
    }

    // Update share selected button
    if (postText) {
        const shareSelectedBtn = document.getElementById('shareSelectedBtn') as HTMLButtonElement | null;
        if (shareSelectedBtn) {
            const selectedPlatforms = document.querySelectorAll('.platform-checkbox:checked').length;
            shareSelectedBtn.disabled = selectedPlatforms === 0 || !postText.value.trim();
        }
    }
}

// AI Model related variables
export let selectedModel: SelectedModel = {
    provider: 'gemini',
    model: '',
    apiKey: ''
};

export function populateModelDropdown(selectElement: HTMLSelectElement, models: string[], currentModel: string): void {
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

export function updateSelectedModelDisplay(): void {
    if (!selectedModelDisplay) return;

    const providerNames: Record<string, string> = {
        gemini: 'Gemini',
        openai: 'ChatGPT',
        xai: 'X-AI'
    };
    if (selectedModel.model) {
        selectedModelDisplay.textContent = `${providerNames[selectedModel.provider]} (${selectedModel.model})`;
    } else {
        selectedModelDisplay.textContent = translations["noProvider"]?.[currentLang] || 'No provider selected - Click to configure';
    }
}

export function setGeneratingState(isGenerating: boolean): void {
    if (!generateBtn) return;

    const originalText = translations["generateAI"]?.[currentLang] || 'Generate AI Post';

    if (isGenerating) {
        generateBtn.disabled = true;
        generateBtn.textContent = '🔄 Generating...';
        generateBtn.classList.add('loading');
    } else {
        generateBtn.disabled = !(selectedModel.apiKey?.trim());
        generateBtn.textContent = originalText;
        generateBtn.classList.remove('loading');
    }
}

// Function to update selectedModel
export function updateSelectedModel(newModel: SelectedModel): void {
    selectedModel = newModel;
}

// Function to update current theme
export function updateThemeVariant(newTheme: string): void {
    currentThemeVariant = newTheme;
}

// Function to update current language
export function updateCurrentLang(newLang: string): void {
    currentLang = newLang;
}

// Function to set current editing post ID
export function setCurrentEditingPostId(id: string | null): void {
    currentEditingPostId = id;
}

// Function to set original post
export function setOriginalPost(value: string): void {
    originalPost = value;
}

// DOM element initialization function
export function initializeGlobalDomElements(): void {
    // Button elements
    const generateBtnElement = document.getElementById('generateBtn') as HTMLButtonElement;
    if (generateBtnElement) generateBtn = generateBtnElement;

    const shareLinkedInBtnElement = document.getElementById('shareLinkedInBtn') as HTMLButtonElement;
    if (shareLinkedInBtnElement) shareLinkedInBtn = shareLinkedInBtnElement;

    const shareTelegramBtnElement = document.getElementById('shareTelegramBtn') as HTMLButtonElement;
    if (shareTelegramBtnElement) shareTelegramBtn = shareTelegramBtnElement;

    const selectModelBtnElement = document.getElementById('configureAIBtn') as HTMLButtonElement;
    if (selectModelBtnElement) selectModelBtn = selectModelBtnElement;

    // Post editor elements
    const postTextElement = document.getElementById('postText') as HTMLTextAreaElement;
    if (postTextElement) postText = postTextElement;

    const editPostBtnElement = document.getElementById('editPostBtn') as HTMLButtonElement;
    if (editPostBtnElement) editPostBtn = editPostBtnElement;

    const savePostBtnElement = document.getElementById('savePostBtn') as HTMLButtonElement;
    if (savePostBtnElement) savePostBtn = savePostBtnElement;

    const cancelPostBtnElement = document.getElementById('cancelPostBtn') as HTMLButtonElement;
    if (cancelPostBtnElement) cancelPostBtn = cancelPostBtnElement;

    const editControlsElement = document.getElementById('editControls') as HTMLDivElement;
    if (editControlsElement) editControls = editControlsElement;

    // Status message
    const statusMessageElement = document.getElementById('statusMessage') as HTMLDivElement;
    if (statusMessageElement) statusMessage = statusMessageElement;

    const selectedModelDisplayElement = document.getElementById('selectedAIDisplay') as HTMLDivElement;
    if (selectedModelDisplayElement) selectedModelDisplay = selectedModelDisplayElement;

    const modelModalElement = document.getElementById('modelModal') as HTMLDivElement;
    if (modelModalElement) modelModal = modelModalElement;

    const closeModalElement = document.getElementById('closeModal') as HTMLSpanElement;
    if (closeModalElement) closeModal = closeModalElement;

    const applyModelBtnElement = document.getElementById('applyModelBtn') as HTMLButtonElement;
    if (applyModelBtnElement) applyModelBtn = applyModelBtnElement;

    // Platform input elements
    const linkedinTokenElement = document.getElementById('linkedinToken') as HTMLInputElement;
    if (linkedinTokenElement) linkedinToken = linkedinTokenElement;

    const telegramBotElement = document.getElementById('telegramBot') as HTMLInputElement;
    if (telegramBotElement) telegramBot = telegramBotElement;

    const telegramChatElement = document.getElementById('telegramChat') as HTMLInputElement;
    if (telegramChatElement) telegramChat = telegramChatElement;

    const facebookTokenElement = document.getElementById('facebookToken') as HTMLInputElement;
    if (facebookTokenElement) facebookToken = facebookTokenElement;

    const facebookPageTokenElement = document.getElementById('facebookPageToken') as HTMLInputElement;
    if (facebookPageTokenElement) facebookPageToken = facebookPageTokenElement;

    const facebookPageIdElement = document.getElementById('facebookPageId') as HTMLInputElement;
    if (facebookPageIdElement) facebookPageId = facebookPageIdElement;

    const discordWebhookElement = document.getElementById('discordWebhook') as HTMLInputElement;
    if (discordWebhookElement) discordWebhook = discordWebhookElement;

    const blueskyIdentifierElement = document.getElementById('blueskyIdentifier') as HTMLInputElement;
    if (blueskyIdentifierElement) blueskyIdentifier = blueskyIdentifierElement;

    const blueskyPasswordElement = document.getElementById('blueskyPassword') as HTMLInputElement;
    if (blueskyPasswordElement) blueskyPassword = blueskyPasswordElement;

    const xAccessTokenElement = document.getElementById('xAccessToken') as HTMLInputElement;
    if (xAccessTokenElement) xAccessToken = xAccessTokenElement;

    const xAccessSecretElement = document.getElementById('xAccessSecret') as HTMLInputElement;
    if (xAccessSecretElement) xAccessSecret = xAccessSecretElement;

    const redditAccessTokenElement = document.getElementById('redditAccessToken') as HTMLInputElement;
    if (redditAccessTokenElement) redditAccessToken = redditAccessTokenElement;

    // Media attachment elements
    const mediaAttachmentElement = document.getElementById('mediaAttachment') as HTMLDivElement;
    if (mediaAttachmentElement) mediaAttachment = mediaAttachmentElement;

    const uploadAreaElement = document.getElementById('uploadArea') as HTMLDivElement;
    if (uploadAreaElement) uploadArea = uploadAreaElement;

    const uploadBtnElement = document.getElementById('uploadBtn') as HTMLButtonElement;
    if (uploadBtnElement) uploadBtn = uploadBtnElement;

    const fileInputElement = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInputElement) fileInput = fileInputElement;

    const attachedFileElement = document.getElementById('attachedFile') as HTMLDivElement;
    if (attachedFileElement) attachedFile = attachedFileElement;

    const fileNameSpanElement = document.getElementById('fileName') as HTMLSpanElement;
    if (fileNameSpanElement) fileNameSpan = fileNameSpanElement;

    const fileSizeSpanElement = document.getElementById('fileSize') as HTMLSpanElement;
    if (fileSizeSpanElement) fileSizeSpan = fileSizeSpanElement;

    const removeMediaBtnElement = document.getElementById('removeMediaBtn') as HTMLButtonElement;
    if (removeMediaBtnElement) removeMediaBtn = removeMediaBtnElement;

    // Schedule modal elements
    const scheduleBtnElement = document.getElementById('scheduleBtn') as HTMLButtonElement;
    if (scheduleBtnElement) scheduleBtn = scheduleBtnElement;

    const scheduleModalElement = document.getElementById('scheduleModal') as HTMLDivElement;
    if (scheduleModalElement) scheduleModal = scheduleModalElement;

    const closeScheduleModalElement = document.getElementById('closeScheduleModal') as HTMLSpanElement;
    if (closeScheduleModalElement) closeScheduleModal = closeScheduleModalElement;

    const scheduleDateElement = document.getElementById('scheduleDate') as HTMLInputElement;
    if (scheduleDateElement) scheduleDate = scheduleDateElement;

    const scheduleLinkedInElement = document.getElementById('scheduleLinkedIn') as HTMLInputElement;
    if (scheduleLinkedInElement) scheduleLinkedIn = scheduleLinkedInElement;

    const scheduleTelegramElement = document.getElementById('scheduleTelegram') as HTMLInputElement;
    if (scheduleTelegramElement) scheduleTelegram = scheduleTelegramElement;

    const scheduleRedditElement = document.getElementById('scheduleReddit') as HTMLInputElement;
    if (scheduleRedditElement) scheduleReddit = scheduleRedditElement;

    const scheduledPostTextElement = document.getElementById('scheduledPostText') as HTMLTextAreaElement;
    if (scheduledPostTextElement) scheduledPostText = scheduledPostTextElement;

    const scheduledMediaPreviewElement = document.getElementById('scheduledMediaPreview') as HTMLDivElement;
    if (scheduledMediaPreviewElement) scheduledMediaPreview = scheduledMediaPreviewElement;

    const cancelScheduleBtnElement = document.getElementById('cancelScheduleBtn') as HTMLButtonElement;
    if (cancelScheduleBtnElement) cancelScheduleBtn = cancelScheduleBtnElement;

    const confirmScheduleBtnElement = document.getElementById('confirmScheduleBtn') as HTMLButtonElement;
    if (confirmScheduleBtnElement) confirmScheduleBtn = confirmScheduleBtnElement;

    // Edit scheduled modal elements
    const editScheduledModalElement = document.getElementById('editScheduledModal') as HTMLDivElement;
    if (editScheduledModalElement) editScheduledModal = editScheduledModalElement;

    const closeEditScheduledModalElement = document.getElementById('closeEditScheduledModal') as HTMLSpanElement;
    if (closeEditScheduledModalElement) closeEditScheduledModal = closeEditScheduledModalElement;

    const editScheduleDateElement = document.getElementById('editScheduleDate') as HTMLInputElement;
    if (editScheduleDateElement) editScheduleDate = editScheduleDateElement;

    const editScheduleLinkedInElement = document.getElementById('editScheduleLinkedIn') as HTMLInputElement;
    if (editScheduleLinkedInElement) editScheduleLinkedIn = editScheduleLinkedInElement;

    const editScheduleTelegramElement = document.getElementById('editScheduleTelegram') as HTMLInputElement;
    if (editScheduleTelegramElement) editScheduleTelegram = editScheduleTelegramElement;

    const editScheduleRedditElement = document.getElementById('editScheduleReddit') as HTMLInputElement;
    if (editScheduleRedditElement) editScheduleReddit = editScheduleRedditElement;

    const editScheduledPostTextElement = document.getElementById('editScheduledPostText') as HTMLTextAreaElement;
    if (editScheduledPostTextElement) editScheduledPostText = editScheduledPostTextElement;

    const editScheduledMediaPreviewElement = document.getElementById('editScheduledMediaPreview') as HTMLDivElement;
    if (editScheduledMediaPreviewElement) editScheduledMediaPreview = editScheduledMediaPreviewElement;

    const cancelEditScheduledBtnElement = document.getElementById('cancelEditScheduledBtn') as HTMLButtonElement;
    if (cancelEditScheduledBtnElement) cancelEditScheduledBtn = cancelEditScheduledBtnElement;

    const saveEditScheduledBtnElement = document.getElementById('saveEditScheduledBtn') as HTMLButtonElement;
    if (saveEditScheduledBtnElement) saveEditScheduledBtn = saveEditScheduledBtnElement;

    // Scheduled posts display
    const scheduledPostsElement = document.getElementById('scheduledPosts') as HTMLDivElement;
    if (scheduledPostsElement) scheduledPosts = scheduledPostsElement;

    const scheduledListElement = document.getElementById('scheduledList') as HTMLDivElement;
    if (scheduledListElement) scheduledList = scheduledListElement;

    console.log('Global DOM elements initialized successfully');
}
