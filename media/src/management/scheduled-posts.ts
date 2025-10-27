// Scheduled posts management functions - extracted from app.ts
import { ScheduledPost } from '../../../src/types';
import { showStatus, getScheduledStatusBadge, scheduledList, scheduledPosts, currentEditingPostId, formatTimestamp, editScheduleDate, editScheduleLinkedIn, editScheduleTelegram, editScheduleReddit, editScheduledPostText, editScheduledMediaPreview, editScheduledModal, linkedinToken, telegramBot, telegramChat, setCurrentEditingPostId } from '../core/utils';
import { translations } from '../core/translations';
import { currentLang } from '../core/utils';

// @ts-ignore

// Lazy vscode accessor to avoid undefined issues
const getVscode = () => (window as any).vscode;

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

        const platformIcons = post.platforms.map(p => p === 'linkedin' ? '💼' : '📱').join(' ');

        const truncatedText = post.postData.text.length > 80
            ? post.postData.text.substring(0, 80) + '...'
            : post.postData.text;

        html += `
            <div class="scheduled-item ${post.status}" data-post-id="${post.id}">
                <div class="scheduled-header">
                    <span class="scheduled-time">${platformIcons} ${timeStr}</span>
                    <span class="scheduled-status">${statusBadge}</span>
                </div>
                <div class="scheduled-content">
                    <div class="scheduled-text">${truncatedText}</div>
                    ${post.postData.media ? '<div class="scheduled-media">📎 Media attached</div>' : ''}
                </div>
                <div class="scheduled-actions">
                    ${post.status === 'failed' ? `<button class="retry-scheduled-btn" data-post-id="${post.id}" title="Retry">🔄</button>` : `<button class="edit-scheduled-btn" data-post-id="${post.id}" title="Edit">✏️</button>`}
                    <button class="delete-scheduled-btn" data-post-id="${post.id}" title="Delete">🗑️</button>
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

    // Populate the edit modal with the post data
    const scheduledDate = new Date(post.scheduledTime);
    editScheduleDate.value = scheduledDate.toISOString().slice(0, 16);

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

export function deleteScheduledPost(postId: string): void {
    // Use VS Code's native confirmation dialog
    getVscode()?.postMessage({
        command: 'confirmDeleteScheduledPost',
        scheduledPostId: postId
    });
}

export function retryScheduledPost(postId: string): void {
    getVscode()?.postMessage({
        command: 'retryScheduledPost',
        scheduledPostId: postId
    });
}

export function showScheduledPosts(): void {
    getVscode()?.postMessage({ command: 'loadScheduledPosts' });
    if (scheduledPosts) scheduledPosts.style.display = 'block';
}

export function addScheduledPostEventListeners() {
    // Edit buttons
    document.querySelectorAll('.edit-scheduled-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const postId = (e.target as HTMLElement).getAttribute('data-post-id');
            if (postId) {
                editScheduledPost(postId);
            }
        });
    });

    // Delete buttons
    document.querySelectorAll('.delete-scheduled-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const postId = (e.target as HTMLElement).getAttribute('data-post-id');
            if (postId) {
                deleteScheduledPost(postId);
            }
        });
    });

    // Retry buttons
    document.querySelectorAll('.retry-scheduled-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const postId = (e.target as HTMLElement).getAttribute('data-post-id');
            if (postId) {
                retryScheduledPost(postId);
            }
        });
    });
}

export function editScheduledPost(postId: string) {
    if (!editScheduledModal) return;

    setCurrentEditingPostId(postId);

    // Load current scheduled posts data
    getVscode()?.postMessage({ command: 'loadScheduledPosts' });

    // Modal will be populated when data is loaded
}

export function saveEditedScheduledPost() {
    if (!currentEditingPostId || !editScheduleDate || !editScheduleLinkedIn || !editScheduleTelegram || !editScheduleReddit || !editScheduledPostText || !editScheduledModal) return;

    const scheduledTime = editScheduleDate.value;
    const selectedPlatforms: ('linkedin' | 'telegram' | 'reddit')[] = [];

    if (editScheduleLinkedIn.checked) selectedPlatforms.push('linkedin');
    if (editScheduleTelegram.checked) selectedPlatforms.push('telegram');
    if (editScheduleReddit.checked) selectedPlatforms.push('reddit');

    if (!scheduledTime) {
        showStatus('Please select a date and time.', 'error');
        return;
    }

    if (selectedPlatforms.length === 0) {
        showStatus('Please select at least one platform.', 'error');
        return;
    }

    const scheduleDateObj = new Date(scheduledTime);
    const now = new Date();

    if (scheduleDateObj <= now) {
        showStatus('Scheduled time must be in the future.', 'error');
        return;
    }

    getVscode()?.postMessage({
        command: 'editScheduledPost',
        scheduledPostId: currentEditingPostId,
        scheduledTime: scheduledTime,
        selectedPlatforms: selectedPlatforms,
        postText: editScheduledPostText.value.trim() || undefined
    });

    closeEditScheduledModal();
}

export function closeEditScheduledModal() {
    if (editScheduledModal) editScheduledModal.style.display = 'none';
    setCurrentEditingPostId(null);
}
