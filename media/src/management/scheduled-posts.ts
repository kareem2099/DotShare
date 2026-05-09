// Scheduled posts management functions - extracted from app.ts
import { ScheduledPost } from '../../../src/types';
import { showStatus, getScheduledStatusBadge, scheduledList, scheduledPosts, currentEditingPostId, editScheduleDate, editScheduleLinkedIn, editScheduleTelegram, editScheduleReddit, editScheduledPostText, editScheduledMediaPreview, editScheduledModal, linkedinToken, telegramBot, telegramChat, setCurrentEditingPostId } from '../core/utils';
import { translations } from '../core/translations';
import { currentLang } from '../core/utils';


// Lazy vscode accessor to avoid undefined issues
const getVscode = () => (window as { vscode?: { postMessage: (message: Record<string, unknown>) => void } }).vscode;

export function updateScheduledPosts(scheduledPostsArray: ScheduledPost[]): void {
    if (!scheduledList) return;

    if (!scheduledPostsArray || scheduledPostsArray.length === 0) {
        scheduledList.innerHTML = `<p data-key="noScheduled">${translations["noScheduled"]?.[currentLang] || 'No scheduled posts yet. Schedule your first post!'}</p>`;
        return;
    }

    let html = '';

    // Sort by scheduled time (earliest first)
    const sortedPosts = [...scheduledPostsArray].sort((a, b) =>
        new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
    );

    for (const post of sortedPosts) {
        const scheduledDate = new Date(post.scheduledTime);
        const now = new Date();
        const isPast = scheduledDate < now;

        const timeStr = isPast ?
            `Past due: ${scheduledDate.toLocaleString()}` :
            `Scheduled: ${scheduledDate.toLocaleString()}`;

        const statusBadge = getScheduledStatusBadge(post.status);

        const platformIcons = post.platforms.map((p: string) => p === 'linkedin' ? '💼' : '📱').join(' ');

        // Add scheduling type indicator
        const schedulingIcon = post.schedulingType === 'server' ? '☁️' : '💻';

        const truncatedText = post.postData.text.length > 80
            ? post.postData.text.substring(0, 80) + '...'
            : post.postData.text;

        html += `
            <div class="scheduled-item ${post.status}" data-post-id="${post.id}">
                <div class="scheduled-header">
                    <span class="scheduled-time">${schedulingIcon} ${platformIcons} ${timeStr}</span>
                    <span class="scheduled-status">${statusBadge}</span>
                </div>
                <div class="scheduled-content">
                    <div class="scheduled-text">${truncatedText}</div>
                    ${post.postData.media ? '<div class="scheduled-media">📎 Media attached</div>' : ''}
                </div>
                <div class="scheduled-actions">
                    <button class="cancel-scheduled-btn" data-post-id="${post.id}" title="Cancel Post">❌ Cancel</button>
                </div>
            </div>
        `;
    }

    scheduledList.innerHTML = `<div class="scheduled-items">${html}</div>`;
    addScheduledPostEventListeners();
}

export function populateEditModal(post: ScheduledPost): void {
    const redditTokenInput = document.getElementById('redditAccessToken') as HTMLInputElement;
    const redditRefreshInput = document.getElementById('redditRefreshToken') as HTMLInputElement;

    if (!editScheduleDate || !editScheduleLinkedIn || !editScheduleTelegram || !editScheduleReddit || !editScheduledPostText || !editScheduledMediaPreview || !editScheduledModal || !linkedinToken || !telegramBot || !telegramChat) return;

    // Populate the edit modal with the post data - scheduledTime is now stored as local time string
    editScheduleDate.value = post.scheduledTime.slice(0, 16);

    // Set platform checkboxes
    editScheduleLinkedIn.checked = post.platforms.includes('linkedin');
    editScheduleTelegram.checked = post.platforms.includes('telegram');
    editScheduleReddit.checked = post.platforms.includes('reddit');

    // Set post text
    editScheduledPostText.value = post.postData.text;

    // Show media preview if present
    if (post.postData.media) {
        editScheduledMediaPreview.innerHTML = '<p>📎 Media attached (cannot be changed currently)</p>';
    } else {
        editScheduledMediaPreview.innerHTML = '<p style="color: #666;">No media attached</p>';
    }

    // Disable platforms without tokens
    editScheduleLinkedIn.disabled = !linkedinToken.value.trim();
    editScheduleTelegram.disabled = !(telegramBot.value.trim() && telegramChat.value.trim());
    editScheduleReddit.disabled = !(redditTokenInput?.value.trim() && redditRefreshInput?.value.trim());

    editScheduledModal.style.display = 'flex';
}

export function cancelScheduledPost(postId: string): void {
    if (confirm('Are you sure you want to cancel this scheduled post?')) {
        getVscode()?.postMessage({
            command: 'cancelScheduledPost',
            scheduledPostId: postId
        });
    }
}

export function showScheduledPosts(): void {
    getVscode()?.postMessage({ command: 'loadScheduledPosts' });
    if (scheduledPosts) scheduledPosts.style.display = 'block';
}

export function addScheduledPostEventListeners() {
    // Cancel buttons
    document.querySelectorAll('.cancel-scheduled-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const postId = (e.target as HTMLElement).getAttribute('data-post-id');
            if (postId) {
                cancelScheduledPost(postId);
            }
        });
    });
}

