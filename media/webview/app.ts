/**
 * DotShare v3.0 — WebView App
 * Compiled by esbuild → media/webview/app.js
 */

// Force TypeScript to treat this as a module (not a global script).
// Without this, the TS language server merges all declarations across
// webview files in the same implicit project → false "duplicate function" errors.
export { };

declare const acquireVsCodeApi: () => { postMessage(msg: unknown): void };

// Get vscode API from global scope (set by HTML inline script)
// Declaration for the vscode API object that gets attached to window by the HTML script
interface VsCodeApi {
    postMessage(msg: unknown): void;
}

// Get vscode API - it's set by inline script in HTML before this script loads
const vscode: VsCodeApi =
    (typeof window !== 'undefined' && (window as any).__vscode) ||
    (typeof globalThis !== 'undefined' && (globalThis as any).vscode) ||
    acquireVsCodeApi();

// Global types for platform data set in HTML
interface PlatformData {
    platform: string;
    name: string;
    icon: string;
    maxChars: number;
    workspaceType: string;
    supportsThreads: boolean;
    supportsMedia: boolean;
    charCountMethod: string;
}

declare global {
    interface Window {
        __PLATFORM_DATA__?: PlatformData;
        __AUTO_THREAD_PLATFORM__?: string;
        __vscode?: VsCodeApi;
    }
}

function send(command: string, payload: Record<string, unknown> = {}): void {
    try {
        vscode.postMessage({ command, ...payload });
    } catch (error) {
        console.error(`Failed to send command '${command}':`, error);
        showError(`Could not send command to extension`);
    }
}

function showError(msg: string): void {
    toast(msg, 'error', 5000);
}

function setBtnLoading(id: string, isLoading: boolean): void {
    const btn = get<HTMLButtonElement>(id);
    if (btn) {
        if (isLoading) btn.classList.add('loading');
        else btn.classList.remove('loading');
    }
}

function get<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function escHtml(s: string): string {
    return s.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

function toast(msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', ms = 4000): void {
    const container = get('toast-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'toast ' + type;
    const icons: Record<string, string> = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

    el.innerHTML = `
        <span>${icons[type]}</span>
        <span>${escHtml(msg)}</span>
        <button class="toast-close">✕</button>
        <div class="toast-progress" style="animation-duration: ${ms}ms"></div>
    `;

    el.querySelector('.toast-close')?.addEventListener('click', () => el.remove());
    container.appendChild(el);

    if (ms > 0) {
        setTimeout(() => {
            if (el.parentNode) {
                el.style.opacity = '0';
                setTimeout(() => el.remove(), 250);
            }
        }, ms);
    }
}

// ── Keyboard Shortcuts ─────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
    // Ctrl+Enter for Share
    if (e.ctrlKey && e.key === 'Enter') {
        const shareBtn = get<HTMLButtonElement>('btn-share');
        if (shareBtn && !shareBtn.disabled && !shareBtn.classList.contains('loading')) {
            shareBtn.click();
        }
        const threadBtn = get<HTMLButtonElement>('btn-share-thread');
        if (threadBtn && !threadBtn.disabled && !threadBtn.classList.contains('loading')) {
            threadBtn.click();
        }
    }
    // Ctrl+L for Read File
    if (e.ctrlKey && e.key === 'l') {
        const readBtn = get<HTMLButtonElement>('btn-read-md-file');
        if (readBtn && !readBtn.disabled) {
            e.preventDefault();
            readBtn.click();
        }
    }
});

// ── Onboarding Logic ────────────────────────────────────────────────────────
function checkCredentials(config: any): void {
    const banner = get('onboarding-banner');
    if (!banner) return;

    const hasCreds = config && (
        config.linkedinToken || config.telegramBot || config.xAccessToken ||
        config.facebookToken || config.discordWebhookUrl || config.redditAccessToken ||
        config.blueskyIdentifier || config.devtoApiKey || config.mediumAccessToken
    );

    if (!hasCreds) {
        banner.classList.add('visible');
    } else {
        banner.classList.remove('visible');
    }
}

get('onboarding-dismiss')?.addEventListener('click', () => {
    get('onboarding-banner')?.classList.remove('visible');
});

get('onboarding-goto-settings')?.addEventListener('click', () => {
    navigateTo('settings');
});

function navigateTo(pageId: string): void {
    try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const page = get('page-' + pageId);
        const btn = document.querySelector<HTMLElement>('.nav-btn[data-page="' + pageId + '"]');
        if (page) page.classList.add('active');
        if (btn) btn.classList.add('active');
        if (pageId === 'analytics') send('loadAnalytics');
        if (pageId === 'post') send('loadScheduledPosts');
    } catch (error) {
        console.error('Navigation error:', error);
    }
}

document.querySelectorAll<HTMLElement>('.nav-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
        try {
            const page = btn.getAttribute('data-page');
            if (page) navigateTo(page);
        } catch (error) {
            console.error('Nav button click error:', error);
        }
    });
});

const MAX_CHARS: Record<string, number> = {
    x: 280, bluesky: 300, linkedin: 3000, telegram: 4096, facebook: 63206, discord: 2000, reddit: 40000,
    devto: 100000, medium: 100000,
};

function revealBlogPublisherUi(): void {
    const preview = get('blog-preview');
    if (preview) preview.style.display = 'block';

    const devtoCard = get('blog-publish-devto-card');
    const mediumCard = get('blog-publish-medium-card');
    const blogPlatformsCard = get('blog-platforms-card');
    const blogActions = get('blog-actions');

    if (devtoCard && mediumCard) {
        // Multi-platform panel (index.html)
        devtoCard.style.display = 'block';
        mediumCard.style.display = 'block';
    } else {
        // Single-platform panel (platform-post.html)
        if (blogPlatformsCard) blogPlatformsCard.style.display = 'block';
        if (blogActions) blogActions.style.display = 'flex';
    }
    updateBlogPublishButtonsState();
}

function getBlogBodyText(): string {
    const blogBody = get<HTMLTextAreaElement>('blog-body')?.value.trim() || '';
    const postText = get<HTMLTextAreaElement>('post-text')?.value.trim() || '';
    return blogBody || postText;
}

function getSingleBlogPlatform(): 'devto' | 'medium' | null {
    const v = get<HTMLInputElement>('blog-single-platform')?.value?.trim();
    if (v === 'devto' || v === 'medium') return v;
    return null;
}

const BLOG_BTN_LABEL_DEVTO = '🚀 Publish to Dev.to';
const BLOG_BTN_LABEL_MEDIUM = '🚀 Publish to Medium';
const singleBlogPublishDefaultLabel =
    get<HTMLButtonElement>('btn-publish-blog')?.textContent?.trim() ?? '';

function updateBlogPublishButtonsState(): void {
    const hasContent = getBlogBodyText().length > 0;

    const bDev = get<HTMLButtonElement>('btn-publish-blog-devto');
    const bMed = get<HTMLButtonElement>('btn-publish-blog-medium');
    const bSingle = get<HTMLButtonElement>('btn-publish-blog');

    if (bDev) bDev.disabled = !hasContent;
    if (bMed) bMed.disabled = !hasContent;
    if (bSingle) bSingle.disabled = !hasContent;
}

function resetBlogPublishUi(): void {
    const hasContent = getBlogBodyText().length > 0;
    const bDev = get<HTMLButtonElement>('btn-publish-blog-devto');
    if (bDev) {
        setBtnLoading('btn-publish-blog-devto', false);
        bDev.disabled = !hasContent;
        bDev.textContent = BLOG_BTN_LABEL_DEVTO;
    }
    const bMed = get<HTMLButtonElement>('btn-publish-blog-medium');
    if (bMed) {
        setBtnLoading('btn-publish-blog-medium', false);
        bMed.disabled = !hasContent;
        bMed.textContent = BLOG_BTN_LABEL_MEDIUM;
    }
    const bSingle = get<HTMLButtonElement>('btn-publish-blog');
    if (bSingle) {
        setBtnLoading('btn-publish-blog', false);
        bSingle.disabled = !hasContent;
        const singlePlat = getSingleBlogPlatform();
        if (singlePlat === 'devto') bSingle.textContent = BLOG_BTN_LABEL_DEVTO;
        else if (singlePlat === 'medium') bSingle.textContent = BLOG_BTN_LABEL_MEDIUM;
        else bSingle.textContent = singleBlogPublishDefaultLabel || '🚀 Publish Article';
    }
}

function resetAllComposers(): void {
    try {
        // 1. Clear Main Textarea
        if (textarea) {
            textarea.value = '';
            updateCharCounter();
            updateShareBtn();
        }

        // 2. Clear Article Publisher
        const blogBody = get<HTMLTextAreaElement>('blog-body');
        if (blogBody) blogBody.value = '';

        const blogFields = ['blog-title', 'blog-tags', 'blog-description', 'blog-cover-image', 'blog-canonical-url', 'blog-series'];
        blogFields.forEach(id => {
            const el = get<HTMLInputElement | HTMLTextAreaElement>(id);
            if (el) el.value = '';
        });

        // 3. Clear Media
        const mediaPreview = get('media-preview');
        if (mediaPreview) mediaPreview.style.display = 'none';
        const fileInput = get<HTMLInputElement>('media-file-input');
        if (fileInput) fileInput.value = '';

        // 4. Clear Reddit Fields
        const redditFields = ['redditSubreddit', 'redditTitle', 'redditFlair'];
        redditFields.forEach(id => {
            const el = get<HTMLInputElement>(id);
            if (el) el.value = '';
        });

        // 5. Reset Buttons
        setBtnLoading('btn-share', false);
        setBtnLoading('btn-share-thread', false);
        setBtnLoading('btn-generate-ai', false);
        setBtnLoading('btn-read-md-file', false);

        activeMediaPath = null;

        if (btnShare) {
            btnShare.disabled = true;
            btnShare.textContent = activeCommandPlatform ? `🚀 Share to ${activeCommandPlatform.charAt(0).toUpperCase() + activeCommandPlatform.slice(1)}` : '🚀 Share Now';
        }

        resetBlogPublishUi();

        console.log('[DotShare] Composers reset successfully');
    } catch (error) {
        console.error('Error resetting composers:', error);
    }
}

function sendBlogShare(platform: 'devto' | 'medium', publishStatus: string): void {
    const postText = getBlogBodyText();
    if (!postText) {
        toast('No article body to publish. Read a Markdown file or paste content in Article (Markdown body).', 'warning');
        return;
    }
    const title = get<HTMLInputElement>('blog-title')?.value.trim();
    const tagsInput = get<HTMLInputElement>('blog-tags')?.value.trim();
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : undefined;
    const description = get<HTMLTextAreaElement>('blog-description')?.value.trim();
    const coverImage = get<HTMLInputElement>('blog-cover-image')?.value.trim();
    const canonicalUrl = get<HTMLInputElement>('blog-canonical-url')?.value.trim();
    const series = get<HTMLInputElement>('blog-series')?.value.trim();
    send('shareBlog', {
        platforms: [platform],
        post: postText,
        title,
        tags,
        description,
        coverImage,
        canonicalUrl: canonicalUrl || undefined,
        series: series || undefined,
        publishStatus,
        published: publishStatus === 'published',
    });
    toast('Publishing article...', 'info');
}

function wireBlogPublishButton(
    btn: HTMLButtonElement | null,
    platform: 'devto' | 'medium',
    getStatus: () => string
): void {
    if (!btn) return;
    btn.addEventListener('click', () => {
        try {
            const publishStatus = getStatus() || 'draft';
            btn.disabled = true;
            btn.textContent = '⏳ Publishing...';
            sendBlogShare(platform, publishStatus);
        } catch (error) {
            console.error('Publish error:', error);
            toast('Failed to publish article', 'error');
            resetBlogPublishUi();
        }
    });
}

get('btn-read-md-file')?.addEventListener('click', () => {
    const btn = get<HTMLButtonElement>('btn-read-md-file');
    if (btn) btn.classList.add('loading');
    send('readMarkdownFile');
    toast('Reading current file…', 'info', 2000);
});

wireBlogPublishButton(
    get<HTMLButtonElement>('btn-publish-blog-devto'),
    'devto',
    () => get<HTMLSelectElement>('blog-publish-status-devto')?.value || 'draft'
);
wireBlogPublishButton(
    get<HTMLButtonElement>('btn-publish-blog-medium'),
    'medium',
    () => get<HTMLSelectElement>('blog-publish-status-medium')?.value || 'draft'
);

const btnPublishBlogSingle = get<HTMLButtonElement>('btn-publish-blog');
const singleBlogPlat = getSingleBlogPlatform();
if (btnPublishBlogSingle && singleBlogPlat) {
    wireBlogPublishButton(
        btnPublishBlogSingle,
        singleBlogPlat,
        () => get<HTMLSelectElement>('blog-publish-status')?.value || 'draft'
    );
}

get<HTMLTextAreaElement>('blog-body')?.addEventListener('input', () => updateBlogPublishButtonsState());

const textarea = get<HTMLTextAreaElement>('post-text');
const counter = get('char-counter');
const btnShare = get<HTMLButtonElement>('btn-share');
const btnGenerate = get<HTMLButtonElement>('btn-generate-ai');
const btnSchedule = get<HTMLButtonElement>('btn-schedule');
const btnMedia = get<HTMLButtonElement>('btn-attach-media');
const btnRemMedia = get<HTMLButtonElement>('btn-remove-media');

function updateCharCounter(): void {
    if (!textarea || !counter) return;
    const len = textarea.value.length;
    counter.textContent = String(len);
    counter.className = 'compose-counter';
}

function updateShareBtn(): void {
    if (btnShare) btnShare.disabled = !textarea?.value.trim().length;
}

textarea?.addEventListener('input', () => { updateCharCounter(); updateShareBtn(); });

// Pro teaser — track interest clicks
get('btn-pro-multipost')?.addEventListener('click', () => {
    try {
        send('proFeatureInterest', { feature: 'multi-platform-posting' });
        toast('🌟 Multi-Platform Posting is coming in the Pro version! Stay tuned.', 'info', 6000);
    } catch (error) {
        console.error('Pro button error:', error);
    }
});

let activeCommandPlatform: any = null;
let activeMediaPath: string | null = null;

// ── Threads Composer ────────────────────────────────────────────────────────
const threadContainer = get('thread-posts');
const btnAddThreadPost = get<HTMLButtonElement>('btn-add-thread-post');
const btnShareThread = get<HTMLButtonElement>('btn-share-thread');

let threadPosts: Array<{ text: string, mediaPath: string | null, mediaName: string | null }> = [
    { text: '', mediaPath: null, mediaName: null }
];

function updateThreadCharCounter(index: number): void {
    const el = document.querySelector<HTMLElement>(`[data-thread-counter="${index}"]`);
    const ta = document.querySelector<HTMLTextAreaElement>(`[data-thread-textarea="${index}"]`);
    if (el && ta) {
        el.textContent = `${ta.value.length} / ${window.__PLATFORM_DATA__?.maxChars || 280}`;
    }
}

function updateThreadShareBtn(): void {
    const btnShareThread = get<HTMLButtonElement>('btn-share-thread');
    if (!btnShareThread) return;
    const hasAnyContent = threadPosts.some(p => p.text.trim().length > 0 || p.mediaPath);
    btnShareThread.disabled = !hasAnyContent;
}

btnAddThreadPost?.addEventListener('click', () => {
    const index = threadPosts.length;
    threadPosts.push({ text: '', mediaPath: null, mediaName: null });

    const postHtml = `
        <div class="thread-post" data-thread-index="${index}">
            <div class="thread-post-header">
                <span class="thread-post-label">Post ${index + 1}</span>
                <span class="thread-char-counter" data-thread-counter="${index}">0 / ${window.__PLATFORM_DATA__?.maxChars || 280}</span>
                <button class="btn btn-ghost btn-sm btn-remove-thread-post" data-remove-index="${index}">✕</button>
            </div>
            <textarea class="thread-textarea" data-thread-textarea="${index}" placeholder="What's on your mind?" rows="3"></textarea>
            <div class="thread-post-actions">
                <button class="btn btn-ghost btn-sm thread-media-btn" data-thread-media="${index}">📎 Media</button>
                <input type="file" class="thread-file-input" data-thread-file="${index}" 
                    accept="image/jpeg,image/png,image/gif,image/webp,video/mp4" style="display:none;" />
                <div class="thread-media-preview" data-thread-preview="${index}" style="display:none;">
                    <span class="thread-media-name"></span>
                    <button class="btn btn-ghost btn-sm thread-remove-media" data-thread-remove="${index}">✕</button>
                </div>
            </div>
        </div>
    `;

    if (threadContainer) {
        const div = document.createElement('div');
        div.innerHTML = postHtml.trim();
        threadContainer.appendChild(div.firstChild!);
        wireThreadPostEvents(index);
    }
});

function wireThreadPostEvents(index: number): void {
    const ta = document.querySelector<HTMLTextAreaElement>(`[data-thread-textarea="${index}"]`);
    const mediaBtn = document.querySelector<HTMLButtonElement>(`[data-thread-media="${index}"]`);
    const fileInp = document.querySelector<HTMLInputElement>(`[data-thread-file="${index}"]`);
    const remMediaBtn = document.querySelector<HTMLButtonElement>(`[data-thread-remove="${index}"]`);
    const remPostBtn = document.querySelector<HTMLButtonElement>(`[data-remove-index="${index}"]`);

    ta?.addEventListener('input', () => {
        threadPosts[index].text = ta.value;
        updateThreadCharCounter(index);
        updateThreadShareBtn();
    });

    mediaBtn?.addEventListener('click', () => fileInp?.click());

    fileInp?.addEventListener('change', () => {
        const file = fileInp?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            // In threads, we might need a way to track which post is uploading
            // For now, let's just use a special command or add index to uploadFile
            send('uploadFile', { 
                file: { name: file.name, size: file.size, type: file.type, base64Data: base64 },
                threadIndex: index 
            });
        };
        reader.readAsDataURL(file);

        // Preview local
        const preview = document.querySelector<HTMLElement>(`[data-thread-preview="${index}"]`);
        const nameEl = document.querySelector<HTMLElement>(`[data-thread-preview="${index}"] .thread-media-name`);
        if (preview) preview.style.display = 'flex';
        if (nameEl) nameEl.textContent = file.name;
    });

    remMediaBtn?.addEventListener('click', () => {
        threadPosts[index].mediaPath = null;
        threadPosts[index].mediaName = null;
        const preview = document.querySelector<HTMLElement>(`[data-thread-preview="${index}"]`);
        if (preview) preview.style.display = 'none';
        if (fileInp) fileInp.value = '';
        updateThreadShareBtn();
    });

    remPostBtn?.addEventListener('click', () => {
        const el = document.querySelector(`.thread-post[data-thread-index="${index}"]`);
        if (el) el.remove();
        // Note: we don't remove from array to keep indexes simple, just mark as deleted or handle re-indexing
        // But for simplicity in this MVP: 
        threadPosts[index].text = '';
        threadPosts[index].mediaPath = null;
        updateThreadShareBtn();
    });
}

// Initial wire up for first post
wireThreadPostEvents(0);

btnShareThread?.addEventListener('click', () => {
    try {
        const validPosts = threadPosts.filter(p => p.text.trim() || p.mediaPath);
        if (validPosts.length === 0) { toast('Thread is empty', 'warning'); return; }

        btnShareThread.classList.add('loading');
        btnShareThread.disabled = true;
        btnShareThread.textContent = '⏳ Sharing Thread…';

        send('shareThread', {
            platform: activeCommandPlatform || (window as any).__AUTO_THREAD_PLATFORM__,
            posts: validPosts.map(p => ({
                text: p.text,
                mediaFilePaths: p.mediaPath ? [p.mediaPath] : []
            }))
        });
    } catch (error) {
        console.error('Thread share error:', error);
        toast('Failed to share thread', 'error');
        if (btnShareThread) {
            btnShareThread.disabled = false;
            btnShareThread.classList.remove('loading');
            btnShareThread.textContent = '🚀 Share Thread';
        }
    }
});

btnShare?.addEventListener('click', () => {
    try {
        const text = textarea?.value.trim();
        if (!text) { toast('Write something first', 'warning'); return; }
        btnShare.classList.add('loading');
        btnShare.disabled = true;
        btnShare.textContent = '⏳ Sharing…';

        const platforms = activeCommandPlatform ? [activeCommandPlatform] : [];
        const payload: any = {
            post: text,
            platforms,
            mediaFilePaths: activeMediaPath ? [activeMediaPath] : []
        };

        // Integrated Reddit metadata collection
        if (activeCommandPlatform === 'reddit') {
            const val = (id: string) => (get<HTMLInputElement>(id)?.value ?? '').trim();
            const checked = (id: string) => get<HTMLInputElement>(id)?.checked ?? false;

            const subreddit = val('redditSubreddit');
            if (!subreddit) {
                toast('Please enter a subreddit (e.g., r/programming)', 'warning');
                btnShare.disabled = false;
                btnShare.textContent = `🚀 Share to Reddit`;
                btnShare.classList.remove('loading');
                return;
            }

            payload.redditMetadata = {
                subreddit,
                title: val('redditTitle') || text.split('\n')[0].substring(0, 300),
                flair: get<HTMLSelectElement>('redditFlair')?.value || '',
                postType: document.querySelector<HTMLInputElement>('input[name="redditPostType"]:checked')?.value || 'self',
                spoiler: checked('redditSpoiler')
            };
        }

        send('share', payload);
    } catch (error) {
        console.error('Share error:', error);
        toast('Failed to share post', 'error');
        if (btnShare) {
            btnShare.disabled = false;
            btnShare.classList.remove('loading');
            btnShare.textContent = activeCommandPlatform ? `🚀 Share to ${activeCommandPlatform.charAt(0).toUpperCase() + activeCommandPlatform.slice(1)}` : '🚀 Share Now';
        }
    }
});

btnGenerate?.addEventListener('click', () => {
    try {
        const text = textarea?.value.trim();
        send('generatePost', { post: text, platform: 'general' });
        toast('Generating…', 'info');
        if (btnGenerate) { btnGenerate.disabled = true; btnGenerate.textContent = '⏳ Generating…'; }
    } catch (error) {
        console.error('Generate error:', error);
        toast('Failed to generate post', 'error');
        if (btnGenerate) {
            btnGenerate.disabled = false;
            btnGenerate.textContent = '🧠 Generate with AI';
        }
    }
});

// Temporarily disabled - Pro feature "Coming Soon"
// btnSchedule?.addEventListener('click', () => {
//     try {
//         const text = textarea?.value.trim();
//         if (!text) { toast('Write a post first', 'warning'); return; }
//         send('schedulePost', { postText: text });
//     } catch (error) {
//         console.error('Schedule error:', error);
//         toast('Failed to schedule post', 'error');
//     }
// });

// File input
const fileInput = get<HTMLInputElement>('media-file-input');
btnMedia?.addEventListener('click', () => {
    try {
        if (fileInput) fileInput.click();
    } catch (error) {
        console.error('File input error:', error);
        toast('Failed to open file picker', 'error');
    }
});
fileInput?.addEventListener('change', () => {
    try {
        const files = fileInput.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const base64 = (reader.result as string).split(',')[1];
                send('uploadFile', { file: { name: file.name, size: file.size, type: file.type, base64Data: base64 } });
            } catch (uploadError) {
                console.error('File upload error:', uploadError);
                toast('Failed to upload file', 'error');
            }
        };
        reader.onerror = () => {
            console.error('File read error:', reader.error);
            toast('Failed to read file', 'error');
        };
        reader.readAsDataURL(file);
        // Show preview
        const preview = get('media-preview');
        const nameEl = get('media-name');
        const sizeEl = get('media-size');
        if (preview) preview.style.display = 'block';
        if (nameEl) nameEl.textContent = file.name;
        if (sizeEl) {
            const b = file.size;
            sizeEl.textContent = b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
        }
    } catch (error) {
        console.error('File input handler error:', error);
        toast('Failed to process file', 'error');
    }
});
btnRemMedia?.addEventListener('click', () => {
    try {
        const preview = get('media-preview');
        if (preview) preview.style.display = 'none';
        if (fileInput) fileInput.value = '';
        send('removeMedia');
    } catch (error) {
        console.error('Remove media error:', error);
        toast('Failed to remove media', 'error');
    }
});

function renderScheduledPosts(posts: Array<{ id: string; scheduledTime: string; platforms: string[]; postData: { text: string } }>): void {
    const list = get('scheduled-list');
    if (!list) return;
    if (!posts || !posts.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🕐</div><div class="empty-state-title">No scheduled posts</div></div>';
        return;
    }
    const icons: Record<string, string> = { linkedin: '💼', telegram: '📱', x: '𝕏', facebook: '📘', discord: '💬', reddit: '🟠', bluesky: '🦋', devto: '👨‍💻', medium: 'Ⓜ️' };
    list.innerHTML = posts.map(function (p) {
        const dt = new Date(p.scheduledTime);
        const pi = p.platforms.map(function (pl) { return icons[pl] || '🔗'; }).join(' ');
        return '<div class="scheduled-item"><div><div class="scheduled-time">' + pi + ' ' + dt.toLocaleString() + '</div><div class="scheduled-text">' + escHtml((p.postData && p.postData.text || '').slice(0, 100)) + '</div></div><button class="btn btn-ghost btn-sm" data-del="' + p.id + '">🗑️</button></div>';
    }).join('');
    list.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () { send('confirmDeleteScheduledPost', { scheduledPostId: (b as HTMLElement).dataset.del }); });
    });
}

function updateAnalytics(data: Record<string, unknown>): void {
    const set = function (id: string, v: string) { const el = get(id); if (el) el.textContent = v; };
    set('stat-total', String(data.totalPosts || 0));
    set('stat-success', (data.successRate || 0) + '%');
    set('stat-linkedin', String(data.linkedinShares || 0));
    set('stat-telegram', String(data.telegramShares || 0));
    set('stat-facebook', String(data.facebookShares || 0));
    set('stat-discord', String(data.discordShares || 0));
    set('stat-bluesky', String(data.blueskyShares || 0));
    set('stat-x', String(data.xShares || 0));
    set('stat-reddit', String(data.redditShares || 0));
    set('stat-devto', String(data.devtoShares || 0));
    set('stat-medium', String(data.mediumShares || 0));
}

function renderHistory(posts: Array<Record<string, unknown>>): void {
    const list = get('history-list');
    if (!list) return;
    if (!posts || !posts.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-title">No history yet</div></div>';
        return;
    }
    const icons: Record<string, string> = { linkedin: '💼', telegram: '📱', x: '𝕏', facebook: '📘', discord: '💬', reddit: '🟠', bluesky: '🦋', devto: '👨‍💻', medium: 'Ⓜ️' };
    list.innerHTML = posts.slice(0, 20).map(function (p) {
        const shares = (p.shares as Array<{ platform: string; success: boolean }>) || [];
        const si = shares.map(function (s) { return (s.success ? '✅' : '❌') + (icons[s.platform] || '🔗'); }).join(' ');
        const pd = p.postData as { text: string };
        const text = pd && pd.text ? pd.text : '';
        const time = new Date(p.timestamp as string).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return '<div class="history-item"><div style="flex:1;min-width:0;"><div class="history-text">' + escHtml(text.slice(0, 90)) + '</div><div style="margin-top:4px;font-size:11px;">' + si + '</div></div><div class="history-meta">' + time + '</div></div>';
    }).join('');
}

get('btn-refresh-analytics')?.addEventListener('click', () => {
    try {
        send('loadAnalytics');
        send('loadPostHistory');
        toast('Refreshing…', 'info', 1500);
    } catch (error) {
        console.error('Refresh analytics error:', error);
        toast('Failed to refresh analytics', 'error');
    }
});

// ── Settings: Collapsible platform cards ──────────────────────────────────────
document.querySelectorAll<HTMLElement>('[data-cfg-toggle]').forEach(toggle => {
    toggle.addEventListener('click', () => {
        try {
            const platform = toggle.getAttribute('data-cfg-toggle');
            const body = get('cfg-body-' + platform);
            const icon = toggle.querySelector<HTMLElement>('.expand-icon');
            if (body) {
                const isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'flex';
                if (icon) icon.textContent = isOpen ? '▶' : '▼';
            }
        } catch (error) {
            console.error('Toggle error:', error);
        }
    });
});

// ── Settings: Save buttons ───────────────────────────────────────────────────
document.querySelectorAll<HTMLElement>('[data-save]').forEach(btn => {
    btn.addEventListener('click', () => {
        try {
            const platform = btn.getAttribute('data-save');
            if (!platform) return;

            const val = (id: string) => (get<HTMLInputElement>(id)?.value ?? '').trim();

            switch (platform) {
                case 'linkedin':
                    send('saveLinkedinToken', { linkedinToken: val('linkedinToken') });
                    break;
                case 'telegram':
                    send('saveTelegramCredentials', { telegramBot: val('telegramBot'), telegramChat: val('telegramChat') });
                    break;
                case 'x':
                    send('saveXCredentials', { xAccessToken: val('xAccessToken'), xAccessSecret: val('xAccessSecret') });
                    break;
                case 'facebook':
                    send('saveFacebookToken', { facebookToken: val('facebookToken'), facebookPageToken: val('facebookPageToken'), facebookPageId: val('facebookPageId') });
                    break;
                case 'discord':
                    send('saveDiscordWebhook', { discordWebhookUrl: val('discordWebhook') });
                    break;
                case 'reddit':
                    send('saveRedditCredentials', { redditAccessToken: val('redditAccessToken'), redditRefreshToken: '' });
                    break;
                case 'bluesky':
                    send('saveBlueSkyCredentials', { blueskyIdentifier: val('blueskyIdentifier'), blueskyPassword: val('blueskyPassword') });
                    break;
                case 'devto':
                    send('saveDevToCredentials', { devtoApiKey: val('devtoApiKey') });
                    break;
                case 'medium':
                    send('saveMediumCredentials', { mediumAccessToken: val('mediumAccessToken') });
                    break;
                case 'ai':
                    send('saveAIConfig', { provider: val('cfg-ai-provider'), model: val('cfg-ai-model'), apiKey: val('cfg-ai-key') });
                    break;
            }
            toast(platform + ' settings saved!', 'success');
        } catch (error) {
            console.error('Save button error:', error);
            toast('Failed to save settings', 'error');
        }
    });
});

// Reddit generate tokens
get('generateRedditTokensBtn')?.addEventListener('click', () => {
    try {
        const val = (id: string) => (get<HTMLInputElement>(id)?.value ?? '').trim();
        send('generateRedditTokens', {
            clientId: val('redditClientId'),
            clientSecret: val('redditClientSecret'),
            username: val('redditUsername'),
            password: val('redditPassword'),
            apiName: val('redditApiName')
        });
        toast('Generating Reddit tokens…', 'info');
    } catch (error) {
        console.error('Reddit token generation error:', error);
        toast('Failed to generate Reddit tokens', 'error');
    }
});

// Reddit load posts
get('btn-load-reddit-posts')?.addEventListener('click', () => {
    try {
        send('getRedditUserPosts');
        toast('Loading your Reddit posts…', 'info');
    } catch (error) {
        console.error('Reddit load posts error:', error);
        toast('Failed to load Reddit posts', 'error');
    }
});

// OAuth buttons
document.querySelectorAll<HTMLElement>('[id^="oauthConnect_"]').forEach(btn => {
    btn.addEventListener('click', () => {
        try {
            const platform = btn.getAttribute('data-platform');
            if (platform) {
                send('openOAuth', { platform });
                toast('Opening ' + platform + ' OAuth…', 'info');
            }
        } catch (error) {
            console.error('OAuth connect error:', error);
            toast('Failed to open OAuth', 'error');
        }
    });
});

document.querySelectorAll<HTMLElement>('[id^="oauthDisconnect_"]').forEach(btn => {
    btn.addEventListener('click', () => {
        try {
            const platform = btn.getAttribute('data-platform');
            if (platform) {
                send('disconnectOAuth', { platform });
                toast('Disconnected from ' + platform, 'success');
            }
        } catch (error) {
            console.error('OAuth disconnect error:', error);
            toast('Failed to disconnect', 'error');
        }
    });
});

// OAuth advanced toggle
document.querySelectorAll<HTMLElement>('[id^="oauthAdvancedToggle_"]').forEach(toggle => {
    toggle.addEventListener('click', () => {
        try {
            const platform = toggle.id.replace('oauthAdvancedToggle_', '');
            const content = get('oauthAdvancedContent_' + platform);
            const icon = toggle.querySelector('.toggle-icon');
            if (content) {
                const isOpen = content.style.display !== 'none';
                content.style.display = isOpen ? 'none' : 'block';
                if (icon) icon.textContent = isOpen ? '⌄' : '⌃';
            }
        } catch (error) {
            console.error('OAuth toggle error:', error);
        }
    });
});

// Saved APIs buttons
document.querySelectorAll<HTMLElement>('.saved-apis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        try {
            const platform = btn.getAttribute('data-platform');
            if (platform) send('loadSavedApis', { platform });
        } catch (error) {
            console.error('Load saved APIs error:', error);
            toast('Failed to load saved APIs', 'error');
        }
    });
});

// AI Model modal
get('configureAIBtn')?.addEventListener('click', () => {
    try {
        const modal = get('modelModal');
        if (modal) modal.style.display = 'flex';
    } catch (error) {
        console.error('AI modal open error:', error);
        toast('Failed to open AI model selector', 'error');
    }
});

get('closeModal')?.addEventListener('click', () => {
    try {
        const modal = get('modelModal');
        if (modal) modal.style.display = 'none';
    } catch (error) {
        console.error('Modal close error:', error);
    }
});

get('applyModelBtn')?.addEventListener('click', () => {
    try {
        const activePanel = document.querySelector('.provider-panel.active');
        if (!activePanel) return;
        const provider = activePanel.id.replace('Panel', '');
        const keyInput = activePanel.querySelector<HTMLInputElement>('input[type="password"]');
        const modelSelect = activePanel.querySelector<HTMLSelectElement>('select');
        if (keyInput && modelSelect) {
            send('applyModelSelection', { provider, model: modelSelect.value, apiKey: keyInput.value });
            toast('AI model applied!', 'success');
            const modal = get('modelModal');
            if (modal) modal.style.display = 'none';
        }
    } catch (error) {
        console.error('Apply model error:', error);
        toast('Failed to apply AI model', 'error');
    }
});

// Provider tabs in AI modal
document.querySelectorAll<HTMLElement>('.tab-btn[data-provider]').forEach(tab => {
    tab.addEventListener('click', () => {
        try {
            document.querySelectorAll('.tab-btn[data-provider]').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.provider-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = get(tab.getAttribute('data-provider') + 'Panel');
            if (panel) panel.classList.add('active');
        } catch (error) {
            console.error('Tab click error:', error);
        }
    });
});

// Close modals on backdrop click
document.querySelectorAll<HTMLElement>('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        try {
            if (e.target === modal) modal.style.display = 'none';
        } catch (error) {
            console.error('Modal backdrop click error:', error);
        }
    });
});

// Schedule modal
get('closeScheduleModal')?.addEventListener('click', () => {
    try {
        const modal = get('scheduleModal');
        if (modal) modal.style.display = 'none';
    } catch (error) {
        console.error('Schedule modal close error:', error);
    }
});

get('cancelScheduleBtn')?.addEventListener('click', () => {
    try {
        const modal = get('scheduleModal');
        if (modal) modal.style.display = 'none';
    } catch (error) {
        console.error('Schedule cancel error:', error);
    }
});

get('confirmScheduleBtn')?.addEventListener('click', () => {
    try {
        const dateInput = get<HTMLInputElement>('scheduleDate');
        const postText = get<HTMLTextAreaElement>('scheduledPostText');
        if (!dateInput?.value) { toast('Select a date and time', 'warning'); return; }
        const selectedPlatforms: string[] = [];
        ['scheduleLinkedIn', 'scheduleTelegram', 'scheduleX', 'scheduleFacebook', 'scheduleDiscord', 'scheduleReddit', 'scheduleBluesky'].forEach(id => {
            const cb = get<HTMLInputElement>(id);
            if (cb?.checked) selectedPlatforms.push(cb.value);
        });
        if (!selectedPlatforms.length) { toast('Select at least one platform', 'warning'); return; }
        send('confirmSchedulePost', { scheduledTime: dateInput.value, platforms: selectedPlatforms, postText: postText?.value || '' });
        const modal = get('scheduleModal');
        if (modal) modal.style.display = 'none';
        toast('Post scheduled!', 'success');
    } catch (error) {
        console.error('Schedule confirmation error:', error);
        toast('Failed to schedule post', 'error');
    }
});

// Edit scheduled modal
get('closeEditScheduledModal')?.addEventListener('click', () => {
    try {
        const modal = get('editScheduledModal');
        if (modal) modal.style.display = 'none';
    } catch (error) {
        console.error('Edit scheduled modal close error:', error);
    }
});

get('cancelEditScheduledBtn')?.addEventListener('click', () => {
    try {
        const modal = get('editScheduledModal');
        if (modal) modal.style.display = 'none';
    } catch (error) {
        console.error('Edit scheduled cancel error:', error);
    }
});

get('saveEditScheduledBtn')?.addEventListener('click', () => {
    try {
        const dateInput = get<HTMLInputElement>('editScheduleDate');
        const postText = get<HTMLTextAreaElement>('editScheduledPostText');
        if (!dateInput?.value) { toast('Select a date and time', 'warning'); return; }
        const selectedPlatforms: string[] = [];
        ['editScheduleLinkedIn', 'editScheduleTelegram', 'editScheduleX', 'editScheduleFacebook', 'editScheduleDiscord', 'editScheduleReddit', 'editScheduleBluesky'].forEach(id => {
            const cb = get<HTMLInputElement>(id);
            if (cb?.checked) selectedPlatforms.push(cb.value);
        });
        send('saveEditedScheduledPost', { scheduledTime: dateInput.value, platforms: selectedPlatforms, postText: postText?.value || '' });
        const modal = get('editScheduledModal');
        if (modal) modal.style.display = 'none';
        toast('Scheduled post updated!', 'success');
    } catch (error) {
        console.error('Save edited scheduled error:', error);
        toast('Failed to update scheduled post', 'error');
    }
});

// ── Settings: Language & Theme ──────────────────────────────────────────────

/**
 * Show/hide Connect vs Disconnect buttons based on whether a token is present.
 * Also fills the hidden manual-input fields so they reflect the current value.
 */
function updateOAuthButtons(tokens: {
    linkedinToken?: string;
    xAccessToken?: string;
    facebookToken?: string;
    redditAccessToken?: string;
}): void {
    const platforms: Array<{ key: keyof typeof tokens; platform: string }> = [
        { key: 'linkedinToken', platform: 'linkedin' },
        { key: 'xAccessToken', platform: 'x' },
        { key: 'facebookToken', platform: 'facebook' },
        { key: 'redditAccessToken', platform: 'reddit' },
    ];
    for (const { key, platform } of platforms) {
        const token = tokens[key] || '';
        const connectBtn = get(`oauthConnect_${platform}`);
        const disconnectBtn = get(`oauthDisconnect_${platform}`);
        if (connectBtn) connectBtn.style.display = token ? 'none' : '';
        if (disconnectBtn) disconnectBtn.style.display = token ? '' : 'none';
    }
}

function updateThemeButton(theme: string): void {
    const btn = get('themeToggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
}

get('languageSelect')?.addEventListener('change', (e) => {
    try {
        const lang = (e.target as HTMLSelectElement).value;
        send('changeLanguage', { language: lang });
        toast(`Language changed to ${lang}`, 'success', 2000);
    } catch (error) {
        console.error('Language change error:', error);
        toast('Failed to change language', 'error');
    }
});

get('themeToggle')?.addEventListener('click', () => {
    try {
        send('toggleTheme');
        toast('Theme toggled', 'success', 1500);
    } catch (error) {
        console.error('Theme toggle error:', error);
        toast('Failed to toggle theme', 'error');
    }
});

get('clearAllCredentialsBtn')?.addEventListener('click', () => {
    try {
        if (confirm('Are you sure you want to clear all saved API keys and configurations? This action cannot be undone.')) {
            send('clearAllCredentials');
            toast('Clearing all credentials...', 'info');
        }
    } catch (error) {
        console.error('Clear credentials error:', error);
        toast('Failed to clear credentials', 'error');
    }
});

// ── Settings: AI Model modal ────────────────────────────────────────────────
get('btn-ai-model')?.addEventListener('click', () => {
    try {
        const modal = get('modelModal');
        if (modal) modal.style.display = 'flex';
    } catch (error) {
        console.error('AI model modal open error:', error);
        toast('Failed to open AI model selector', 'error');
    }
});

get('configureAIBtn')?.addEventListener('click', () => {
    try {
        const modal = get('modelModal');
        if (modal) modal.style.display = 'flex';
    } catch (error) {
        console.error('AI model modal open error:', error);
        toast('Failed to open AI model selector', 'error');
    }
});

// Close modal buttons
document.querySelectorAll<HTMLElement>('[id^="closeModal"], [id^="close-modal-btn"]').forEach(btn => {
    btn.addEventListener('click', () => {
        try {
            const modal = btn.closest('.modal') as HTMLElement | null;
            if (modal) modal.style.display = 'none';
        } catch (error) {
            console.error('Modal close error:', error);
        }
    });
});

// ── Settings: Save buttons ───────────────────────────────────────────────────
document.querySelectorAll<HTMLElement>('[data-save]').forEach(btn => {
    btn.addEventListener('click', () => {
        try {
            const platform = btn.getAttribute('data-save');
            if (!platform) return;

            const val = (id: string) => (get<HTMLInputElement>(id)?.value ?? '').trim();

            switch (platform) {
                case 'linkedin':
                    send('saveLinkedinToken', { linkedinToken: val('linkedinToken') });
                    break;
                case 'telegram':
                    send('saveTelegramCredentials', { telegramBot: val('telegramBot'), telegramChat: val('telegramChat') });
                    break;
                case 'x':
                    send('saveXCredentials', { xAccessToken: val('xAccessToken'), xAccessSecret: val('xAccessSecret') });
                    break;
                case 'facebook':
                    send('saveFacebookToken', { facebookToken: val('facebookToken'), facebookPageToken: val('facebookPageToken'), facebookPageId: val('facebookPageId') });
                    break;
                case 'discord':
                    send('saveDiscordWebhook', { discordWebhookUrl: val('discordWebhook') });
                    break;
                case 'reddit':
                    send('saveRedditCredentials', { redditAccessToken: val('redditAccessToken'), redditRefreshToken: '' });
                    break;
                case 'bluesky':
                    send('saveBlueSkyCredentials', { blueskyIdentifier: val('blueskyIdentifier'), blueskyPassword: val('blueskyPassword') });
                    break;
                case 'devto':
                    send('saveDevToCredentials', { devtoApiKey: val('devtoApiKey') });
                    break;
                case 'medium':
                    send('saveMediumCredentials', { mediumAccessToken: val('mediumAccessToken') });
                    break;
                case 'ai':
                    send('saveAIConfig', { provider: val('cfg-ai-provider'), model: val('cfg-ai-model'), apiKey: val('cfg-ai-key') });
                    break;
            }
            toast(platform + ' settings saved!', 'success');
        } catch (error) {
            console.error('Save button error:', error);
            toast('Failed to save settings', 'error');
        }
    });
});


// ── Settings: AI Model provider tabs ────────────────────────────────────────
document.querySelectorAll<HTMLElement>('.tab-btn[data-provider]').forEach(tab => {
    tab.addEventListener('click', () => {
        try {
            document.querySelectorAll('.tab-btn[data-provider]').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.provider-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = get(tab.getAttribute('data-provider') + 'Panel');
            if (panel) panel.classList.add('active');
        } catch (error) {
            console.error('Tab click error:', error);
        }
    });
});

// Close modals on backdrop click
document.querySelectorAll<HTMLElement>('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        try {
            if (e.target === modal) modal.style.display = 'none';
        } catch (error) {
            console.error('Modal backdrop click error:', error);
        }
    });
});

// Reddit post modal
get('closeRedditPostModal')?.addEventListener('click', () => {
    try {
        const modal = get('redditPostModal');
        if (modal) modal.style.display = 'none';
    } catch (error) {
        console.error('Reddit modal close error:', error);
    }
});

get('cancelRedditPostBtn')?.addEventListener('click', () => {
    try {
        const modal = get('redditPostModal');
        if (modal) modal.style.display = 'none';
    } catch (error) {
        console.error('Reddit cancel error:', error);
    }
});

get('shareRedditPostBtn')?.addEventListener('click', () => {
    try {
        const val = (id: string) => (get<HTMLInputElement>(id)?.value ?? '').trim();
        send('shareToReddit', {
            subreddit: val('redditSubreddit'),
            title: val('redditTitle'),
            flair: val('redditFlair'),
            postType: (document.querySelector<HTMLInputElement>('input[name="redditPostType"]:checked')?.value) || 'self',
            spoiler: get<HTMLInputElement>('redditSpoiler')?.checked || false
        });
        const modal = get('redditPostModal');
        if (modal) modal.style.display = 'none';
        toast('Sharing to Reddit…', 'info');
    } catch (error) {
        console.error('Share to Reddit error:', error);
        toast('Failed to share to Reddit', 'error');
    }
});

// Saved APIs modal
get('closeSavedApisModal')?.addEventListener('click', () => {
    try {
        const modal = get('savedApisModal');
        if (modal) modal.style.display = 'none';
    } catch (error) {
        console.error('Saved APIs modal close error:', error);
    }
});

get('addNewApiSetBtn')?.addEventListener('click', () => {
    try {
        const form = get('editApiForm');
        if (form) form.style.display = 'block';
    } catch (error) {
        console.error('Add API set error:', error);
        toast('Failed to open form', 'error');
    }
});

get('cancelApiEditBtn')?.addEventListener('click', () => {
    try {
        const form = get('editApiForm');
        if (form) form.style.display = 'none';
    } catch (error) {
        console.error('Cancel API edit error:', error);
    }
});

get('saveApiSetBtn')?.addEventListener('click', () => {
    try {
        const name = get<HTMLInputElement>('apiSetName')?.value?.trim();
        if (!name) { toast('Enter a configuration name', 'warning'); return; }
        send('saveApiSet', { name });
        toast('Configuration saved!', 'success');
    } catch (error) {
        console.error('Save API set error:', error);
        toast('Failed to save configuration', 'error');
    }
});

// Subreddit suggestions
document.querySelectorAll<HTMLElement>('.subreddit-suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
        try {
            const subreddit = btn.getAttribute('data-subreddit');
            const input = get<HTMLInputElement>('redditPostSubreddit');
            if (subreddit && input) input.value = subreddit;
        } catch (error) {
            console.error('Subreddit suggestion error:', error);
        }
    });
});


window.addEventListener('message', function (event) {
    try {
        const msg = event.data;
        if (!msg || !msg.command) return;
        switch (msg.command) {
            case 'navigate': {
                if (msg.page) navigateTo(String(msg.page));
                if (msg.options && msg.options.platform) {
                    activeCommandPlatform = String(msg.options.platform);
                    if (btnShare) {
                        const pName = activeCommandPlatform.charAt(0).toUpperCase() + activeCommandPlatform.slice(1);
                        btnShare.textContent = `🚀 Share to ${pName}`;
                    }

                    // Integrated Reddit UI toggle
                    const redditCard = get('reddit-options-card');
                    if (redditCard) {
                        redditCard.style.display = (activeCommandPlatform === 'reddit') ? 'block' : 'none';
                        if (activeCommandPlatform === 'reddit') {
                            const titleInput = get<HTMLInputElement>('redditTitle');
                            const postText = textarea?.value.trim() || '';
                            if (titleInput && !titleInput.value && postText) {
                                titleInput.value = postText.split('\n')[0].substring(0, 300);
                            }
                        }
                    }
                    setBtnLoading('btn-share', false);
                    setBtnLoading('btn-read-md-file', false);
                    setBtnLoading('btn-generate-ai', false);
                } else {
                    activeCommandPlatform = null;
                    if (btnShare) btnShare.textContent = '🚀 Share Now';
                    const redditCard = get('reddit-options-card');
                    if (redditCard) redditCard.style.display = 'none';
                }
                break;
            }
            case 'updatePost':
                if (msg.post && textarea) { textarea.value = String(msg.post); updateCharCounter(); updateShareBtn(); toast('Post updated!', 'success'); }
                if (msg.post) {
                    const blogBodyEl = get<HTMLTextAreaElement>('blog-body');
                    if (blogBodyEl) blogBodyEl.value = String(msg.post);
                }
                updateBlogPublishButtonsState();
                setBtnLoading('btn-generate-ai', false);
                setBtnLoading('btn-share', false);
                if (btnGenerate) { btnGenerate.disabled = false; btnGenerate.textContent = '🧠 Generate with AI'; }
                if (btnShare) {
                    btnShare.disabled = false;
                    btnShare.textContent = activeCommandPlatform ? `🚀 Share to ${activeCommandPlatform.charAt(0).toUpperCase() + activeCommandPlatform.slice(1)}` : '🚀 Share Now';
                }
                break;
            case 'revealBlogPublisher':
                revealBlogPublisherUi();
                break;
            case 'updateBlogFrontmatter': {
                const fm = msg.frontmatter as {
                    title?: string;
                    tags?: string[];
                    description?: string;
                    cover_image?: string;
                    canonical_url?: string;
                    series?: string;
                    published?: boolean;
                };
                if (fm.title) {
                    const el = get<HTMLInputElement>('blog-title');
                    if (el) el.value = fm.title;
                }
                if (fm.tags && fm.tags.length > 0) {
                    const el = get<HTMLInputElement>('blog-tags');
                    if (el) el.value = fm.tags.join(', ');
                }
                if (fm.description) {
                    const el = get<HTMLTextAreaElement>('blog-description');
                    if (el) el.value = fm.description;
                }
                if (fm.cover_image) {
                    const el = get<HTMLInputElement>('blog-cover-image');
                    if (el) el.value = fm.cover_image;
                }
                if (fm.canonical_url) {
                    const el = get<HTMLInputElement>('blog-canonical-url');
                    if (el) el.value = fm.canonical_url;
                }
                if (fm.series) {
                    const el = get<HTMLInputElement>('blog-series');
                    if (el) el.value = fm.series;
                }
                if (fm.published !== undefined) {
                    const v = fm.published ? 'published' : 'draft';
                    const sd = get<HTMLSelectElement>('blog-publish-status-devto');
                    const sm = get<HTMLSelectElement>('blog-publish-status-medium');
                    const legacy = get<HTMLSelectElement>('blog-publish-status');
                    if (sd) sd.value = v;
                    if (sm) sm.value = v;
                    if (legacy) legacy.value = v;
                }
                toast('Frontmatter loaded!', 'success');
                break;
            }
            case 'status':
                toast(String(msg.status || ''), (msg.type as 'success' | 'error' | 'warning' | 'info') || 'info');
                setBtnLoading('btn-share', false);
                setBtnLoading('btn-publish-blog', false);
                setBtnLoading('btn-publish-blog-devto', false);
                setBtnLoading('btn-publish-blog-medium', false);
                setBtnLoading('btn-read-md-file', false);
                setBtnLoading('btn-generate-ai', false);
                if (msg.type === 'error') {
                    resetBlogPublishUi();
                } else if (msg.type === 'success') {
                    // Only reset if it's a completion message (like "Successfully posted")
                    // NOT for "File uploaded successfully" or "Settings saved"
                    const statusLower = String(msg.status || '').toLowerCase();
                    const looksLikeCompletion = statusLower.includes('success') || statusLower.includes('published') || statusLower.includes('shared');
                    const looksLikeIntermediate = statusLower.includes('upload') || statusLower.includes('attach') || statusLower.includes('save');

                    if (looksLikeCompletion && !looksLikeIntermediate) {
                        resetAllComposers();
                    }
                }
                break;
            case 'updateAnalytics': if (msg.analytics) updateAnalytics(msg.analytics as Record<string, unknown>); break;
            case 'updatePostHistory': if (msg.postHistory) renderHistory(msg.postHistory as Array<Record<string, unknown>>); break;
            case 'updateScheduledPosts': if (msg.scheduledPosts) renderScheduledPosts(msg.scheduledPosts as Array<{ id: string; scheduledTime: string; platforms: string[]; postData: { text: string } }>); break;
            case 'shareComplete':
                resetAllComposers();
                break;
            case 'fileUploaded':
            case 'mediaSelected':
                if (msg.mediaPath) {
                    const path = String(msg.mediaPath);
                    const name = String(msg.fileName || 'File');
                    const size = msg.fileSize ? Number(msg.fileSize) : 0;

                    if (msg.threadIndex !== undefined) {
                        const idx = Number(msg.threadIndex);
                        if (threadPosts[idx]) {
                            threadPosts[idx].mediaPath = path;
                            threadPosts[idx].mediaName = name;
                        }
                        const preview = document.querySelector<HTMLElement>(`[data-thread-preview="${idx}"]`);
                        const nameEl = document.querySelector<HTMLElement>(`[data-thread-preview="${idx}"] .thread-media-name`);
                        if (preview) preview.style.display = 'flex';
                        if (nameEl) nameEl.textContent = name;
                        updateThreadShareBtn();
                    } else {
                        activeMediaPath = path;
                        const preview = get('media-preview');
                        const nameEl = get('media-name');
                        const sizeEl = get('media-size');
                        if (preview) preview.style.display = 'block';
                        if (nameEl) nameEl.textContent = name;
                        if (sizeEl && size) {
                            const b = size;
                            sizeEl.textContent = b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
                        }
                    }
                }
                break;
            case 'mediaRemoved':
                activeMediaPath = null;
                break;
            case 'themeChanged':
                if (msg.theme === 'dark') document.body.classList.add('dark');
                else document.body.classList.remove('dark');
                updateThemeButton(String(msg.theme || 'light'));
                break;
            case 'languageChanged':
                if (msg.translations) {
                    const dict = msg.translations as Record<string, string>;
                    document.querySelectorAll('[data-key]').forEach(el => {
                        const key = el.getAttribute('data-key');
                        if (key && dict[key]) {
                            if (el.tagName === 'INPUT') (el as HTMLInputElement).placeholder = dict[key];
                            else el.textContent = dict[key];
                        }
                    });
                }
                break;
            case 'updateConfiguration':
                if (msg.linkedinToken !== undefined) { const e = get<HTMLInputElement>('linkedinToken'); if (e) e.value = String(msg.linkedinToken); }
                if (msg.telegramBot !== undefined) { const e = get<HTMLInputElement>('telegramBot'); if (e) e.value = String(msg.telegramBot); }
                if (msg.telegramChat !== undefined) { const e = get<HTMLInputElement>('telegramChat'); if (e) e.value = String(msg.telegramChat); }
                if (msg.xAccessToken !== undefined) { const e = get<HTMLInputElement>('xAccessToken'); if (e) e.value = String(msg.xAccessToken); }
                if (msg.xAccessSecret !== undefined) { const e = get<HTMLInputElement>('xAccessSecret'); if (e) e.value = String(msg.xAccessSecret); }
                if (msg.facebookToken !== undefined) { const e = get<HTMLInputElement>('facebookToken'); if (e) e.value = String(msg.facebookToken); }
                if (msg.facebookPageToken !== undefined) { const e = get<HTMLInputElement>('facebookPageToken'); if (e) e.value = String(msg.facebookPageToken); }
                if (msg.facebookPageId !== undefined) { const e = get<HTMLInputElement>('facebookPageId'); if (e) e.value = String(msg.facebookPageId); }
                if (msg.discordWebhookUrl !== undefined) { const e = get<HTMLInputElement>('discordWebhook'); if (e) e.value = String(msg.discordWebhookUrl); }
                if (msg.redditAccessToken !== undefined) { const e = get<HTMLInputElement>('redditAccessToken'); if (e) e.value = String(msg.redditAccessToken); }
                if (msg.blueskyIdentifier !== undefined) { const e = get<HTMLInputElement>('blueskyIdentifier'); if (e) e.value = String(msg.blueskyIdentifier); }
                if (msg.blueskyPassword !== undefined) { const e = get<HTMLInputElement>('blueskyPassword'); if (e) e.value = String(msg.blueskyPassword); }
                if (msg.devtoApiKey !== undefined) { const e = get<HTMLInputElement>('devtoApiKey'); if (e) e.value = String(msg.devtoApiKey); }
                if (msg.mediumAccessToken !== undefined) { const e = get<HTMLInputElement>('mediumAccessToken'); if (e) e.value = String(msg.mediumAccessToken); }
                if (msg.theme !== undefined) {
                    if (msg.theme === 'dark') document.body.classList.add('dark');
                    else document.body.classList.remove('dark');
                    updateThemeButton(String(msg.theme));
                }
                if (msg.language !== undefined) {
                    const sel = get<HTMLSelectElement>('languageSelect');
                    if (sel) sel.value = String(msg.language);
                }
                // Update OAuth Connect/Disconnect buttons based on token presence
                updateOAuthButtons({
                    linkedinToken: msg.linkedinToken as string | undefined,
                    xAccessToken: msg.xAccessToken as string | undefined,
                    facebookToken: msg.facebookToken as string | undefined,
                    redditAccessToken: msg.redditAccessToken as string | undefined,
                });
                if (msg.translations) {
                    const dict = msg.translations as Record<string, string>;
                    document.querySelectorAll('[data-key]').forEach(el => {
                        const key = el.getAttribute('data-key');
                        if (key && dict[key]) {
                            if (el.tagName === 'INPUT') (el as HTMLInputElement).placeholder = dict[key];
                            else el.textContent = dict[key];
                        }
                    });
                }
                checkCredentials(msg);
                break;
            case 'savedApisLoaded':
                if (msg.platform && msg.savedApis) {
                    const apis = msg.savedApis as Array<{ id: string; name: string; isDefault?: boolean }>;
                    const listEl = get('savedApisList');
                    if (listEl) {
                        if (!apis.length) {
                            listEl.innerHTML = '<div class="no-saved-apis"><p>No saved API configurations yet.</p></div>';
                        } else {
                            listEl.innerHTML = apis.map(api => `
                                <div class="saved-api-item">
                                    <div class="saved-api-info">
                                        <span class="saved-api-name">${api.name}</span>
                                        ${api.isDefault ? '<span style="color: var(--success); font-size: 10px;">Default</span>' : ''}
                                    </div>
                                    <div class="saved-api-actions">
                                        <button class="btn btn-sm btn-secondary" onclick="send('loadApiConfig', {apiId: '${api.id}'})">Load</button>
                                        <button class="btn btn-sm btn-ghost" onclick="send('deleteApiConfig', {apiId: '${api.id}'})">Delete</button>
                                    </div>
                                </div>
                            `).join('');
                        }
                    }
                    const modal = get('savedApisModal');
                    if (modal) modal.style.display = 'flex';
                }
                break;
        }
    } catch (error) {
        console.error('Message handler error:', error);
    }
});

try {
    send('loadConfiguration');
    send('loadPostHistory');
    send('loadScheduledPosts');
    updateShareBtn();
    console.log('[DotShare WebView] Initialized');
} catch (error) {
    console.error('[DotShare WebView] Initialization error:', error);
    toast('Failed to initialize webview', 'error');
}