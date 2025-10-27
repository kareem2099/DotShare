// Platform-specific handlers - extracted from app.ts
import { postText, linkedinToken, telegramBot, telegramChat, showStatus } from '../core/utils';
// @ts-ignore
const vscode = acquireVsCodeApi();
export function shareSelectedPlatforms() {
    if (!postText)
        return;
    const selectedPlatforms = [];
    document.querySelectorAll('.platform-checkbox:checked').forEach(checkbox => {
        const id = checkbox.id;
        selectedPlatforms.push(id.replace('platform', '').toLowerCase());
    });
    if (selectedPlatforms.length === 0) {
        showStatus('Please select at least one platform.', 'error');
        return;
    }
    if (!postText.value.trim()) {
        showStatus('Please generate or enter a post first.', 'error');
        return;
    }
    // Share to each selected platform
    if (selectedPlatforms.includes('linkedin') && linkedinToken) {
        vscode.postMessage({ command: 'shareToLinkedIn', linkedinToken: linkedinToken.value });
        showStatus('Sharing to LinkedIn...', 'success');
    }
    if (selectedPlatforms.includes('telegram') && telegramBot && telegramChat) {
        vscode.postMessage({
            command: 'shareToTelegram',
            telegramBot: telegramBot.value,
            telegramChat: telegramChat.value
        });
        showStatus('Sharing to Telegram...', 'success');
    }
    // Note: Facebook and Discord sharing would need similar implementations
    // based on the original app-backup.ts logic
}
export function handleRedditPostManagement() {
    // Would handle Reddit post management
}
export function loadRedditPosts() {
    const redditTokenInput = document.getElementById('redditAccessToken');
    const redditRefreshInput = document.getElementById('redditRefreshToken');
    if (!redditTokenInput?.value.trim() || !redditRefreshInput?.value.trim()) {
        showStatus('Reddit tokens are required to load posts.', 'error');
        return;
    }
    vscode.postMessage({
        command: 'getRedditUserPosts',
        redditAccessToken: redditTokenInput.value,
        redditRefreshToken: redditRefreshInput.value,
        limit: 10
    });
}
export function displayRedditPosts(posts) {
    const redditPostsList = document.getElementById('redditPostsList');
    if (!posts || posts.length === 0) {
        redditPostsList.innerHTML = '<p>No Reddit posts found.</p>';
        return;
    }
    let html = '<div class="reddit-posts-container">';
    posts.forEach(post => {
        const postDate = new Date(post.created * 1000);
        const relativeTime = postDate.toLocaleString(); // Could use formatTimestamp from utils
        // Truncate title if too long
        const truncatedTitle = post.title.length > 80
            ? post.title.substring(0, 80) + '...'
            : post.title;
        html += `
            <div class="reddit-post-item" data-post-id="${post.id}">
                <div class="reddit-post-content">
                    <div class="reddit-post-header">
                        <span class="reddit-post-subreddit">r/${post.subreddit}</span>
                        <span class="reddit-post-score">↑ ${post.score}</span>
                    </div>
                    <div class="reddit-post-title">${truncatedTitle}</div>
                    <div class="reddit-post-meta">
                        <span class="reddit-post-time">${relativeTime}</span>
                        <a href="https://reddit.com${post.permalink}" target="_blank" class="reddit-post-link">🔗 View on Reddit</a>
                    </div>
                </div>
                <div class="reddit-post-actions">
                    <button class="edit-reddit-post-btn" data-post-id="${post.id}" title="Edit Post">✏️ Edit</button>
                    <button class="delete-reddit-post-btn" data-post-id="${post.id}" title="Delete Post">🗑️ Delete</button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    redditPostsList.innerHTML = html;
}
export function editRedditPost(postId) {
    const newText = prompt('Enter the new text for your Reddit post:');
    if (!newText || !newText.trim()) {
        showStatus('Post text cannot be empty.', 'error');
        return;
    }
    const redditTokenInput = document.getElementById('redditAccessToken');
    const redditRefreshInput = document.getElementById('redditRefreshToken');
    vscode.postMessage({
        command: 'editRedditPost',
        redditAccessToken: redditTokenInput?.value || '',
        redditRefreshToken: redditRefreshInput?.value || '',
        postId: postId,
        newText: newText.trim()
    });
}
export function deleteRedditPost(postId) {
    if (!confirm('Are you sure you want to delete this Reddit post? This action cannot be undone.')) {
        return;
    }
    const redditTokenInput = document.getElementById('redditAccessToken');
    const redditRefreshInput = document.getElementById('redditRefreshToken');
    vscode.postMessage({
        command: 'deleteRedditPost',
        redditAccessToken: redditTokenInput?.value || '',
        redditRefreshToken: redditRefreshInput?.value || '',
        postId: postId
    });
}
