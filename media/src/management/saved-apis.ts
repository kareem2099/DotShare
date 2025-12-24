// Saved API configuration management functions - extracted from app.ts
import { ApiConfiguration, AccountOption } from '../../../src/types';
import { showStatus } from '../core/utils';


declare global {
    const vscode: { postMessage: (message: Record<string, unknown>) => void };
}

// Lazy vscode accessor to avoid undefined issues
const getVscode = () => (window as { vscode?: { postMessage: (message: Record<string, unknown>) => void } }).vscode;

// Global variable to track current platform being managed
export const currentSavedApisPlatform = '';

export function loadSavedApis(platform: string): void {
    getVscode()?.postMessage({ command: 'loadSavedApis', platform });
}

export function loadSavedApisForPlatform(platform: string): void {
    getVscode()?.postMessage({ command: 'loadSavedApis', platform });
}

export function loadSavedApisForAllPlatforms(): void {
    // Load saved APIs for all platforms and populate account selectors
    const platforms = ['linkedin', 'telegram', 'x', 'facebook', 'discord', 'reddit', 'bluesky'];

    platforms.forEach(platform => {
        getVscode()?.postMessage({ command: 'loadSavedApis', platform });
    });
}

export function populateAccountDropdown(platform: string, accounts: AccountOption[]): void {
    const selector = document.getElementById(`accountSelector_${platform}`) as HTMLElement;
    const select = document.getElementById(`accountSelect_${platform}`) as HTMLSelectElement;

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
    } else {
        // Hide if no accounts
        selector.style.display = 'none';
    }

    // Add change event listener
    select.addEventListener('change', (e) => {
        const selectedId = (e.target as HTMLSelectElement).value;
        if (selectedId) {
            loadApiConfiguration(selectedId);
        }
    });
}

export function loadApiConfiguration(apiId: string): void {
    getVscode()?.postMessage({ command: 'loadApiConfiguration', apiId });
    // Modal will be closed by the caller
    showStatus('API configuration loaded successfully!', 'success');
}

export function setDefaultApiConfiguration(apiId: string): void {
    getVscode()?.postMessage({
        command: 'setDefaultApiConfiguration',
        platform: currentSavedApisPlatform,
        apiId
    });
}

export function deleteApiConfiguration(apiId: string): void {
    if (confirm('Are you sure you want to delete this API configuration?')) {
        getVscode()?.postMessage({ command: 'deleteApiConfiguration', apiId });
        loadSavedApis(currentSavedApisPlatform);
        showStatus('API configuration deleted.', 'success');
    }
}

export function getCredentialPreview(apiConfig: ApiConfiguration): string {
    const previews: string[] = [];

    Object.entries(apiConfig.credentials).forEach(([key, value]) => {
        if (value && value.trim()) {
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
