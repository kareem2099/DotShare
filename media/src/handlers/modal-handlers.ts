// Modal management functions - extracted from app.ts
// @ts-ignore
const getVscode = () => (window as any).vscode;

import { Message, SelectedModel } from '../../../src/types';
import { showStatus, setGeneratingState, selectedModel, updateSelectedModelDisplay, updateButtonStates, updateSelectedModel, populateModelDropdown } from '../core/utils';

// Modal elements - for AI model selection modal
const providerTabBtns = document.querySelectorAll('.tab-btn');
const providerPanels = document.querySelectorAll('.provider-panel');
const geminiKeyModal = document.getElementById('geminiKeyModal') as HTMLInputElement | null;
const geminiModelSelect = document.getElementById('geminiModel') as HTMLSelectElement | null;
const openaiKeyInput = document.getElementById('openaiKey') as HTMLInputElement | null;
const openaiModelSelect = document.getElementById('openaiModel') as HTMLSelectElement | null;
const xaiKeyInput = document.getElementById('xaiKey') as HTMLInputElement | null;
const xaiModelSelect = document.getElementById('xaiModel') as HTMLSelectElement | null;

// AI Model Modal functions
export function openModal(): void {
    if (!geminiKeyModal || !geminiModelSelect || !openaiKeyInput || !openaiModelSelect || !xaiKeyInput || !xaiModelSelect || !selectedModel) return;

    // Pre-fill modal with current values
    geminiKeyModal.value = selectedModel.provider === 'gemini' ? (selectedModel.apiKey || '') : '';
    geminiModelSelect.value = selectedModel.provider === 'gemini' ? selectedModel.model : '';
    openaiKeyInput.value = selectedModel.provider === 'openai' ? (selectedModel.apiKey || '') : '';
    openaiModelSelect.value = selectedModel.provider === 'openai' ? selectedModel.model : '';
    xaiKeyInput.value = selectedModel.provider === 'xai' ? (selectedModel.apiKey || '') : '';
    xaiModelSelect.value = selectedModel.provider === 'xai' ? selectedModel.model : '';

    // Request models for all providers when modal opens, using their respective keys if available
    getVscode().postMessage({ command: 'fetchModels', provider: 'gemini', apiKey: geminiKeyModal.value });
    getVscode().postMessage({ command: 'fetchModels', provider: 'openai', apiKey: openaiKeyInput.value });
    getVscode().postMessage({ command: 'fetchModels', provider: 'xai', apiKey: xaiKeyInput.value });

    const modelModal = document.getElementById('modelModal') as HTMLDivElement;
    if (modelModal) modelModal.style.display = 'flex';
}

export function closeModalFunc(): void {
    const modelModal = document.getElementById('modelModal') as HTMLDivElement;
    if (!modelModal) return;
    modelModal.style.display = 'none';
}

export function switchProviderTab(provider: string): void {
    if (!providerTabBtns || !providerPanels) return;

    providerTabBtns.forEach(btn => btn.classList.remove('active'));
    providerPanels.forEach(panel => panel.classList.remove('active'));

    const activeTab = document.querySelector(`[data-provider="${provider}"]`) as HTMLElement;
    const activePanel = document.getElementById(`${provider}Panel`) as HTMLElement;

    if (activeTab) activeTab.classList.add('active');
    if (activePanel) activePanel.classList.add('active');
}

export function applyModel(): void {
    if (!selectedModel) return;

    const activeProvider = document.querySelector('.tab-btn.active')?.getAttribute('data-provider');

    let apiKey = '';
    let model = '';

    if (activeProvider === 'gemini') {
        apiKey = geminiKeyModal?.value.trim() || '';
        model = geminiModelSelect?.value || '';
    } else if (activeProvider === 'openai') {
        apiKey = openaiKeyInput?.value.trim() || '';
        model = openaiModelSelect?.value || '';
    } else if (activeProvider === 'xai') {
        apiKey = xaiKeyInput?.value.trim() || '';
        model = xaiModelSelect?.value || '';
    }

    // Basic validation
    if (!apiKey) {
        showStatus('API Key is required.', 'error');
        return;
    }
    if (apiKey.length < 10) {
        showStatus('API Key appears too short. Please check.', 'error');
        return;
    }

    const newModel: SelectedModel = {
        provider: activeProvider as 'gemini' | 'openai' | 'xai',
        model,
        apiKey
    };

    updateSelectedModel(newModel);
    updateSelectedModelDisplay();
    // updateButtonStates(); // This would need to be imported or called
    closeModalFunc();
    showStatus('AI model updated successfully!', 'success');

    // Save to VS Code settings
    getVscode().postMessage({
        command: 'saveModelSelection',
        selectedModel
    });
}

export function handleModelUpdate(message: { provider?: string; geminiModels?: string[]; openaiModels?: string[]; xaiModels?: string[] }): void {
    if (message.provider === 'gemini' && message.geminiModels) {
        const geminiModelSelect = document.getElementById('geminiModel') as HTMLSelectElement | null;
        if (geminiModelSelect) {
            populateModelDropdown(geminiModelSelect, message.geminiModels, selectedModel.model);
        }
    } else if (message.provider === 'openai' && message.openaiModels) {
        const openaiModelSelect = document.getElementById('openaiModel') as HTMLSelectElement | null;
        if (openaiModelSelect) {
            populateModelDropdown(openaiModelSelect, message.openaiModels, selectedModel.model);
        }
    } else if (message.provider === 'xai' && message.xaiModels) {
        const xaiModelSelect = document.getElementById('xaiModel') as HTMLSelectElement | null;
        if (xaiModelSelect) {
            populateModelDropdown(xaiModelSelect, message.xaiModels, selectedModel.model);
        }
    }
}

// Schedule Modal functions
export function openScheduleModal(): void {
    // Would show schedule modal
}

export function closeScheduleModalFunc(): void {
    // Would close schedule modal
}

export function schedulePost(): void {
    // Would handle scheduling a post
}

// Edit Schedule Modal functions
export function editScheduledPost(postId: string): void {
    // Would open edit modal for scheduled post
}

export function saveEditedScheduledPost(): void {
    // Would save edited scheduled post
}

export function closeEditScheduledModalFunc(): void {
    // Would close edit scheduled modal
}

// Reddit Post Modal functions
export function openRedditPostModal(): void {
    // Would show Reddit post modal
}

export function closeRedditPostModalFunc(): void {
    // Would close Reddit post modal
}

export function shareToRedditWithSettings(): void {
    // Would share to Reddit with settings
}

// Saved APIs Modal functions
let currentSavedApisPlatform: string = '';

export function openSavedApisModal(platform: string): void {
    currentSavedApisPlatform = platform;

    const platformConfigs = {
        linkedin: 'LinkedIn',
        telegram: 'Telegram',
        x: 'X/Twitter',
        facebook: 'Facebook',
        discord: 'Discord',
        reddit: 'Reddit',
        bluesky: 'BlueSky'
    };

    // Update modal header
    const headerSpan = document.getElementById('currentPlatformName') as HTMLSpanElement;
    if (headerSpan) headerSpan.textContent = platformConfigs[platform as keyof typeof platformConfigs] || platform;

    // Load saved APIs for this platform
    getVscode().postMessage({ command: 'loadSavedApis', platform });

    // Show modal
    const savedApisModal = document.getElementById('savedApisModal') as HTMLDivElement;
    if (savedApisModal) {
        savedApisModal.style.display = 'flex';
    }
}

export function closeSavedApisModal(): void {
    currentSavedApisPlatform = '';
    const savedApisModal = document.getElementById('savedApisModal') as HTMLDivElement;
    if (savedApisModal) {
        savedApisModal.style.display = 'none';
    }
    hideEditForm();
}

export function displaySavedApis(savedApis: any[]): void {
    const savedApisList = document.getElementById('savedApisList') as HTMLDivElement;

    if (savedApis.length === 0) {
        savedApisList.innerHTML = `
            <div class="no-saved-apis">
                <p>No saved API configurations yet.</p>
                <p>Click "Add New" to save your first API set.</p>
            </div>
        `;
        return;
    }

    let html = '';
    savedApis.forEach(apiConfig => {
        const lastUsed = apiConfig.lastUsed ?
            new Date(apiConfig.lastUsed).toLocaleDateString() :
            'Never used';

        const isDefault = apiConfig.isDefault === true;
        const defaultBadge = isDefault ? '<span class="default-badge">⭐ Default</span>' : '';
        const defaultIndicator = isDefault ? ' (Auto-fill on startup)' : '';

        // Show a preview of the credentials (masked for security)
        const previewCredentials = getCredentialPreview(apiConfig);

        html += `
            <div class="saved-api-item ${isDefault ? 'default-config' : ''}" data-api-id="${apiConfig.id}">
                <div class="saved-api-info">
                    <div class="saved-api-name">
                        ${apiConfig.name}${defaultIndicator}
                        ${defaultBadge}
                    </div>
                    <div class="saved-api-preview">${previewCredentials}</div>
                    <div class="saved-api-last-used">Last used: ${lastUsed}</div>
                </div>
                <div class="saved-api-actions">
                    <button class="load-api-btn" data-api-id="${apiConfig.id}" title="Load this configuration">📂 Load</button>
                    ${!isDefault ? `<button class="set-default-btn" data-api-id="${apiConfig.id}" title="Set as default for auto-fill">⭐ Set Default</button>` : ''}
                    <button class="delete-api-btn" data-api-id="${apiConfig.id}" title="Delete this configuration">🗑️ Delete</button>
                </div>
            </div>
        `;
    });

    savedApisList.innerHTML = html;

    // Add event listeners for buttons
    document.querySelectorAll('.load-api-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const apiId = (e.target as HTMLElement).getAttribute('data-api-id');
            if (apiId) loadApiConfiguration(apiId);
        });
    });

    document.querySelectorAll('.set-default-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const apiId = (e.target as HTMLElement).getAttribute('data-api-id');
            if (apiId) setDefaultApiConfiguration(apiId, currentSavedApisPlatform);
        });
    });

    document.querySelectorAll('.delete-api-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const apiId = (e.target as HTMLElement).getAttribute('data-api-id');
            if (apiId) deleteApiConfiguration(apiId);
        });
    });
}

export function hideEditForm(): void {
    const editApiForm = document.getElementById('editApiForm') as HTMLDivElement;
    if (editApiForm) {
        editApiForm.style.display = 'none';
    }
    const apiSetNameInput = document.getElementById('apiSetName') as HTMLInputElement;
    if (apiSetNameInput) {
        apiSetNameInput.value = '';
    }
    const apiFieldsContainer = document.getElementById('apiFields') as HTMLDivElement;
    if (apiFieldsContainer) {
        apiFieldsContainer.innerHTML = '';
    }
}

export function showEditForm(isEditing?: boolean, apiConfig?: any): void {
    const editApiForm = document.getElementById('editApiForm') as HTMLDivElement;
    if (editApiForm) {
        editApiForm.style.display = 'block';
    }

    const platformConfig = getPlatformConfig(currentSavedApisPlatform);
    if (!platformConfig) {
        showStatus('Unknown platform.', 'error');
        return;
    }

    // Set form title
    const formTitle = document.getElementById('formTitle') as HTMLHeadingElement;
    if (formTitle) {
        formTitle.textContent = isEditing ? 'Edit API Configuration' : 'Add New API Configuration';
    }

    // Set configuration name
    const apiSetNameInput = document.getElementById('apiSetName') as HTMLInputElement;
    if (apiSetNameInput) {
        apiSetNameInput.value = isEditing && apiConfig ? apiConfig.name : '';
    }

    // Generate form fields
    const apiFieldsContainer = document.getElementById('apiFields') as HTMLDivElement;
    if (apiFieldsContainer) {
        apiFieldsContainer.innerHTML = '';
        platformConfig.fields.forEach(field => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'input-group';

            const label = document.createElement('label');
            label.setAttribute('for', field.key);
            label.textContent = field.label;
            fieldDiv.appendChild(label);

            const input = document.createElement('input');
            input.type = field.type;
            input.id = field.key;
            input.placeholder = field.placeholder || '';

            // Pre-fill if editing
            if (isEditing && apiConfig && apiConfig.credentials[field.key]) {
                input.value = apiConfig.credentials[field.key];
            }

            fieldDiv.appendChild(input);
            apiFieldsContainer.appendChild(fieldDiv);
        });
    }
}

export function saveApiConfiguration(): void {
    const apiSetNameInput = document.getElementById('apiSetName') as HTMLInputElement;
    const name = apiSetNameInput?.value.trim();
    if (!name) {
        showStatus('Please enter a configuration name.', 'error');
        return;
    }

    const platformConfig = getPlatformConfig(currentSavedApisPlatform);
    if (!platformConfig) {
        showStatus('Unknown platform.', 'error');
        return;
    }

    const credentials: { [key: string]: string } = {};

    // Validate and collect all required fields
    let hasErrors = false;
    platformConfig.fields.forEach(field => {
        const input = document.getElementById(field.key) as HTMLInputElement;
        if (input) {
            credentials[field.key] = input.value.trim();

            // Basic validation - some fields are required
            if (!input.value.trim() && !field.label.includes('Optional') && field.key !== 'facebookPageToken' && field.key !== 'facebookPageId') {
                showStatus(`${field.label} is required.`, 'error');
                hasErrors = true;
                return;
            }
        }
    });

    if (hasErrors) return;

    const apiConfig = {
        id: '', // Will be set by extension
        name,
        platform: currentSavedApisPlatform,
        credentials,
        created: new Date().toISOString()
    };

    getVscode().postMessage({ command: 'saveApiConfiguration', apiConfig });
    hideEditForm();
    showStatus('API configuration saved successfully!', 'success');
}

// Helper function to get platform configs (from original app.ts)
function getPlatformConfig(platform: string) {
    const platformConfigs: { [key: string]: { name: string; fields: { key: string; label: string; type: string; placeholder?: string }[] } } = {
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
                { key: 'blueskyPassword', label: 'App Password', type: 'password', placeholder: 'Enter your Side your BlueSky app password' }
            ]
        }
    };

    return platformConfigs[platform];
}

// Helper functions for saved APIs management (from saved-apis.ts)
export function loadApiConfiguration(apiId: string): void {
    getVscode().postMessage({ command: 'loadApiConfiguration', apiId });
    closeSavedApisModal();
}

export function setDefaultApiConfiguration(apiId: string, platform: string): void {
    getVscode().postMessage({
        command: 'setDefaultApiConfiguration',
        platform,
        apiId
    });
}

export function deleteApiConfiguration(apiId: string): void {
    if (confirm('Are you sure you want to delete this API configuration?')) {
        getVscode().postMessage({ command: 'deleteApiConfiguration', apiId });
    }
}

function getCredentialPreview(apiConfig: any): string {
    const previews: string[] = [];

    Object.entries(apiConfig.credentials).forEach(([key, value]) => {
        if (value && typeof value === 'string' && value.trim()) {
            // Mask sensitive values
            if (key.toLowerCase().includes('token') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('password')) {
                previews.push(`${key}: ${'*'.repeat(Math.min(value.length, 10))}...`);
            } else {
                previews.push(`${key}: ${value.substring(0, 20)}${value.length > 20 ? '...' : ''}`);
            }
        }
    });

    return previews.slice(0, 2).join(', ') + (previews.length > 2 ? ` +${previews.length - 2} more` : '');
}
