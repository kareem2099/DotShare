// Platform-specific handlers - extracted from app.ts
import { postText, linkedinToken, telegramBot, telegramChat, facebookToken, discordWebhook, xAccessToken, xAccessSecret, redditAccessToken, blueskyIdentifier, blueskyPassword, showStatus } from '../core/utils';

// @ts-ignore
declare global {
    const vscode: any;
}

// Lazy vscode accessor to avoid undefined issues
const getVscode = () => (window as any).vscode;

export function shareSelectedPlatforms(): void {
    if (!postText) return;

    const selectedPlatforms: string[] = [];

    document.querySelectorAll('.platform-checkbox:checked').forEach(checkbox => {
        const id = (checkbox as HTMLInputElement).id;
        selectedPlatforms.push(id.replace('platform', '').toLowerCase());
    });

    if (selectedPlatforms.length === 0) {
        showStatus('Please select at least one platform.', 'error');
        return;
    }

    if (!postText.value.trim()) {
        showStatus('Please enter a post first.', 'error');
        return;
    }

    // Create the current post data with text and attached media
    const postData = {
        text: postText.value.trim(),
        mediaFilePaths: getAttachedMediaPaths() // Get any attached media files
    };

    // Share to each selected platform with post data
    if (selectedPlatforms.includes('linkedin') && linkedinToken) {
        getVscode()?.postMessage({
            command: 'shareToLinkedIn',
            linkedinToken: linkedinToken.value,
            post: postData.text,
            mediaFilePaths: postData.mediaFilePaths
        });
        showStatus('Sharing to LinkedIn...', 'success');
    }

    if (selectedPlatforms.includes('telegram') && telegramBot && telegramChat) {
        getVscode()?.postMessage({
            command: 'shareToTelegram',
            telegramBot: telegramBot.value,
            telegramChat: telegramChat.value,
            post: postData.text,
            mediaFilePaths: postData.mediaFilePaths
        });
        showStatus('Sharing to Telegram...', 'success');
    }

    if (selectedPlatforms.includes('facebook') && facebookToken) {
        getVscode()?.postMessage({
            command: 'shareToFacebook',
            facebookToken: facebookToken.value,
            post: postData.text,
            mediaFilePaths: postData.mediaFilePaths
        });
        showStatus('Sharing to Facebook...', 'success');
    }

    if (selectedPlatforms.includes('discord') && discordWebhook) {
        getVscode()?.postMessage({
            command: 'shareToDiscord',
            discordWebhook: discordWebhook.value,
            post: postData.text,
            mediaFilePaths: postData.mediaFilePaths
        });
        showStatus('Sharing to Discord...', 'success');
    }

    if (selectedPlatforms.includes('x') && xAccessToken && xAccessSecret) {
        getVscode()?.postMessage({
            command: 'shareToX',
            xAccessToken: xAccessToken.value,
            xAccessSecret: xAccessSecret.value,
            post: postData.text,
            mediaFilePaths: postData.mediaFilePaths
        });
        showStatus('Sharing to X/Twitter...', 'success');
    }

    if (selectedPlatforms.includes('reddit') && redditAccessToken) {
        // Get subreddit from the inline input field
        const redditPostSubreddit = document.getElementById('redditPostSubreddit') as HTMLInputElement;
        const subredditPrefix = redditPostSubreddit?.previousElementSibling?.textContent || 'r/';

        const subredditName = redditPostSubreddit?.value.trim();

        if (!subredditName) {
            showStatus('Please enter a Reddit community in the Platforms tab.', 'error');
            return;
        }

        // Construct the full target (e.g., r/programming or u/username)
        const target = subredditPrefix + subredditName;

        // Share directly to Reddit with the specified subreddit or user profile
        getVscode()?.postMessage({
            command: 'shareToReddit',
            redditAccessToken: redditAccessToken.value,
            redditRefreshToken: (document.getElementById('redditRefreshToken') as HTMLInputElement)?.value || '',
            redditSubreddit: target,
            title: postData.text.substring(0, 100), // First 100 chars as title
            text: postData.text,
            postType: 'self', // Text post by default
            flairId: undefined,
            spoiler: false,
            mediaFilePaths: postData.mediaFilePaths
        });

        showStatus('Sharing to Reddit...', 'success');
    }

    if (selectedPlatforms.includes('bluesky') && blueskyIdentifier && blueskyPassword) {
        getVscode()?.postMessage({
            command: 'shareToBlueSky',
            blueskyIdentifier: blueskyIdentifier.value,
            blueskyPassword: blueskyPassword.value,
            post: postData.text,
            mediaFilePaths: postData.mediaFilePaths
        });
        showStatus('Sharing to BlueSky...', 'success');
    }
}

// Helper function to get attached media paths from media attachments
function getAttachedMediaPaths(): string[] {
    // Import the media attachment variables
    const { attachedMediaPath } = require('../management/media-attachments') as { attachedMediaPath: string | null };
    return attachedMediaPath ? [attachedMediaPath] : [];
}

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

export function displayRedditPosts(posts: any[]): void {
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
