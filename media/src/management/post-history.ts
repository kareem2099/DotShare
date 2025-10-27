import { HistoricalPost, AnalyticsSummary } from '../../../src/types';
import { translations, updateTexts } from '../core/translations';
import { currentLang } from '../core/utils';
// import { showStatus, formatTimestamp, getProviderEmoji, getStatusEmoji } from '../../core/utils';
// import { translations, currentLang, updateTexts } from '../../core/translations';
import { formatTimestamp, getProviderEmoji, getStatusEmoji } from '../core/utils';

// Lazy vscode accessor to avoid import-time undefined issues
const getVscode = () => (window as any).vscode;

// DOM elements that should be in utils.ts or ui-initialization.ts
let postHistory: HTMLElement | null = null;
let historyList: HTMLElement | null = null;
let totalPostsValue: HTMLElement | null = null;
let successRateValue: HTMLElement | null = null;
let linkedinSharesValue: HTMLElement | null = null;
let telegramSharesValue: HTMLElement | null = null;
let facebookSharesValue: HTMLElement | null = null;
let discordSharesValue: HTMLElement | null = null;
let blueskySharesValue: HTMLElement | null = null;
let redditSharesValue: HTMLElement | null = null;

// Initialize DOM elements (would be called from ui-initialization.ts)
export function initializePostHistoryElements(): void {
    postHistory = document.getElementById('postHistory') as HTMLElement;
    historyList = document.getElementById('historyList') as HTMLElement;
    totalPostsValue = document.getElementById('totalPostsValue') as HTMLElement;
    successRateValue = document.getElementById('successRateValue') as HTMLElement;
    linkedinSharesValue = document.getElementById('linkedinSharesValue') as HTMLElement;
    telegramSharesValue = document.getElementById('telegramSharesValue') as HTMLElement;
    facebookSharesValue = document.getElementById('facebookSharesValue') as HTMLElement;
    discordSharesValue = document.getElementById('discordSharesValue') as HTMLElement;
    blueskySharesValue = document.getElementById('blueskySharesValue') as HTMLElement;
    redditSharesValue = document.getElementById('redditSharesValue') as HTMLElement;
}

export function updatePostHistory(history: HistoricalPost[]): void {
    if (history.length === 0) {
        historyList!.innerHTML = `<p data-key="noHistory">${translations["noHistory"]?.[currentLang] || 'No posts in history yet. Generate your first post!'}</p>`;
        return;
    }

    let html = '';

    // Sort by most recent first and take only last 10 for display
    const recentHistory = history.slice(0, 10);

    for (const post of recentHistory) {
        const truncatedText = post.postData.text.length > 100
            ? post.postData.text.substring(0, 100) + '...'
            : post.postData.text;

        const linkedinShare = post.shares.find(s => s.platform === 'linkedin');
        const telegramShare = post.shares.find(s => s.platform === 'telegram');

        const linkedinStatus = linkedinShare ? getStatusEmoji(linkedinShare.success) : '';
        const telegramStatus = telegramShare ? getStatusEmoji(telegramShare.success) : '';

        html += `
            <div class="history-item" data-post-id="${post.id}">
                <div class="history-header">
                    <span class="history-time">${getProviderEmoji(post.aiProvider)} ${formatTimestamp(post.timestamp)}</span>
                    <div class="share-status">
                        ${linkedinStatus} ${telegramStatus}
                    </div>
                </div>
                <div class="history-content">
                    <div class="history-text">${truncatedText}</div>
                    ${post.postData.media ? '<div class="history-media">📎 Media attached</div>' : ''}
                </div>
                <div class="history-footer">
                    <span class="history-model">${post.aiProvider} ${post.aiModel}</span>
                </div>
            </div>
        `;
    }

    historyList!.innerHTML = `<div class="history-items">${html}</div>`;
    updateTexts(); // Update any localized text
}

export function updateAnalytics(analytics: AnalyticsSummary): void {
    totalPostsValue!.textContent = analytics.totalPosts.toString();
    successRateValue!.textContent = `${analytics.successRate}%`;
    linkedinSharesValue!.textContent = analytics.linkedinShares.toString();
    telegramSharesValue!.textContent = analytics.telegramShares.toString();
    // Update additional analytics values
    if (facebookSharesValue) facebookSharesValue.textContent = '0'; // Will be updated when analytics are properly calculated
    if (discordSharesValue) discordSharesValue.textContent = '0';
    if (blueskySharesValue) blueskySharesValue.textContent = '0';
    if (redditSharesValue) redditSharesValue.textContent = analytics.redditShares?.toString() || '0';
}

export function showPostHistory(): void {
    if (postHistory) postHistory.style.display = 'block';
}

let vscode = (window as any).vscode;

export function loadHistoryAndAnalytics(): void {
    getVscode()?.postMessage({ command: 'loadPostHistory' });
    getVscode()?.postMessage({ command: 'loadAnalytics' });
}
