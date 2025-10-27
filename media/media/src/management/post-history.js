import { currentLang, translations, updateTexts } from '../core/translations';
// import { showStatus, formatTimestamp, getProviderEmoji, getStatusEmoji } from '../../core/utils';
// import { translations, currentLang, updateTexts } from '../../core/translations';
import { formatTimestamp, getProviderEmoji, getStatusEmoji } from '../core/utils';
// DOM elements that should be in utils.ts or ui-initialization.ts
let postHistory = null;
let historyList = null;
let totalPostsValue = null;
let successRateValue = null;
let linkedinSharesValue = null;
let telegramSharesValue = null;
let facebookSharesValue = null;
let discordSharesValue = null;
let blueskySharesValue = null;
let redditSharesValue = null;
// Initialize DOM elements (would be called from ui-initialization.ts)
export function initializePostHistoryElements() {
    postHistory = document.getElementById('postHistory');
    historyList = document.getElementById('historyList');
    totalPostsValue = document.getElementById('totalPostsValue');
    successRateValue = document.getElementById('successRateValue');
    linkedinSharesValue = document.getElementById('linkedinSharesValue');
    telegramSharesValue = document.getElementById('telegramSharesValue');
    facebookSharesValue = document.getElementById('facebookSharesValue');
    discordSharesValue = document.getElementById('discordSharesValue');
    blueskySharesValue = document.getElementById('blueskySharesValue');
    redditSharesValue = document.getElementById('redditSharesValue');
}
export function updatePostHistory(history) {
    if (history.length === 0) {
        historyList.innerHTML = `<p data-key="noHistory">${translations["noHistory"]?.[currentLang] || 'No posts in history yet. Generate your first post!'}</p>`;
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
    historyList.innerHTML = `<div class="history-items">${html}</div>`;
    updateTexts(); // Update any localized text
}
export function updateAnalytics(analytics) {
    totalPostsValue.textContent = analytics.totalPosts.toString();
    successRateValue.textContent = `${analytics.successRate}%`;
    linkedinSharesValue.textContent = analytics.linkedinShares.toString();
    telegramSharesValue.textContent = analytics.telegramShares.toString();
    // Update additional analytics values
    if (facebookSharesValue)
        facebookSharesValue.textContent = '0'; // Will be updated when analytics are properly calculated
    if (discordSharesValue)
        discordSharesValue.textContent = '0';
    if (blueskySharesValue)
        blueskySharesValue.textContent = '0';
    if (redditSharesValue)
        redditSharesValue.textContent = analytics.redditShares?.toString() || '0';
}
export function showPostHistory() {
    if (postHistory)
        postHistory.style.display = 'block';
}
export function loadHistoryAndAnalytics() {
    vscode.postMessage({ command: 'loadPostHistory' });
    vscode.postMessage({ command: 'loadAnalytics' });
}
let vscode = window.acquireVsCodeApi();
