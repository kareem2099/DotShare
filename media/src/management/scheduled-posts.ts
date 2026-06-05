// Scheduled posts management functions - extracted from app.ts
import { ScheduledPost } from '../../../src/types';
import { getScheduledStatusBadge, scheduledList, scheduledPosts, editScheduleDate, editScheduleLinkedIn, editScheduleTelegram, editScheduledPostText, editScheduledMediaPreview, editScheduledModal, linkedinToken, telegramBot, telegramChat } from '../core/utils';
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
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );

    for (const post of sortedPosts) {
        const scheduledDate = new Date(post.scheduled_at);
        const now = new Date();
        const isPast = scheduledDate < now;

        const timeStr = isPast ?
            `Past due: ${scheduledDate.toLocaleString()}` :
            `Scheduled: ${scheduledDate.toLocaleString()}`;

        const statusBadge = getScheduledStatusBadge(post.status);

        const platformIcons = post.platforms.map((p: string) => p === 'linkedin' ? '💼' : '📱').join(' ');

        // Add scheduling type indicator
        const schedulingIcon = '☁️';

        const truncatedText = post.text_preview.length > 80
            ? post.text_preview.substring(0, 80) + '...'
            : post.text_preview;

        html += `
            <div class="scheduled-item ${post.status}" data-post-id="${post.id}">
                <div class="scheduled-header">
                    <span class="scheduled-time">${schedulingIcon} ${platformIcons} ${timeStr}</span>
                    <span class="scheduled-status">${statusBadge}</span>
                </div>
                <div class="scheduled-content">
                    <div class="scheduled-text">${truncatedText}</div>
                    ${post.has_media ? '<div class="scheduled-media">📎 Media attached</div>' : ''}
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
    if (!editScheduleDate || !editScheduleLinkedIn || !editScheduleTelegram || !editScheduledPostText || !editScheduledMediaPreview || !editScheduledModal || !linkedinToken || !telegramBot || !telegramChat) return;

    // Populate the edit modal with the post data - scheduled_at is now stored as local time string
    editScheduleDate.value = post.scheduled_at.slice(0, 16);

    // Set platform checkboxes
    editScheduleLinkedIn.checked = post.platforms.includes('linkedin');
    editScheduleTelegram.checked = post.platforms.includes('telegram');


    // Set post text
    editScheduledPostText.value = post.text_preview;

    // Show media preview if present
    if (post.has_media) {
        editScheduledMediaPreview.innerHTML = '<p>📎 Media attached (cannot be changed currently)</p>';
    } else {
        editScheduledMediaPreview.innerHTML = '<p style="color: #666;">No media attached</p>';
    }

    // Disable platforms without tokens
    editScheduleLinkedIn.disabled = !linkedinToken.value.trim();
    editScheduleTelegram.disabled = !(telegramBot.value.trim() && telegramChat.value.trim());


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

