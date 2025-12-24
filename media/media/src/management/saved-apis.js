import { showStatus } from '../core/utils';

const vscode = acquireVsCodeApi();
// Global variable to track current platform being managed
export let currentSavedApisPlatform = '';
export function loadSavedApis(platform) {
    vscode.postMessage({ command: 'loadSavedApis', platform });
}
export function loadSavedApisForPlatform(platform) {
    vscode.postMessage({ command: 'loadSavedApis', platform });
}
export function loadSavedApisForAllPlatforms() {
    // Load saved APIs for all platforms and populate account selectors
    const platforms = ['linkedin', 'telegram', 'x', 'facebook', 'discord', 'reddit', 'bluesky'];
    platforms.forEach(platform => {
        vscode.postMessage({ command: 'loadSavedApis', platform });
    });
}
export function populateAccountDropdown(platform, accounts) {
    const selector = document.getElementById(`accountSelector_${platform}`);
    const select = document.getElementById(`accountSelect_${platform}`);
    if (!selector || !select) {
        console.error(`Account selector elements not found for platform: ${platform}`);
        return;
    }
    // Clear existing options except the placeholder
    select.innerHTML = '<option value="">No saved accounts</option>';
    if (accounts.length > 0) {
        // Add saved accounts
        accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = `${account.name}${account.isDefault ? ' (Default)' : ''}`;
            if (account.lastUsed) {
                option.title = `Last used: ${new Date(account.lastUsed).toLocaleDateString()}`;
            }
            select.appendChild(option);
        });
        // Show the selector
        selector.style.display = 'block';
    }
    else {
        // Hide if no accounts
        selector.style.display = 'none';
    }
    // Add change event listener
    select.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        if (selectedId) {
            loadApiConfiguration(selectedId);
        }
    });
}
export function loadApiConfiguration(apiId) {
    vscode.postMessage({ command: 'loadApiConfiguration', apiId });
    // Modal will be closed by the caller
    showStatus('API configuration loaded successfully!', 'success');
}
export function setDefaultApiConfiguration(apiId) {
    vscode.postMessage({
        command: 'setDefaultApiConfiguration',
        platform: currentSavedApisPlatform,
        apiId
    });
}
export function deleteApiConfiguration(apiId) {
    if (confirm('Are you sure you want to delete this API configuration?')) {
        vscode.postMessage({ command: 'deleteApiConfiguration', apiId });
        loadSavedApis(currentSavedApisPlatform);
        showStatus('API configuration deleted.', 'success');
    }
}
export function getCredentialPreview(apiConfig) {
    const previews = [];
    Object.entries(apiConfig.credentials).forEach(([key, value]) => {
        if (value && value.trim()) {
            // Mask sensitive values
            if (key.toLowerCase().includes('token') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('password')) {
                previews.push(`${key}: ${'*'.repeat(Math.min(value.length, 10))}...`);
            }
            else {
                previews.push(`${key}: ${value.substring(0, 20)}${value.length > 20 ? '...' : ''}`);
            }
        }
    });
    return previews.slice(0, 2).join(', ') + (previews.length > 2 ? ` +${previews.length - 2} more` : '');
}
