// Platform-specific handlers - extracted from app.ts
import { showStatus } from '../core/utils';
import { RedditPost } from '../../../src/types';

// Lazy vscode accessor to avoid undefined issues
const getVscode = () => (window as { vscode: { postMessage: (message: Record<string, unknown>) => void } | undefined }).vscode;

export function handleRedditPostManagement(): void {
    // Would handle Reddit post management
}

export function loadRedditPosts(): void {
    const redditTokenInput = document.getElementById('redditAccessToken') as HTMLInputElement;
    const redditRefreshInput = document.getElementById('redditRefreshToken') as HTMLInputElement;

    if (!redditTokenInput?.value.trim() || !redditRefreshInput?.value.trim()) {
        showStatus('Reddit tokens are required to load posts.', 'error');
        return;
    }

    getVscode()?.postMessage({
        command: 'getRedditUserPosts',
        redditAccessToken: redditTokenInput.value,
        redditRefreshToken: redditRefreshInput.value,
        limit: 10
    });
}

export function displayRedditPosts(posts: RedditPost[]): void {
    const redditPostsList = document.getElementById('redditPostsList') as HTMLElement;

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

export function editRedditPost(postId: string): void {
    const newText = prompt('Enter the new text for your Reddit post:');
    if (!newText || !newText.trim()) {
        showStatus('Post text cannot be empty.', 'error');
        return;
    }

    const redditTokenInput = document.getElementById('redditAccessToken') as HTMLInputElement;
    const redditRefreshInput = document.getElementById('redditRefreshToken') as HTMLInputElement;

    getVscode()?.postMessage({
        command: 'editRedditPost',
        redditAccessToken: redditTokenInput?.value || '',
        redditRefreshToken: redditRefreshInput?.value || '',
        postId: postId,
        newText: newText.trim()
    });
}

export function deleteRedditPost(postId: string): void {
    if (!confirm('Are you sure you want to delete this Reddit post? This action cannot be undone.')) {
        return;
    }

    const redditTokenInput = document.getElementById('redditAccessToken') as HTMLInputElement;
    const redditRefreshInput = document.getElementById('redditRefreshToken') as HTMLInputElement;

    getVscode()?.postMessage({
        command: 'deleteRedditPost',
        redditAccessToken: redditTokenInput?.value || '',
        redditRefreshToken: redditRefreshInput?.value || '',
        postId: postId
    });
}
