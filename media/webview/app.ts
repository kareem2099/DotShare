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
    (typeof window !== 'undefined' && (window as unknown as Window & { __vscode?: VsCodeApi }).__vscode) ||
    (typeof globalThis !== 'undefined' && (globalThis as unknown as { vscode?: VsCodeApi }).vscode) ||
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

// ── Messages from Extension ──────────────────────────────────────────────────
type WebviewMessage =
    | { command: 'navigate'; page: string; options?: { platform?: string } }
    | { command: 'updatePost'; post: string }
    | { command: 'revealBlogPublisher' }
    | { command: 'updateBlogFrontmatter'; frontmatter: Record<string, unknown> }
    | { command: 'status'; status: string; type?: 'success' | 'error' | 'warning' | 'info' }
    | { command: 'updateAnalytics'; analytics: Record<string, unknown> }
    | { command: 'updatePostHistory'; postHistory: Array<Record<string, unknown>> }
    | { command: 'updateScheduledPosts'; scheduledPosts: Array<Record<string, unknown>> }
    | { command: 'shareComplete' }
    | { command: 'fileUploaded' | 'mediaSelected'; mediaPath: string; fileName: string; fileSize?: number; threadIndex?: number }
    | { command: 'mediaAttached'; mediaFiles?: Array<{ mediaPath: string; fileName: string; fileSize?: number }> }
    | { command: 'mediaRemoved' }
    | { command: 'themeChanged'; theme: 'light' | 'dark' }
    | { command: 'languageChanged'; translations: Record<string, string> }
    | { command: 'updateConfiguration';[key: string]: unknown };

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

/**
 * Optimizes and compresses an image using HTML5 Canvas.
 * Resizes if dimensions > 2000px and reduces quality to 0.8 JPEG.
 */
async function processAndCompressImage(file: File): Promise<{ base64Data: string, size: number, type: string, name: string }> {
    // Skip compression for non-images or animated GIFs
    if (!file.type.startsWith('image/') || file.type === 'image/gif') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
                base64Data: (reader.result as string).split(',')[1],
                size: file.size,
                type: file.type,
                name: file.name
            });
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            const MAX_DIM = 2000;
            if (width > MAX_DIM || height > MAX_DIM) {
                if (width > height) {
                    height *= MAX_DIM / width;
                    width = MAX_DIM;
                } else {
                    width *= MAX_DIM / height;
                    height = MAX_DIM;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG with 0.8 quality
            const mimeType = 'image/jpeg';
            const dataUrl = canvas.toDataURL(mimeType, 0.8);
            const base64Data = dataUrl.split(',')[1];
            
            // Approximate size from base64 (3/4 of string length)
            const compressedSize = Math.floor(base64Data.length * 0.75);

            // Change extension to .jpg if it was something else (e.g. .png)
            let finalName = file.name;
            if (!finalName.toLowerCase().endsWith('.jpg') && !finalName.toLowerCase().endsWith('.jpeg')) {
                finalName = finalName.replace(/\.[^/.]+$/, "") + ".jpg";
            }
            
            resolve({ base64Data, size: compressedSize, type: mimeType, name: finalName });
        };
        img.onerror = () => reject(new Error('Failed to load image for compression'));
    });
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
function checkCredentials(config: Record<string, unknown>): void {
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

        // 5. Unlock and reset all composer controls
        setComposerLocked(false);
        setBtnLoading('btn-share', false);
        setBtnLoading('btn-generate-ai', false);
        setBtnLoading('btn-read-md-file', false);

        // Full reset for thread share button (disabled + text + loading class)
        const threadBtn = get<HTMLButtonElement>('btn-share-thread');
        if (threadBtn) {
            threadBtn.classList.remove('loading');
            threadBtn.disabled = false;
            threadBtn.textContent = '🚀 Share Thread';
        }

        activeMediaPaths = [];

        if (btnShare) {
            btnShare.disabled = true;
            btnShare.textContent = activeCommandPlatform ? `🚀 Share to ${activeCommandPlatform.charAt(0).toUpperCase() + activeCommandPlatform.slice(1)}` : '🚀 Share Now';
        }

        resetBlogPublishUi();

        // 6. Clear Main Media Grid
        const mainGrid = get('main-media-grid');
        if (mainGrid) mainGrid.innerHTML = '';
        const countInfo = get('media-count-info');
        if (countInfo) countInfo.textContent = '';

        // 7. Reset Thread Composer back to a single empty post
        if (threadContainer) {
            // Remove all existing thread post elements from DOM
            threadContainer.innerHTML = '';

            // Reset the logical array to one empty post
            threadPosts.length = 0;
            threadPosts.push({ text: '', mediaFilePaths: [] });

            // Rebuild the first post HTML (matches the template in btnAddThreadPost handler)
            const maxChars = window.__PLATFORM_DATA__?.maxChars || 280;
            const firstPostHtml = `
        <div class="thread-post" data-thread-index="0">
            <div class="thread-post-header">
                <span class="thread-post-label">Post 1</span>
                <span class="thread-char-counter" data-thread-counter="0">0 / ${maxChars}</span>
                <button class="btn btn-ghost btn-sm btn-remove-thread-post" data-remove-index="0">✕</button>
            </div>
            <textarea class="thread-textarea" data-thread-textarea="0" placeholder="What's on your mind?" rows="3"></textarea>
            <div class="thread-post-actions">
                <button class="btn btn-ghost btn-sm thread-media-btn" data-thread-media="0">📎 Media</button>
                <input type="file" class="thread-file-input" data-thread-file="0"
                    accept="image/jpeg,image/png,image/gif,image/webp,video/mp4" style="display:none;" multiple />
                <div class="thread-media-preview" data-thread-preview="0" style="display:none;">
                    <span class="thread-media-name"></span>
                    <button class="btn btn-ghost btn-sm thread-remove-media" data-thread-remove="0">✕</button>
                </div>
            </div>
        </div>
    `;
            const div = document.createElement('div');
            div.innerHTML = firstPostHtml.trim();
            const firstChild = div.firstChild;
            if (firstChild) threadContainer.appendChild(firstChild);

            // Re-wire events for the fresh first post
            wireThreadPostEvents(0);
        }

        updateThreadShareBtn();

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
const btnMedia = get<HTMLButtonElement>('btn-attach-media');
const btnRemMedia = get<HTMLButtonElement>('btn-remove-media');

function updateCharCounter(): void {
    if (!textarea || !counter) return;
    const len = textarea.value.length;
    const platform = activeCommandPlatform || '';
    // Priority: 1. Extension Data, 2. Local Fallback
    const maxChars = window.__PLATFORM_DATA__?.maxChars || (platform && MAX_CHARS[platform] ? MAX_CHARS[platform] : null);

    counter.textContent = maxChars ? `${len}/${maxChars}` : String(len);
    counter.className = 'compose-counter';

    // Apply warning/error classes based on character limit
    if (maxChars) {
        const warnThreshold = Math.floor(maxChars * 0.8);
        const errorThreshold = maxChars;
        if (len > errorThreshold) {
            counter.classList.add('error');
        } else if (len > warnThreshold) {
            counter.classList.add('warn');
        }
    }
}

function updateShareBtn(): void {
    if (!btnShare) return;
    if (!textarea?.value.trim().length) {
        btnShare.disabled = true;
        return;
    }
    // Disable if exceeds max chars for the platform
    const platform = activeCommandPlatform || '';
    const maxChars = window.__PLATFORM_DATA__?.maxChars || (platform && MAX_CHARS[platform] ? MAX_CHARS[platform] : null);
    btnShare.disabled = maxChars ? textarea.value.length > maxChars : false;
}

textarea?.addEventListener('input', () => { updateCharCounter(); updateShareBtn(); });

function renderMediaGrid(): void {
    const grid = get('main-media-grid');
    if (!grid) return;
    grid.innerHTML = '';

    activeMediaPaths.forEach((path, idx) => {
        const item = document.createElement('div');
        item.className = 'media-item';
        // Simple visual optimization: use icons or tiny previews
        item.innerHTML = `
            <img src="${path}" class="media-thumb" />
            <button class="media-remove-btn" data-idx="${idx}">✕</button>
        `;
        item.querySelector('.media-remove-btn')?.addEventListener('click', () => {
            activeMediaPaths.splice(idx, 1);
            renderMediaGrid();
            const countInfo = get('media-count-info');
            if (countInfo) {
                const count = activeMediaPaths.length;
                countInfo.textContent = count === 0 ? '' : count === 1 ? '1 file selected' : `${count} files selected`;
            }
            if (activeMediaPaths.length === 0) {
                const preview = get('media-preview');
                if (preview) preview.style.display = 'none';
            }
        });
        grid.appendChild(item);
    });
}

// Pro teaser — track interest clicks
get('btn-pro-multipost')?.addEventListener('click', () => {
    try {
        send('proFeatureInterest', { feature: 'multi-platform-posting' });
        toast('🌟 Multi-Platform Posting is coming in the Pro version! Stay tuned.', 'info', 6000);
    } catch (error) {
        console.error('Pro button error:', error);
    }
});

let activeCommandPlatform: string | null = null;
let activeMediaPaths: string[] = [];

// ── Threads Composer ────────────────────────────────────────────────────────
const threadContainer = get('thread-posts');
const btnAddThreadPost = get<HTMLButtonElement>('btn-add-thread-post');
const btnShareThread = get<HTMLButtonElement>('btn-share-thread');

const threadPosts: Array<{ text: string, mediaFilePaths: string[] }> = [
    { text: '', mediaFilePaths: [] }
];

function updateThreadCharCounter(index: number): void {
    const el = document.querySelector<HTMLElement>(`[data-thread-counter="${index}"]`);
    const ta = document.querySelector<HTMLTextAreaElement>(`[data-thread-textarea="${index}"]`);
    if (el && ta) {
        const len = ta.value.length;
        const maxChars = window.__PLATFORM_DATA__?.maxChars || 280;
        el.textContent = `${len} / ${maxChars}`;

        // Reset and apply classes
        el.classList.remove('warn', 'error');
        const warnThreshold = Math.floor(maxChars * 0.8);
        if (len > maxChars) {
            el.classList.add('error');
        } else if (len > warnThreshold) {
            el.classList.add('warn');
        }
    }
}

function updateThreadShareBtn(): void {
    const btnShareThread = get<HTMLButtonElement>('btn-share-thread');
    if (!btnShareThread) return;
    const hasAnyContent = threadPosts.some(p => p.text.trim().length > 0 || (p.mediaFilePaths && p.mediaFilePaths.length > 0));

    // Disable if any post exceeds max chars for the platform
    const maxChars = window.__PLATFORM_DATA__?.maxChars || 280;
    const isTooLong = threadPosts.some(p => p.text.length > maxChars);

    btnShareThread.disabled = !hasAnyContent || isTooLong;
}

/**
 * Locks or unlocks all composer inputs during a share operation.
 * Prevents the user from editing content or triggering a second share
 * while one is already in progress.
 */
function setComposerLocked(locked: boolean): void {
    // Main textarea + media
    if (textarea) textarea.disabled = locked;
    if (btnMedia) btnMedia.disabled = locked;
    if (btnRemMedia) btnRemMedia.disabled = locked;
    if (fileInput) fileInput.disabled = locked;

    // Thread: add-post button
    if (btnAddThreadPost) btnAddThreadPost.disabled = locked;

    // Thread: all internal controls
    document.querySelectorAll<HTMLTextAreaElement>('.thread-textarea').forEach(ta => {
        ta.disabled = locked;
    });
    document.querySelectorAll<HTMLButtonElement>('.thread-media-btn, .thread-remove-media, .btn-remove-thread-post').forEach(btn => {
        btn.disabled = locked;
    });
    document.querySelectorAll<HTMLInputElement>('.thread-file-input').forEach(inp => {
        inp.disabled = locked;
    });

    // Blog fields
    const blogBody = get<HTMLTextAreaElement>('blog-body');
    if (blogBody) blogBody.disabled = locked;
    ['blog-title', 'blog-tags', 'blog-description', 'blog-cover-image', 'blog-canonical-url', 'blog-series'].forEach(id => {
        const el = get<HTMLInputElement | HTMLTextAreaElement>(id);
        if (el) el.disabled = locked;
    });
}

btnAddThreadPost?.addEventListener('click', () => {
    const index = threadPosts.length;
    threadPosts.push({ text: '', mediaFilePaths: [] });

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
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4" style="display:none;" multiple />
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
        const firstChild = div.firstChild;
        if (firstChild) {
            threadContainer.appendChild(firstChild);
        }
        wireThreadPostEvents(index);
        reIndexThreads();
    }
});

/**
 * Ensures thread labels and data attributes are consistent after additions/removals.
 * v3.1.0 — "The Robust Re-indexer"
 */
function reIndexThreads(): void {
    const posts = document.querySelectorAll('.thread-post');
    posts.forEach((p, i) => {
        const el = p as HTMLElement;
        el.setAttribute('data-thread-index', String(i));
        const label = el.querySelector('.thread-post-label');
        if (label) label.textContent = `Post ${i + 1}`;

        // Update attribute targets for internal elements
        const ta = el.querySelector('.thread-textarea');
        if (ta) ta.setAttribute('data-thread-textarea', String(i));

        const counter = el.querySelector('.thread-char-counter');
        if (counter) counter.setAttribute('data-thread-counter', String(i));

        const remBtn = el.querySelector('.btn-remove-thread-post');
        if (remBtn) remBtn.setAttribute('data-remove-index', String(i));
    });

    // Update global array lengths if necessary or handle mapping
    // Note: threadPosts array must stay in sync with DOM for simple sharing logic
}

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
        const files = fileInp?.files;
        if (!files || files.length === 0) return;

        const MAX_IMAGES = 4;
        const existing = threadPosts[index]?.mediaFilePaths?.length ?? 0;
        const remaining = MAX_IMAGES - existing;

        if (remaining <= 0) {
            toast(`⚠️ You can only attach up to ${MAX_IMAGES} images per post.`, 'warning');
            if (fileInp) fileInp.value = '';
            return;
        }

        // Process up to remaining slots (total cap = 4)
        const filesToProcess = Array.from(files).slice(0, remaining);

        if (Array.from(files).length > remaining) {
            toast(`⚠️ Only ${remaining} more image(s) allowed. Extra files were skipped.`, 'warning', 5000);
        }

        filesToProcess.forEach(async file => {
            const isLarge = file.size > 2 * 1024 * 1024;
            if (isLarge && !file.type.match(/video|gif/i)) {
                toast(`✨ Optimizing ${file.name}...`, "info", 3000);
            }

            try {
                const { base64Data, size, type, name } = await processAndCompressImage(file);
                send('uploadFile', {
                    file: { name, size, type, base64Data },
                    threadIndex: index
                });
            } catch (err) {
                console.error('Compression error:', err);
                // Fallback to original
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    send('uploadFile', {
                        file: { name: file.name, size: file.size, type: file.type, base64Data: base64 },
                        threadIndex: index
                    });
                };
                reader.readAsDataURL(file);
            }
        });

        // Update UI preview state (will be finalized when fileUploaded messages arrive)
        const preview = document.querySelector<HTMLElement>(`[data-thread-preview="${index}"]`);
        const nameEl = document.querySelector<HTMLElement>(`[data-thread-preview="${index}"] .thread-media-name`);
        if (preview) preview.style.display = 'flex';
        if (nameEl) {
            const total = existing + filesToProcess.length;
            nameEl.textContent = total === 1 ? filesToProcess[0].name : `${total} files selected`;
        }
    });

    remMediaBtn?.addEventListener('click', () => {
        threadPosts[index].mediaFilePaths = [];
        const preview = document.querySelector<HTMLElement>(`[data-thread-preview="${index}"]`);
        if (preview) preview.style.display = 'none';
        if (fileInp) fileInp.value = '';
        updateThreadShareBtn();
    });

    remPostBtn?.addEventListener('click', () => {
        const el = document.querySelector(`.thread-post[data-thread-index="${index}"]`);
        if (el) el.remove();

        // Remove from the logical array to ensure share payload is correct
        threadPosts.splice(index, 1);

        reIndexThreads();
        updateThreadShareBtn();
    });
}

// Initial wire up for first post
wireThreadPostEvents(0);

btnShareThread?.addEventListener('click', () => {
    try {
        const validPosts = threadPosts.filter(p => p.text.trim() || (p.mediaFilePaths && p.mediaFilePaths.length > 0));
        if (validPosts.length === 0) { toast('Thread is empty', 'warning'); return; }

        // Lock the whole UI so user can't edit or re-submit
        setComposerLocked(true);
        btnShareThread.classList.add('loading');
        btnShareThread.disabled = true;
        btnShareThread.textContent = '⏳ Sharing Thread…';

        send('shareThread', {
            platform: activeCommandPlatform || (window as unknown as { __AUTO_THREAD_PLATFORM__?: string }).__AUTO_THREAD_PLATFORM__,
            posts: validPosts.map(p => ({
                text: p.text,
                mediaFilePaths: p.mediaFilePaths || []
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

        // Lock the whole UI so user can't edit or re-submit
        setComposerLocked(true);
        btnShare.classList.add('loading');
        btnShare.disabled = true;
        btnShare.textContent = '⏳ Sharing…';

        const platforms = activeCommandPlatform ? [activeCommandPlatform] : [];
        const payload: Record<string, unknown> = {
            post: text,
            platforms,
            mediaFilePaths: activeMediaPaths || []
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

        // Process up to 4 files
        const filesToProcess = Array.from(files).slice(0, 4);

        filesToProcess.forEach(async file => {
            const isLarge = file.size > 2 * 1024 * 1024;
            if (isLarge && !file.type.match(/video|gif/i)) {
                toast(`✨ Optimizing ${file.name}...`, "info", 3000);
            }

            try {
                const { base64Data, size, type, name } = await processAndCompressImage(file);
                send('uploadFile', {
                    file: { name, size, type, base64Data }
                });
            } catch (err) {
                console.error('Compression error:', err);
                // Fallback to original
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    send('uploadFile', {
                        file: { name: file.name, size: file.size, type: file.type, base64Data: base64 }
                    });
                };
                reader.readAsDataURL(file);
            }
        });

        // Show preview
        const preview = get('media-preview');
        const countInfo = get('media-count-info');
        if (preview) preview.style.display = 'block';
        if (countInfo) {
            const count = filesToProcess.length;
            const totalSize = filesToProcess.reduce((acc, f) => acc + f.size, 0);
            const sizeStr = totalSize < 1024 ? totalSize + ' B' : totalSize < 1048576 ? (totalSize / 1024).toFixed(1) + ' KB' : (totalSize / 1048576).toFixed(1) + ' MB';
            countInfo.textContent = count === 1 ? `${filesToProcess[0].name} (${sizeStr})` : `${count} files selected (${sizeStr})`;
        }
    } catch (error) {
        console.error('File input handler error:', error);
        toast('Failed to process file', 'error');
    }
});
get('btn-remove-all-media')?.addEventListener('click', () => {
    try {
        const preview = get('media-preview');
        if (preview) preview.style.display = 'none';
        if (fileInput) fileInput.value = '';
        const mainGrid = get('main-media-grid');
        if (mainGrid) mainGrid.innerHTML = '';
        const countInfo = get('media-count-info');
        if (countInfo) countInfo.textContent = '';
        activeMediaPaths = [];
        send('removeMedia');
    } catch (error) {
        console.error('Remove all media error:', error);
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

// Update Reddit form fields based on target type (subreddit vs user)
get<HTMLInputElement>('redditSubreddit')?.addEventListener('input', () => {
    try {
        const subredditInput = get<HTMLInputElement>('redditSubreddit');
        const titleGroup = document.querySelector('[for="redditTitle"]')?.closest('.input-group') as HTMLElement | null;
        const flairGroup = document.querySelector('[for="redditFlair"]')?.closest('.input-group') as HTMLElement | null;

        let postTypeGroup: HTMLElement | null = null;
        const allLabels = document.querySelectorAll('label');
        for (let i = 0; i < allLabels.length; i++) {
            if (allLabels[i].textContent?.includes('Post Type')) {
                const parent = allLabels[i].closest('.input-group');
                if (parent instanceof HTMLElement) {
                    postTypeGroup = parent;
                }
                break;
            }
        }

        const spoilerCheckbox = document.querySelector('[for="redditSpoiler"]')?.closest('.checkbox-group') as HTMLElement | null;
        const emptySmall = document.querySelector('[for="redditSubreddit"]')?.nextElementSibling as HTMLElement | null;

        if (subredditInput && titleGroup && flairGroup && spoilerCheckbox) {
            const target = subredditInput.value.trim().toLowerCase();
            const isUserDM = target.startsWith('u/');

            // Logic simplification v3.1.0:
            // Backend is the Single Source of Truth for target parsing.
            // UI only updates labels for UX clarity.

            // Show/hide fields based on target type
            titleGroup.style.display = isUserDM ? 'none' : 'flex';
            flairGroup.style.display = isUserDM ? 'none' : 'flex';
            if (postTypeGroup instanceof HTMLElement) {
                postTypeGroup.style.display = isUserDM ? 'none' : 'flex';
            }
            spoilerCheckbox.style.display = isUserDM ? 'none' : 'flex';

            // Update label and help text
            const label = document.querySelector('label[for="redditSubreddit"]') as HTMLElement | null;
            if (label) {
                label.textContent = isUserDM ? 'Reddit Username' : 'Subreddit';
            }

            if (emptySmall) {
                emptySmall.textContent = isUserDM
                    ? 'Submit a post to your profile timeline'
                    : 'Select the subreddit where you want to post';
            }
        }
    } catch (error) {
        console.error('Reddit field toggle error:', error);
    }
});

get('shareRedditPostBtn')?.addEventListener('click', () => {
    try {
        const val = (id: string) => (get<HTMLInputElement>(id)?.value ?? '').trim();
        const postText = textarea?.value.trim() || '';
        const subredditField = val('redditSubreddit');

        // Validate target is provided
        if (!subredditField) {
            toast('Please enter a subreddit (r/...) or username (u/...)', 'error');
            return;
        }

        const isUserPost = subredditField.toLowerCase().startsWith('u/');

        // Validate required fields based on target type
        if (!isUserPost && !val('redditTitle')) {
            toast('Please enter a post title for subreddit posts', 'error');
            return;
        }

        send('shareToReddit', {
            post: postText,
            redditSubreddit: subredditField,
            redditTitle: val('redditTitle'),  // Subject for DMs, Title for posts
            redditFlairId: get<HTMLSelectElement>('redditFlair')?.value || '',
            redditPostType: document.querySelector<HTMLInputElement>('input[name="redditPostType"]:checked')?.value || 'self',
            redditSpoiler: get<HTMLInputElement>('redditSpoiler')?.checked || false
        });
        const modal = get('redditPostModal');
        if (modal) modal.style.display = 'none';
        toast(`Sharing to Reddit…`, 'info');
    } catch (error) {
        console.error('Share to Reddit error:', error);
        toast('Failed to share to Reddit', 'error');
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


window.addEventListener('message', function (event: MessageEvent<WebviewMessage>) {
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
                // On error: unlock the UI immediately so user can try again
                if (msg.type === 'error') {
                    setComposerLocked(false);
                    setBtnLoading('btn-share', false);
                    setBtnLoading('btn-publish-blog', false);
                    setBtnLoading('btn-publish-blog-devto', false);
                    setBtnLoading('btn-publish-blog-medium', false);
                    setBtnLoading('btn-read-md-file', false);
                    setBtnLoading('btn-generate-ai', false);
                    const tBtn = get<HTMLButtonElement>('btn-share-thread');
                    if (tBtn) {
                        tBtn.classList.remove('loading');
                        tBtn.disabled = false;
                        tBtn.textContent = '🚀 Share Thread';
                    }
                    resetBlogPublishUi();
                } else {
                    // For info/success/warning: only unlock non-share buttons (intermediate status)
                    setBtnLoading('btn-read-md-file', false);
                    setBtnLoading('btn-generate-ai', false);
                }
                break;
            case 'updateAnalytics': if (msg.analytics) updateAnalytics(msg.analytics as Record<string, unknown>); break;
            case 'updatePostHistory': if (msg.postHistory) renderHistory(msg.postHistory as Array<Record<string, unknown>>); break;
            case 'updateScheduledPosts': if (msg.scheduledPosts) renderScheduledPosts(msg.scheduledPosts as Array<{ id: string; scheduledTime: string; platforms: string[]; postData: { text: string } }>); break;
            case 'shareComplete':
                // Definitive signal: sharing finished (success or error already toasted)
                // Unlock + full reset
                resetAllComposers();
                break;
            case 'fileUploaded':
            case 'mediaSelected':
                if (msg.mediaPath) {
                    const path = String(msg.mediaPath);
                    const name = String(msg.fileName || 'File');
                    const size = msg.fileSize ? Number(msg.fileSize) : 0;

                    // Warning for large files (> 2MB)
                    const isLargeFile = size > 2 * 1024 * 1024;
                    const warningText = isLargeFile ? ' ⚠️ (Auto-compressed for Bluesky)' : '';

                    if (msg.threadIndex !== undefined) {
                        const idx = Number(msg.threadIndex);
                        if (threadPosts[idx]) {
                            if (!threadPosts[idx].mediaFilePaths) threadPosts[idx].mediaFilePaths = [];
                            const MAX_IMAGES = 4;
                            if (threadPosts[idx].mediaFilePaths.length >= MAX_IMAGES) {
                                toast(`⚠️ Post ${idx + 1} already has ${MAX_IMAGES} images attached. Extra image skipped.`, 'warning');
                            } else {
                                threadPosts[idx].mediaFilePaths.push(path);
                            }
                        }
                        const preview = document.querySelector<HTMLElement>(`[data-thread-preview="${idx}"]`);
                        const nameEl = document.querySelector<HTMLElement>(`[data-thread-preview="${idx}"] .thread-media-name`);
                        if (preview) preview.style.display = 'flex';
                        if (nameEl) {
                            const count = threadPosts[idx]?.mediaFilePaths?.length ?? 0;
                            nameEl.textContent = count === 1 ? name + warningText : `${count} files selected`;
                        }
                        updateThreadShareBtn();
                    } else {
                        if (!activeMediaPaths) activeMediaPaths = [];
                        activeMediaPaths.push(path);
                        renderMediaGrid();

                        const preview = get('media-preview');
                        const countInfo = get('media-count-info');
                        if (preview) preview.style.display = 'block';

                        if (countInfo) {
                            const count = activeMediaPaths.length;
                            let sizeStr = '';
                            if (size) {
                                sizeStr = size < 1024 ? size + ' B' : size < 1048576 ? (size / 1024).toFixed(1) + ' KB' : (size / 1048576).toFixed(1) + ' MB';
                                sizeStr = ` (${sizeStr}${warningText})`;
                            }
                            countInfo.textContent = count === 1 ? name + sizeStr : `${count} files selected`;
                        }

                        if (isLargeFile && activeMediaPaths.length === 1) {
                            toast('Image > 2MB. It will be optimized automatically for Bluesky.', 'info', 6000);
                        }
                    }
                }
                break;
            case 'mediaAttached': {
                // mediaAttached carries an array of files (e.g. from VS Code file-picker)
                const attachedFiles = msg.mediaFiles;
                if (attachedFiles && Array.isArray(attachedFiles)) {
                    const MAX_IMAGES = 4;
                    const toAdd = attachedFiles.slice(0, MAX_IMAGES - activeMediaPaths.length);
                    toAdd.forEach(f => activeMediaPaths.push(f.mediaPath));
                    renderMediaGrid();
                    if (attachedFiles.length > toAdd.length) {
                        toast(`⚠️ Only ${MAX_IMAGES} images allowed. Extra files were skipped.`, 'warning');
                    }
                    const preview = get('media-preview');
                    const countInfo = get('media-count-info');
                    if (preview) preview.style.display = 'block';
                    if (countInfo) countInfo.textContent = activeMediaPaths.length === 1 ? toAdd[0].fileName : `${activeMediaPaths.length} files selected`;
                }
                break;
            }
            case 'mediaRemoved':
                activeMediaPaths = [];
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
