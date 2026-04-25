/**
 * DotShare — platform-post.html Script
 * Compiled by esbuild → media/webview/app.js
 *
 * Scope: This file handles ONLY what platform-post.html needs:
 *   - Social Composer (text, media, Reddit options)
 *   - Thread Composer (X / Bluesky)
 *   - Blog Publisher (Dev.to / Medium)
 *   - AI Model modal
 *   - Message handler from the extension host
 */

// Force TypeScript to treat this as a module (no cross-file collisions).
export { };

declare const acquireVsCodeApi: () => { postMessage(msg: unknown): void };

interface VsCodeApi { postMessage(msg: unknown): void; }

const vscode: VsCodeApi =
    (typeof window !== 'undefined' && (window as { __vscode?: VsCodeApi }).__vscode) ||
    (typeof globalThis !== 'undefined' && (globalThis as { vscode?: VsCodeApi }).vscode) ||
    acquireVsCodeApi();

// ── Platform data injected by the HTML inline script ─────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function send(command: string, payload: Record<string, unknown> = {}): void {
    try { vscode.postMessage({ command, ...payload }); }
    catch (e) { console.error(`[DotShare] send '${command}' failed:`, e); }
}

function get<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', ms = 4000): void {
    const container = get('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    const icons: Record<string, string> = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    el.innerHTML = `<span>${icons[type]}</span><span>${escHtml(msg)}</span><button class="toast-close">✕</button><div class="toast-progress" style="animation-duration:${ms}ms"></div>`;
    el.querySelector('.toast-close')?.addEventListener('click', () => el.remove());
    container.appendChild(el);
    if (ms > 0) setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }, ms);
}

function setBtnLoading(id: string, loading: boolean): void {
    const btn = get<HTMLButtonElement>(id);
    if (btn) btn.classList.toggle('loading', loading);
}

// ── Image compression ─────────────────────────────────────────────────────────
async function processAndCompressImage(file: File): Promise<{ base64Data: string; size: number; type: string; name: string }> {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ base64Data: (reader.result as string).split(',')[1], size: file.size, type: file.type, name: file.name });
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
            let { width, height } = img;
            const MAX = 2000;
            if (width > MAX || height > MAX) {
                if (width > height) { height *= MAX / width; width = MAX; }
                else { width *= MAX / height; height = MAX; }
            }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('No canvas context')); return; }
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const base64Data = dataUrl.split(',')[1];
            let name = file.name;
            if (!name.toLowerCase().match(/\.(jpg|jpeg)$/)) name = name.replace(/\.[^/.]+$/, '') + '.jpg';
            resolve({ base64Data, size: Math.floor(base64Data.length * 0.75), type: 'image/jpeg', name });
        };
        img.onerror = () => reject(new Error('Failed to load image'));
    });
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        const shareBtn = get<HTMLButtonElement>('btn-share');
        if (shareBtn && !shareBtn.disabled && !shareBtn.classList.contains('loading')) shareBtn.click();
        const threadBtn = get<HTMLButtonElement>('btn-share-thread');
        if (threadBtn && !threadBtn.disabled && !threadBtn.classList.contains('loading')) threadBtn.click();
    }
    if (e.ctrlKey && e.key === 'l') {
        const readBtn = get<HTMLButtonElement>('btn-read-md-file');
        if (readBtn && !readBtn.disabled) { e.preventDefault(); readBtn.click(); }
    }
});

// ── State ─────────────────────────────────────────────────────────────────────
let activeCommandPlatform: string | null = null;
let activeMediaPaths: string[] = [];

// ── Max chars fallback map ────────────────────────────────────────────────────
const MAX_CHARS_MAP: Record<string, number> = {
    x: 280, bluesky: 300, linkedin: 3000, telegram: 4096,
    facebook: 63206, discord: 2000, reddit: 40000, devto: 100000, medium: 100000,
};

// ── Compose Area ──────────────────────────────────────────────────────────────
const textarea  = get<HTMLTextAreaElement>('post-text');
const counter   = get('char-counter');
const btnShare  = get<HTMLButtonElement>('btn-share');
const btnGen    = get<HTMLButtonElement>('btn-generate-ai');
const btnMedia  = get<HTMLButtonElement>('btn-attach-media');
const fileInput = get<HTMLInputElement>('media-file-input');

function updateCharCounter(): void {
    if (!textarea || !counter) return;
    const len = textarea.value.length;
    const max = window.__PLATFORM_DATA__?.maxChars || (activeCommandPlatform && MAX_CHARS_MAP[activeCommandPlatform]) || null;
    counter.textContent = max ? `${len}/${max}` : String(len);
    counter.className = 'compose-counter';
    if (max) {
        if (len > max) counter.classList.add('error');
        else if (len > Math.floor(max * 0.8)) counter.classList.add('warn');
    }
}

function updateShareBtn(): void {
    if (!btnShare) return;
    if (!textarea?.value.trim()) { btnShare.disabled = true; return; }
    const max = window.__PLATFORM_DATA__?.maxChars || (activeCommandPlatform && MAX_CHARS_MAP[activeCommandPlatform]) || null;
    btnShare.disabled = max ? textarea.value.length > max : false;
}

textarea?.addEventListener('input', () => { updateCharCounter(); updateShareBtn(); });

// ── Media Grid ────────────────────────────────────────────────────────────────
function renderMediaGrid(): void {
    const grid = get('main-media-grid');
    if (!grid) return;
    grid.innerHTML = '';
    activeMediaPaths.forEach((path, idx) => {
        const item = document.createElement('div');
        item.className = 'media-item';
        item.innerHTML = `<img src="${path}" class="media-thumb" /><button class="media-remove-btn" data-idx="${idx}">✕</button>`;
        item.querySelector('.media-remove-btn')?.addEventListener('click', () => {
            activeMediaPaths.splice(idx, 1);
            renderMediaGrid();
            const ci = get('media-count-info');
            if (ci) ci.textContent = activeMediaPaths.length === 0 ? '' : activeMediaPaths.length === 1 ? '1 file selected' : `${activeMediaPaths.length} files selected`;
            if (activeMediaPaths.length === 0) { const p = get('media-preview'); if (p) p.style.display = 'none'; }
        });
        grid.appendChild(item);
    });
}

// Attach media button
btnMedia?.addEventListener('click', () => { if (fileInput) fileInput.click(); });

fileInput?.addEventListener('change', () => {
    const files = fileInput?.files;
    if (!files || !files.length) return;
    Array.from(files).slice(0, 4).forEach(async file => {
        const isLarge = file.size > 2 * 1024 * 1024;
        if (isLarge && !file.type.match(/video|gif/i)) toast(`✨ Optimizing ${file.name}...`, 'info', 3000);
        try {
            const { base64Data, size, type, name } = await processAndCompressImage(file);
            send('uploadFile', { file: { name, size, type, base64Data } });
        } catch {
            const reader = new FileReader();
            reader.onload = () => { const b64 = (reader.result as string).split(',')[1]; send('uploadFile', { file: { name: file.name, size: file.size, type: file.type, base64Data: b64 } }); };
            reader.readAsDataURL(file);
        }
    });
    const preview = get('media-preview');
    const ci = get('media-count-info');
    if (preview) preview.style.display = 'block';
    if (ci) { const c = Math.min(files.length, 4); ci.textContent = c === 1 ? files[0].name : `${c} files selected`; }
});

get('btn-remove-all-media')?.addEventListener('click', () => {
    const preview = get('media-preview');
    if (preview) preview.style.display = 'none';
    if (fileInput) fileInput.value = '';
    const grid = get('main-media-grid');
    if (grid) grid.innerHTML = '';
    const ci = get('media-count-info');
    if (ci) ci.textContent = '';
    activeMediaPaths = [];
    send('removeMedia');
});

// Save draft button (Social)
get('btn-save-draft')?.addEventListener('click', () => {
    const text = textarea?.value.trim() || '';
    if (!text) { toast('Draft cannot be empty.', 'warning'); return; }
    send('saveLocalDraft', {
        draftId: activeDraftId,
        draft: {
            type: 'social',
            title: text.substring(0, 30) + (text.length > 30 ? '…' : ''),
            platforms: [activeCommandPlatform ?? ''].filter(Boolean),
            data: { text, media: activeMediaPaths }
        }
    });
    toast(activeDraftId ? 'Draft updated!' : 'Draft saved!', 'success');
});

// ── Share Button ──────────────────────────────────────────────────────────────
btnShare?.addEventListener('click', () => {
    const text = textarea?.value.trim();
    if (!text) { toast('Write something first', 'warning'); return; }
    setComposerLocked(true);
    btnShare.classList.add('loading');
    btnShare.disabled = true;
    btnShare.textContent = '⏳ Sharing…';
    const platforms = activeCommandPlatform ? [activeCommandPlatform] : [];
    const payload: Record<string, unknown> = { post: text, platforms, mediaFilePaths: activeMediaPaths };
    if (activeCommandPlatform === 'reddit') {
        const val = (id: string) => (get<HTMLInputElement>(id)?.value ?? '').trim();
        const subreddit = val('redditSubreddit');
        if (!subreddit) { toast('Please enter a subreddit (e.g. r/programming)', 'warning'); setComposerLocked(false); btnShare.disabled = false; btnShare.textContent = '🚀 Share to Reddit'; btnShare.classList.remove('loading'); return; }
        payload.redditMetadata = { subreddit, title: val('redditTitle') || text.split('\n')[0].substring(0, 300), flair: get<HTMLSelectElement>('redditFlair')?.value || '', postType: document.querySelector<HTMLInputElement>('input[name="redditPostType"]:checked')?.value || 'self', spoiler: get<HTMLInputElement>('redditSpoiler')?.checked ?? false };
    }
    send('share', payload);
});

// ── AI Generate ───────────────────────────────────────────────────────────────
btnGen?.addEventListener('click', () => {
    send('generatePost', { post: textarea?.value.trim() || '', platform: activeCommandPlatform || 'general' });
    toast('Generating…', 'info');
    if (btnGen) { btnGen.disabled = true; btnGen.textContent = '⏳ Generating…'; }
});

// Generate AI Threads button
get('btn-generate-ai-threads')?.addEventListener('click', () => {
    send('generatePost', { post: '', platform: activeCommandPlatform || 'x' });
    toast('Generating thread…', 'info');
});

// ── Composer Lock ─────────────────────────────────────────────────────────────
function setComposerLocked(locked: boolean): void {
    if (textarea) textarea.disabled = locked;
    if (btnMedia) btnMedia.disabled = locked;
    if (fileInput) fileInput.disabled = locked;
    if (btnAddThread) btnAddThread.disabled = locked;
    document.querySelectorAll<HTMLTextAreaElement>('.thread-textarea').forEach(ta => ta.disabled = locked);
    document.querySelectorAll<HTMLButtonElement>('.thread-media-btn, .thread-remove-media, .btn-remove-thread-post').forEach(b => b.disabled = locked);
    document.querySelectorAll<HTMLInputElement>('.thread-file-input').forEach(i => i.disabled = locked);
    const blogBody = get<HTMLTextAreaElement>('blog-body');
    if (blogBody) blogBody.disabled = locked;
    ['blog-title', 'blog-tags', 'blog-description', 'blog-cover-image', 'blog-canonical-url', 'blog-series'].forEach(id => {
        const el = get<HTMLInputElement | HTMLTextAreaElement>(id);
        if (el) el.disabled = locked;
    });
}

function resetAllComposers(): void {
    if (textarea) { textarea.value = ''; updateCharCounter(); updateShareBtn(); }
    ['blog-body', 'blog-title', 'blog-tags', 'blog-description', 'blog-cover-image', 'blog-canonical-url', 'blog-series', 'redditSubreddit', 'redditTitle'].forEach(id => { const el = get<HTMLInputElement | HTMLTextAreaElement>(id); if (el) el.value = ''; });
    const preview = get('media-preview');
    if (preview) preview.style.display = 'none';
    const grid = get('main-media-grid');
    if (grid) grid.innerHTML = '';
    activeMediaPaths = [];
    setComposerLocked(false);
    setBtnLoading('btn-share', false);
    setBtnLoading('btn-generate-ai', false);
    setBtnLoading('btn-read-md-file', false);
    if (btnShare) { btnShare.disabled = true; btnShare.textContent = activeCommandPlatform ? `🚀 Share to ${activeCommandPlatform.charAt(0).toUpperCase() + activeCommandPlatform.slice(1)}` : '🚀 Share Now'; }
    const tBtn = get<HTMLButtonElement>('btn-share-thread');
    if (tBtn) { tBtn.classList.remove('loading'); tBtn.disabled = false; tBtn.textContent = '🚀 Share Thread'; }
    resetBlogPublishUi();
    // Reset thread composer
    if (threadContainer) {
        threadContainer.innerHTML = '';
        threadPosts.length = 0;
        threadPosts.push({ text: '', mediaFilePaths: [] });
        const maxChars = window.__PLATFORM_DATA__?.maxChars || 280;
        const div = document.createElement('div');
        div.innerHTML = `<div class="thread-post" data-thread-index="0"><div class="thread-post-header"><span class="thread-post-label">Post 1</span><span class="thread-char-counter" data-thread-counter="0">0 / ${maxChars}</span><button class="btn btn-ghost btn-sm btn-remove-thread-post" data-remove-index="0">✕</button></div><textarea class="thread-textarea" data-thread-textarea="0" placeholder="What's on your mind?" rows="3"></textarea><div class="thread-post-actions"><button class="btn btn-ghost btn-sm thread-media-btn" data-thread-media="0">📎 Media</button><input type="file" class="thread-file-input" data-thread-file="0" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4" style="display:none;" multiple /><div class="thread-media-preview" data-thread-preview="0" style="display:none;"><span class="thread-media-name"></span><button class="btn btn-ghost btn-sm thread-remove-media" data-thread-remove="0">✕</button></div></div></div>`.trim();
        const first = div.firstChild;
        if (first) threadContainer.appendChild(first);
        wireThreadPostEvents(0);
    }
    updateThreadShareBtn();
}

// ── Blog Publisher ────────────────────────────────────────────────────────────
const BLOG_LABEL_DEVTO  = '🚀 Publish to Dev.to';
const BLOG_LABEL_MEDIUM = '🚀 Publish to Medium';

function revealBlogPublisherUi(): void {
    const preview = get('blog-preview');
    if (preview) preview.style.display = 'block';
    const card = get('blog-platforms-card');
    const actions = get('blog-actions');
    if (card) card.style.display = 'block';
    if (actions) actions.style.display = 'flex';
    updateBlogPublishButtonsState();
}

function getBlogBodyText(): string {
    return get<HTMLTextAreaElement>('blog-body')?.value.trim() || get<HTMLTextAreaElement>('post-text')?.value.trim() || '';
}

function getSingleBlogPlatform(): 'devto' | 'medium' | null {
    const v = get<HTMLInputElement>('blog-single-platform')?.value?.trim();
    return v === 'devto' || v === 'medium' ? v : null;
}

function updateBlogPublishButtonsState(): void {
    const has = getBlogBodyText().length > 0;
    (['btn-publish-blog-devto', 'btn-publish-blog-medium', 'btn-publish-blog'] as const).forEach(id => {
        const b = get<HTMLButtonElement>(id);
        if (b) b.disabled = !has;
    });
}

function resetBlogPublishUi(): void {
    const has = getBlogBodyText().length > 0;
    const bDev = get<HTMLButtonElement>('btn-publish-blog-devto');
    if (bDev) { setBtnLoading('btn-publish-blog-devto', false); bDev.disabled = !has; bDev.textContent = BLOG_LABEL_DEVTO; }
    const bMed = get<HTMLButtonElement>('btn-publish-blog-medium');
    if (bMed) { setBtnLoading('btn-publish-blog-medium', false); bMed.disabled = !has; bMed.textContent = BLOG_LABEL_MEDIUM; }
}

function sendBlogShare(platform: 'devto' | 'medium', publishStatus: string): void {
    const body = getBlogBodyText();
    if (!body) { toast('No article body to publish. Read a Markdown file first.', 'warning'); return; }
    send('shareBlog', {
        platforms: [platform], post: body,
        title: get<HTMLInputElement>('blog-title')?.value.trim(),
        tags: get<HTMLInputElement>('blog-tags')?.value.trim().split(',').map(t => t.trim()).filter(Boolean),
        description: get<HTMLTextAreaElement>('blog-description')?.value.trim(),
        coverImage: get<HTMLInputElement>('blog-cover-image')?.value.trim() || undefined,
        canonicalUrl: get<HTMLInputElement>('blog-canonical-url')?.value.trim() || undefined,
        series: get<HTMLInputElement>('blog-series')?.value.trim() || undefined,
        publishStatus, published: publishStatus === 'published',
    });
    toast('Publishing article…', 'info');
}

function wireBlogPublishButton(btn: HTMLButtonElement | null, platform: 'devto' | 'medium', getStatus: () => string): void {
    if (!btn) return;
    btn.addEventListener('click', () => {
        try {
            btn.disabled = true; btn.textContent = '⏳ Publishing…';
            sendBlogShare(platform, getStatus() || 'draft');
        } catch {
            toast('Failed to publish article', 'error');
            resetBlogPublishUi();
        }
    });
}

get('btn-read-md-file')?.addEventListener('click', () => {
    get<HTMLButtonElement>('btn-read-md-file')?.classList.add('loading');
    send('readMarkdownFile');
    toast('Reading current file…', 'info', 2000);
});

get('btn-reset-blog-md')?.addEventListener('click', () => {
    send('resetBlogMarkdown');
    toast('Resetting to boilerplate…', 'info');
});

get<HTMLTextAreaElement>('blog-body')?.addEventListener('input', () => updateBlogPublishButtonsState());

wireBlogPublishButton(get<HTMLButtonElement>('btn-publish-blog-devto'), 'devto', () => get<HTMLSelectElement>('blog-publish-status-devto')?.value || 'draft');
wireBlogPublishButton(get<HTMLButtonElement>('btn-publish-blog-medium'), 'medium', () => get<HTMLSelectElement>('blog-publish-status-medium')?.value || 'draft');

const singlePlat = getSingleBlogPlatform();
if (singlePlat) wireBlogPublishButton(get<HTMLButtonElement>('btn-publish-blog'), singlePlat, () => get<HTMLSelectElement>('blog-publish-status')?.value || 'draft');

// Save Draft (Article)
get('btn-save-draft-blog-devto')?.addEventListener('click', () => {
    const body = getBlogBodyText();
    if (!body) { toast('Draft cannot be empty.', 'warning'); return; }
    const title = get<HTMLInputElement>('blog-title')?.value.trim() || 'Untitled Article';
    send('saveLocalDraft', {
        draftId: activeDraftId,
        draft: {
            type: 'article',
            title,
            platforms: ['devto'],
            data: {
                title,
                bodyMarkdown: body,
                tags: get<HTMLInputElement>('blog-tags')?.value.trim().split(',').map(t => t.trim()).filter(Boolean),
                description: get<HTMLTextAreaElement>('blog-description')?.value.trim(),
                coverImage: get<HTMLInputElement>('blog-cover-image')?.value.trim(),
                canonicalUrl: get<HTMLInputElement>('blog-canonical-url')?.value.trim(),
                status: 'draft'
            }
        }
    });
    toast(activeDraftId ? 'Draft updated!' : 'Draft saved!', 'success');
});

// ── Thread Composer ───────────────────────────────────────────────────────────
const threadContainer = get('thread-posts');
const btnAddThread   = get<HTMLButtonElement>('btn-add-thread-post');
const btnShareThread = get<HTMLButtonElement>('btn-share-thread');

const threadPosts: Array<{ text: string; mediaFilePaths: string[] }> = [
    { text: '', mediaFilePaths: [] }
];

function updateThreadCharCounter(index: number): void {
    const el = document.querySelector<HTMLElement>(`[data-thread-counter="${index}"]`);
    const ta = document.querySelector<HTMLTextAreaElement>(`[data-thread-textarea="${index}"]`);
    if (!el || !ta) return;
    const len = ta.value.length;
    const max = window.__PLATFORM_DATA__?.maxChars || 280;
    el.textContent = `${len} / ${max}`;
    el.classList.remove('warn', 'error');
    if (len > max) el.classList.add('error');
    else if (len > Math.floor(max * 0.8)) el.classList.add('warn');
}

function updateThreadShareBtn(): void {
    if (!btnShareThread) return;
    const max = window.__PLATFORM_DATA__?.maxChars || 280;
    const hasContent = threadPosts.some(p => p.text.trim() || p.mediaFilePaths.length > 0);
    const tooLong = threadPosts.some(p => p.text.length > max);
    btnShareThread.disabled = !hasContent || tooLong;
}

function reIndexThreads(): void {
    document.querySelectorAll<HTMLElement>('.thread-post').forEach((p, i) => {
        p.setAttribute('data-thread-index', String(i));
        const label = p.querySelector('.thread-post-label');
        if (label) label.textContent = `Post ${i + 1}`;
        p.querySelector('.thread-textarea')?.setAttribute('data-thread-textarea', String(i));
        p.querySelector('.thread-char-counter')?.setAttribute('data-thread-counter', String(i));
        p.querySelector('.btn-remove-thread-post')?.setAttribute('data-remove-index', String(i));
    });
}

function wireThreadPostEvents(index: number): void {
    const ta        = document.querySelector<HTMLTextAreaElement>(`[data-thread-textarea="${index}"]`);
    const mediaBtn  = document.querySelector<HTMLButtonElement>(`[data-thread-media="${index}"]`);
    const fileInp   = document.querySelector<HTMLInputElement>(`[data-thread-file="${index}"]`);
    const remMedia  = document.querySelector<HTMLButtonElement>(`[data-thread-remove="${index}"]`);
    const remPost   = document.querySelector<HTMLButtonElement>(`[data-remove-index="${index}"]`);

    ta?.addEventListener('input', () => { if (threadPosts[index]) threadPosts[index].text = ta.value; updateThreadCharCounter(index); updateThreadShareBtn(); });
    mediaBtn?.addEventListener('click', () => fileInp?.click());

    fileInp?.addEventListener('change', () => {
        const files = fileInp?.files;
        if (!files || !files.length) return;
        const MAX = 4;
        const existing = threadPosts[index]?.mediaFilePaths.length ?? 0;
        const remaining = MAX - existing;
        if (remaining <= 0) { toast(`⚠️ Max ${MAX} images per post.`, 'warning'); if (fileInp) fileInp.value = ''; return; }
        const toProcess = Array.from(files).slice(0, remaining);
        if (files.length > remaining) toast(`⚠️ Only ${remaining} more image(s) allowed. Extra files skipped.`, 'warning', 5000);
        toProcess.forEach(async file => {
            const isLarge = file.size > 2 * 1024 * 1024;
            if (isLarge && !file.type.match(/video|gif/i)) toast(`✨ Optimizing ${file.name}...`, 'info', 3000);
            try {
                const { base64Data, size, type, name } = await processAndCompressImage(file);
                send('uploadFile', { file: { name, size, type, base64Data }, threadIndex: index });
            } catch {
                const reader = new FileReader();
                reader.onload = () => { const b64 = (reader.result as string).split(',')[1]; send('uploadFile', { file: { name: file.name, size: file.size, type: file.type, base64Data: b64 }, threadIndex: index }); };
                reader.readAsDataURL(file);
            }
        });
        const preview = document.querySelector<HTMLElement>(`[data-thread-preview="${index}"]`);
        const nameEl  = document.querySelector<HTMLElement>(`[data-thread-preview="${index}"] .thread-media-name`);
        if (preview) preview.style.display = 'flex';
        if (nameEl) { const total = existing + toProcess.length; nameEl.textContent = total === 1 ? toProcess[0].name : `${total} files selected`; }
    });

    remMedia?.addEventListener('click', () => {
        if (threadPosts[index]) threadPosts[index].mediaFilePaths = [];
        const preview = document.querySelector<HTMLElement>(`[data-thread-preview="${index}"]`);
        if (preview) preview.style.display = 'none';
        if (fileInp) fileInp.value = '';
        updateThreadShareBtn();
    });

    remPost?.addEventListener('click', () => {
        document.querySelector(`.thread-post[data-thread-index="${index}"]`)?.remove();
        threadPosts.splice(index, 1);
        reIndexThreads();
        updateThreadShareBtn();
    });
}

// Wire first thread post
wireThreadPostEvents(0);

btnAddThread?.addEventListener('click', () => {
    const index = threadPosts.length;
    threadPosts.push({ text: '', mediaFilePaths: [] });
    const max = window.__PLATFORM_DATA__?.maxChars || 280;
    const div = document.createElement('div');
    div.innerHTML = `<div class="thread-post" data-thread-index="${index}"><div class="thread-post-header"><span class="thread-post-label">Post ${index + 1}</span><span class="thread-char-counter" data-thread-counter="${index}">0 / ${max}</span><button class="btn btn-ghost btn-sm btn-remove-thread-post" data-remove-index="${index}">✕</button></div><textarea class="thread-textarea" data-thread-textarea="${index}" placeholder="What's on your mind?" rows="3"></textarea><div class="thread-post-actions"><button class="btn btn-ghost btn-sm thread-media-btn" data-thread-media="${index}">📎 Media</button><input type="file" class="thread-file-input" data-thread-file="${index}" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4" style="display:none;" multiple /><div class="thread-media-preview" data-thread-preview="${index}" style="display:none;"><span class="thread-media-name"></span><button class="btn btn-ghost btn-sm thread-remove-media" data-thread-remove="${index}">✕</button></div></div></div>`.trim();
    const first = div.firstChild;
    if (first && threadContainer) { threadContainer.appendChild(first); wireThreadPostEvents(index); reIndexThreads(); }
});

btnShareThread?.addEventListener('click', () => {
    const valid = threadPosts.filter(p => p.text.trim() || p.mediaFilePaths.length > 0);
    if (!valid.length) { toast('Thread is empty', 'warning'); return; }
    setComposerLocked(true);
    if (btnShareThread) { btnShareThread.classList.add('loading'); btnShareThread.disabled = true; btnShareThread.textContent = '⏳ Sharing Thread…'; }
    send('shareThread', {
        platform: activeCommandPlatform || (window as { __AUTO_THREAD_PLATFORM__?: string }).__AUTO_THREAD_PLATFORM__,
        posts: valid.map(p => ({ text: p.text, mediaFilePaths: p.mediaFilePaths }))
    });
});

// ── AI Model Modal ────────────────────────────────────────────────────────────
get('btn-ai-model')?.addEventListener('click', () => { const m = get('modelModal'); if (m) m.style.display = 'flex'; });

document.querySelectorAll<HTMLElement>('[id^="closeModal"], [id^="close-modal-btn"]').forEach(btn => {
    btn.addEventListener('click', () => { const m = btn.closest('.modal') as HTMLElement | null; if (m) m.style.display = 'none'; });
});

get('applyModelBtn')?.addEventListener('click', () => {
    const panel = document.querySelector('.provider-panel.active');
    if (!panel) return;
    const provider = panel.id.replace('Panel', '');
    const keyInput = panel.querySelector<HTMLInputElement>('input[type="password"]');
    const modelSel = panel.querySelector<HTMLSelectElement>('select');
    if (keyInput && modelSel) {
        send('applyModelSelection', { provider, model: modelSel.value, apiKey: keyInput.value });
        toast('AI model applied!', 'success');
        const m = get('modelModal'); if (m) m.style.display = 'none';
    }
});

document.querySelectorAll<HTMLElement>('.tab-btn[data-provider]').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn[data-provider]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.provider-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = get((tab.getAttribute('data-provider') ?? '') + 'Panel');
        if (panel) panel.classList.add('active');
    });
});

// Close modals on backdrop click
document.querySelectorAll<HTMLElement>('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
});

// Reddit subreddit input: show/hide fields for DM vs subreddit
get<HTMLInputElement>('redditSubreddit')?.addEventListener('input', () => {
    const input = get<HTMLInputElement>('redditSubreddit');
    const isDM = (input?.value.trim().toLowerCase() || '').startsWith('u/');
    (['[for="redditTitle"]', '[for="redditFlair"]', '[for="redditSpoiler"]'] as const).forEach(sel => {
        const group = document.querySelector(sel)?.closest('.input-group, .checkbox-group') as HTMLElement | null;
        if (group) group.style.display = isDM ? 'none' : '';
    });
});

// ── Message Handler ───────────────────────────────────────────────────────────
window.addEventListener('message', (event: MessageEvent) => {
    try {
        const msg = event.data as Record<string, unknown>;
        if (!msg?.command) return;

        switch (msg.command) {

            case 'navigate': {
                // platform-post panels receive navigate to set the active platform
                if ((msg.options as { platform?: string })?.platform) {
                    activeCommandPlatform = String((msg.options as { platform?: string }).platform);
                    if (btnShare) btnShare.textContent = `🚀 Share to ${activeCommandPlatform.charAt(0).toUpperCase() + activeCommandPlatform.slice(1)}`;
                    const redditCard = get('reddit-options-card');
                    if (redditCard) redditCard.style.display = activeCommandPlatform === 'reddit' ? 'block' : 'none';
                    setBtnLoading('btn-share', false);
                    setBtnLoading('btn-read-md-file', false);
                    setBtnLoading('btn-generate-ai', false);
                } else {
                    activeCommandPlatform = null;
                    if (btnShare) btnShare.textContent = '🚀 Share Now';
                }
                break;
            }

            case 'updatePost':
                if (msg.post && textarea) { textarea.value = String(msg.post); updateCharCounter(); updateShareBtn(); }
                if (msg.post) { const b = get<HTMLTextAreaElement>('blog-body'); if (b) b.value = String(msg.post); }
                updateBlogPublishButtonsState();
                setBtnLoading('btn-generate-ai', false);
                setBtnLoading('btn-share', false);
                if (btnGen) { btnGen.disabled = false; btnGen.textContent = '🧠 Generate with AI'; }
                if (btnShare) { btnShare.disabled = false; btnShare.textContent = activeCommandPlatform ? `🚀 Share to ${activeCommandPlatform.charAt(0).toUpperCase() + activeCommandPlatform.slice(1)}` : '🚀 Share Now'; }
                toast('Post updated!', 'success');
                break;

            case 'revealBlogPublisher':
                revealBlogPublisherUi();
                break;

            case 'updateBlogFrontmatter': {
                interface BlogFrontmatter {
                    title?: string;
                    tags?: string[];
                    description?: string;
                    cover_image?: string;
                    canonical_url?: string;
                    series?: string;
                    published?: boolean;
                }
                const fm = msg.frontmatter as BlogFrontmatter;
                if (!fm) break;
                const eTitle = get<HTMLInputElement>('blog-title'); if (eTitle) eTitle.value = fm.title || '';
                const eTags = get<HTMLInputElement>('blog-tags'); if (eTags) eTags.value = fm.tags?.length ? fm.tags.join(', ') : '';
                const eDesc = get<HTMLTextAreaElement>('blog-description'); if (eDesc) eDesc.value = fm.description || '';
                const eCover = get<HTMLInputElement>('blog-cover-image'); if (eCover) eCover.value = fm.cover_image || '';
                const eUrl = get<HTMLInputElement>('blog-canonical-url'); if (eUrl) eUrl.value = fm.canonical_url || '';
                const eSeries = get<HTMLInputElement>('blog-series'); if (eSeries) eSeries.value = fm.series || '';
                if (fm.published !== undefined) {
                    const v = fm.published ? 'published' : 'draft';
                    [get<HTMLSelectElement>('blog-publish-status-devto'), get<HTMLSelectElement>('blog-publish-status-medium'), get<HTMLSelectElement>('blog-publish-status')].forEach(s => { if (s) s.value = v; });
                }
                toast('Frontmatter loaded!', 'success');
                break;
            }

            case 'status':
                toast(String(msg.status || ''), (msg.type as 'success' | 'error' | 'warning' | 'info') || 'info');
                if (msg.type === 'error') {
                    setComposerLocked(false);
                    ['btn-share', 'btn-publish-blog', 'btn-publish-blog-devto', 'btn-publish-blog-medium', 'btn-read-md-file', 'btn-generate-ai'].forEach(id => setBtnLoading(id, false));
                    const tBtn = get<HTMLButtonElement>('btn-share-thread');
                    if (tBtn) { tBtn.classList.remove('loading'); tBtn.disabled = false; tBtn.textContent = '🚀 Share Thread'; }
                    resetBlogPublishUi();
                } else if (msg.type === 'success') {
                    // Reset ALL composers after a successful share/publish
                    resetAllComposers();
                    activeDraftId = undefined;
                } else {
                    // info / warning — only reset utility buttons
                    setBtnLoading('btn-read-md-file', false);
                    setBtnLoading('btn-generate-ai', false);
                }
                break;

            case 'shareComplete':
                resetAllComposers();
                activeDraftId = undefined;
                break;

            case 'blogShareComplete': {
                // Only reset publish buttons — preserve article content so user can see what they published
                resetBlogPublishUi();
                setComposerLocked(false);
                setBtnLoading('btn-read-md-file', false);
                const platform = String(msg.platform || '');
                const url = msg.url ? String(msg.url) : '';
                const platformLabel = platform === 'devto' ? 'Dev.to' : platform === 'medium' ? 'Medium' : platform;
                const successMsg = url
                    ? `Successfully published to ${platformLabel}! 🎉 ${url}`
                    : `Successfully published to ${platformLabel}! 🎉`;
                toast(successMsg, 'success', 8000);
                break;
            }

            case 'fileUploaded':
            case 'mediaSelected': {
                if (!msg.mediaPath) break;
                const path = String(msg.mediaPath);
                const name = String(msg.fileName || 'File');
                const size = msg.fileSize ? Number(msg.fileSize) : 0;
                const isLarge = size > 2 * 1024 * 1024;
                const warn = isLarge ? ' ⚠️ (Auto-compressed)' : '';
                if (msg.threadIndex !== undefined) {
                    const idx = Number(msg.threadIndex);
                    if (threadPosts[idx]) {
                        if (!threadPosts[idx].mediaFilePaths) threadPosts[idx].mediaFilePaths = [];
                        const MAX = 4;
                        if (threadPosts[idx].mediaFilePaths.length >= MAX) { toast(`⚠️ Post ${idx + 1} already has ${MAX} images. Extra skipped.`, 'warning'); }
                        else threadPosts[idx].mediaFilePaths.push(path);
                    }
                    const preview = document.querySelector<HTMLElement>(`[data-thread-preview="${idx}"]`);
                    const nameEl  = document.querySelector<HTMLElement>(`[data-thread-preview="${idx}"] .thread-media-name`);
                    if (preview) preview.style.display = 'flex';
                    if (nameEl) { const c = threadPosts[idx]?.mediaFilePaths.length ?? 0; nameEl.textContent = c === 1 ? name + warn : `${c} files selected`; }
                    updateThreadShareBtn();
                } else {
                    if (!activeMediaPaths) activeMediaPaths = [];
                    activeMediaPaths.push(path);
                    renderMediaGrid();
                    const preview = get('media-preview');
                    const ci      = get('media-count-info');
                    if (preview) preview.style.display = 'block';
                    if (ci) {
                        const count = activeMediaPaths.length;
                        const sizeStr = size ? ` (${size < 1048576 ? (size / 1024).toFixed(1) + ' KB' : (size / 1048576).toFixed(1) + ' MB'}${warn})` : '';
                        ci.textContent = count === 1 ? name + sizeStr : `${count} files selected`;
                    }
                    if (isLarge && activeMediaPaths.length === 1) toast('Image > 2MB. It will be auto-compressed.', 'info', 6000);
                }
                break;
            }

            case 'mediaAttached': {
                const files = msg.mediaFiles as Array<{ mediaPath: string; fileName: string }> | undefined;
                if (files?.length) {
                    const MAX = 4;
                    const toAdd = files.slice(0, MAX - activeMediaPaths.length);
                    toAdd.forEach(f => activeMediaPaths.push(f.mediaPath));
                    renderMediaGrid();
                    if (files.length > toAdd.length) toast(`⚠️ Only ${MAX} images allowed. Extra skipped.`, 'warning');
                    const preview = get('media-preview');
                    const ci      = get('media-count-info');
                    if (preview) preview.style.display = 'block';
                    if (ci) ci.textContent = activeMediaPaths.length === 1 ? toAdd[0].fileName : `${activeMediaPaths.length} files selected`;
                }
                break;
            }

            case 'mediaRemoved':
                activeMediaPaths = [];
                break;

            case 'themeChanged':
                if (msg.theme === 'dark') document.body.classList.add('dark');
                else document.body.classList.remove('dark');
                break;

            case 'draftsLoaded': {
                const loadingEl = get('drafts-loading');
                if (loadingEl) loadingEl.style.display = 'none';
                renderDrafts((msg.drafts as DraftItem[]) ?? [], 'drafts-list', 'drafts-empty');
                break;
            }

            case 'remoteDraftsLoaded': {
                const remoteList = get('remote-drafts-list');
                if (remoteList) remoteList.style.display = 'flex';
                const remoteDrafts = (msg.drafts as DraftItem[]) ?? [];
                renderDrafts(remoteDrafts, 'remote-drafts-list');
                toast(`Fetched ${remoteDrafts.length} remote drafts`, 'success');
                break;
            }

            case 'draftLoaded': {
                const d = msg.draft as DraftItem | undefined;
                if (d) {
                    if (d.type === 'article') {
                        const body = get<HTMLTextAreaElement>('blog-body');
                        const title = get<HTMLInputElement>('blog-title');
                        const tags = get<HTMLInputElement>('blog-tags');
                        const desc = get<HTMLTextAreaElement>('blog-description');
                        const cover = get<HTMLInputElement>('blog-cover-image');
                        const canUrl = get<HTMLInputElement>('blog-canonical-url');
                        
                        if (body) body.value = d.data.bodyMarkdown ?? d.data.text ?? '';
                        if (title && d.title) title.value = d.title;
                        const articleData = d.data as { tags?: string[]; description?: string; coverImage?: string; canonicalUrl?: string };
                        if (tags && articleData.tags) tags.value = (articleData.tags).join(', ');
                        if (desc && articleData.description) desc.value = articleData.description;
                        if (cover && articleData.coverImage) cover.value = articleData.coverImage;
                        if (canUrl && articleData.canonicalUrl) canUrl.value = articleData.canonicalUrl;
                        
                        revealBlogPublisherUi();
                        updateBlogPublishButtonsState();
                        toast('Draft loaded into article composer', 'info');
                    } else {
                        const postText = get<HTMLTextAreaElement>('post-text');
                        if (postText) postText.value = d.data.text ?? '';
                        updateShareBtn();
                        toast('Draft loaded', 'info');
                    }
                }
                break;
            }
        }
    } catch (e) {
        console.error('[DotShare] Message handler error:', e);
    }
});

// ── Render Drafts ────────────────────────────────────────────
interface DraftItem {
    id: string;
    type: 'social' | 'article';
    title?: string;
    timestamp: string;
    platforms: string[];
    isRemote?: boolean;
    remoteId?: string;
    data: { bodyMarkdown?: string; text?: string; status?: string };
}

// Track which draft is currently loaded so re-saving updates instead of duplicating
let activeDraftId: string | undefined;

function escapeHtml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderDrafts(drafts: DraftItem[], containerId: string, emptyId?: string): void {
    const list = get(containerId);
    if (!list) return;

    // Filter drafts for current platform
    const platformDef = window.__PLATFORM_DATA__;
    const currentPlatform = platformDef ? platformDef.platform : '';
    
    // Only show drafts that include the current platform, or have no platforms (generic local draft)
    const filteredDrafts = drafts.filter(d => 
        !d.platforms || d.platforms.length === 0 || d.platforms.includes(currentPlatform)
    );

    if (!filteredDrafts || filteredDrafts.length === 0) {
        list.style.display = 'none';
        if (emptyId) {
            const empty = get(emptyId);
            if (empty) empty.style.display = 'block';
        }
        return;
    }

    if (emptyId) {
        const empty = get(emptyId);
        if (empty) empty.style.display = 'none';
    }

    list.style.display = 'flex';
    list.innerHTML = filteredDrafts.map(d => {
        const date = new Date(d.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const title = escapeHtml(d.title || (d.data?.text ?? d.data?.bodyMarkdown ?? 'Untitled').substring(0, 50));
        const platforms = d.platforms?.join(', ') || 'local';
        const typeClass = d.type === 'article' ? 'article' : '';
        const isActive = d.id === activeDraftId;
        const badge = `<span class="draft-badge ${typeClass}">${d.type}</span>${d.isRemote ? '<span class="draft-badge remote">remote</span>' : ''}${isActive ? '<span class="draft-badge" style="background:var(--accent-primary,#6c63ff);color:#fff">active</span>' : ''}`;

        return `
            <div class="draft-card${isActive ? ' draft-card--active' : ''}" data-draft-id="${d.id}" data-type="${d.type}" data-remote="${!!d.isRemote}" data-remote-id="${d.remoteId ?? ''}">
                <div class="draft-card-title">${title}</div>
                <div class="draft-card-meta">${badge} ${platforms} · ${date}</div>
                <div class="draft-card-actions">
                    <button class="btn btn-secondary btn-sm" data-action="edit-draft" data-id="${d.id}">✏️ Load</button>
                    ${!d.isRemote ? `<button class="btn btn-ghost btn-sm" data-action="delete-draft" data-id="${d.id}">🗑 Delete</button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Wire actions
    list.querySelectorAll<HTMLElement>('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id') ?? '';
            
            if (action === 'edit-draft') {
                activeDraftId = id;
                send('loadLocalDraft', { draftId: id });
            } else if (action === 'delete-draft') {
                if (activeDraftId === id) activeDraftId = undefined;
                send('deleteLocalDraft', { draftId: id });
                // Optimistically remove from UI
                const card = btn.closest<HTMLElement>('[data-draft-id]');
                if (card) card.remove();
            }
        });
    });
}


// ── Init ──────────────────────────────────────────────────────────────────────
try {
    send('loadConfiguration');
    
    // Wire Fetch Remote Drafts button
    const fetchRemoteBtn = get<HTMLButtonElement>('btn-fetch-remote-drafts');
    if (fetchRemoteBtn) {
        fetchRemoteBtn.addEventListener('click', () => {
            if (window.__PLATFORM_DATA__?.platform === 'devto') send('fetchDevToDrafts');
            // Support for other platforms later
            fetchRemoteBtn.classList.add('loading');
            fetchRemoteBtn.disabled = true;
            setTimeout(() => {
                fetchRemoteBtn.classList.remove('loading');
                fetchRemoteBtn.disabled = false;
            }, 3000);
        });
    }

    // Show remote container only for DevTo currently
    if (window.__PLATFORM_DATA__?.platform === 'devto') {
        const remoteContainer = get('remote-drafts-container');
        if (remoteContainer) remoteContainer.style.display = 'block';
    }

    // Hide loading, show empty initially
    const loadingEl = get('drafts-loading');
    if (loadingEl) loadingEl.style.display = 'none';
    const emptyEl = get('drafts-empty');
    if (emptyEl) emptyEl.style.display = 'block';

    // Wire up Save Draft buttons
    document.querySelectorAll('.btn-save-draft').forEach(btn => {
        btn.addEventListener('click', () => {
            const platformTarget = window.__PLATFORM_DATA__?.platform;
            if (!platformTarget) return;

            // Gather data based on workspace
            let text = '';
            let type: 'social' | 'article' = 'social';
            
            if (window.__PLATFORM_DATA__?.workspaceType === 'blogs') {
                text = get<HTMLTextAreaElement>('blog-body')?.value || '';
                type = 'article';
            } else if (window.__PLATFORM_DATA__?.workspaceType === 'threads') {
                // Combine thread parts
                text = threadPosts.map(p => p.text).join('\n\n---\n\n');
            } else {
                text = get<HTMLTextAreaElement>('post-text')?.value || '';
            }

            if (!text.trim()) {
                toast('Cannot save an empty draft', 'warning');
                return;
            }

            btn.classList.add('loading');
            (btn as HTMLButtonElement).disabled = true;

            let titleMatch = text.substring(0, 50).replace(/\n/g, ' ');
            if (titleMatch.length === 50) titleMatch += '...';

            const draftData: {
                text: string;
                bodyMarkdown?: string;
                tags?: string[];
                description?: string;
                coverImage?: string;
                canonicalUrl?: string;
                status?: string;
                series?: string;
            } = {
                text,
                bodyMarkdown: type === 'article' ? text : undefined
            };

            if (type === 'article') {
                const rawTags = get<HTMLInputElement>('blog-tags')?.value;
                draftData.tags = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : undefined;
                draftData.description = get<HTMLTextAreaElement>('blog-description')?.value;
                draftData.coverImage = get<HTMLInputElement>('blog-cover-image')?.value;
                draftData.canonicalUrl = get<HTMLInputElement>('blog-canonical-url')?.value;
                const statusSelect = get<HTMLSelectElement>(`blog-publish-status-${platformTarget}`) || get<HTMLSelectElement>('blog-publish-status');
                draftData.status = statusSelect?.value || 'draft';
                draftData.series = get<HTMLInputElement>('blog-series')?.value;
            }

            send('saveLocalDraft', {
                draftId: activeDraftId,
                draft: {
                    type,
                    title: type === 'article' ? (get<HTMLInputElement>('blog-title')?.value || titleMatch) : titleMatch,
                    platforms: [platformTarget],
                    data: draftData
                }
            });

            toast(activeDraftId ? 'Draft updated!' : 'Draft saved!', 'success');
            setTimeout(() => {
                btn.classList.remove('loading');
                (btn as HTMLButtonElement).disabled = false;
                send('listLocalDrafts');
            }, 800);
        });
    });

    // Fetch initial drafts
    send('listLocalDrafts');

    updateShareBtn();
    console.log('[DotShare platform-post] Initialized');
} catch (e) {
    console.error('[DotShare platform-post] Init error:', e);
    toast('Failed to initialize', 'error');
}
