/**
 * DotShare — platform-post.html Script
 * Compiled by esbuild → media/webview/app.js
 *
 * Scope: This file handles ONLY what platform-post.html needs:
 *   - Social Composer (text, media, Reddit options)
 *   - Thread Composer (X / Bluesky)
 *   - Blog Publisher (Dev.to)
 *   - AI Model modal
 *   - Message handler from the extension host
 */

import { ProjectReleaseContext, PostTone, GeneratedPlatformContent, ReleaseGenerationRequest, UserCtaLink, ReleaseCtaLink } from '../../src/types/dotshare-ai';
import { SocialPlatform } from '../../src/types';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getPreviewWebUrl } from '../../src/utils/preview-links';

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
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-open-library]').forEach(button => button.addEventListener('click', () => send('openPublishingLibrary')));
});

function get<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function showAiQualityWarnings(warnings: string[] = []): void {
    const banner = get('ai-quality-warning');
    if (!banner) return;
    banner.textContent = warnings.join('\n');
    banner.style.display = warnings.length ? 'block' : 'none';
}

function escHtml(s: string): string {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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
let activeCommandPlatform: string | null = (typeof window !== 'undefined' && window.__PLATFORM_DATA__?.platform) || null;
let activeMediaPaths: string[] = [];
let globalConnectedPlatforms: string[] = [];

const isCurrentPlatformConnected = () => {
    const p = activeCommandPlatform || window.__PLATFORM_DATA__?.platform;
    if (!p) return true; // generic panel without specific platform
    return globalConnectedPlatforms.includes(p);
};

// ── Max chars fallback map ────────────────────────────────────────────────────
const MAX_CHARS_MAP: Record<string, number> = {
    x: 280, bluesky: 300, mastodon: 500, linkedin: 3000, telegram: 4096,
    discord: 2000, devto: 100000,
};

const textarea    = get<HTMLTextAreaElement>('post-text');
const counter     = get('char-counter');
const btnShare    = get<HTMLButtonElement>('btn-share');
const btnGen      = get<HTMLButtonElement>('btn-dotshare-ai') || get<HTMLButtonElement>('btn-generate-ai');
const btnMedia    = get<HTMLButtonElement>('btn-attach-media');
const btnCodeSnap = get<HTMLButtonElement>('btn-codesnap');
const btnSchedule = get<HTMLButtonElement>('btn-schedule');
const fileInput   = get<HTMLInputElement>('media-file-input');

let scheduleMode: 'social' | 'blog' | 'thread' = 'social';

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
    const hasText = !!textarea?.value.trim();
    const max = window.__PLATFORM_DATA__?.maxChars || (activeCommandPlatform && MAX_CHARS_MAP[activeCommandPlatform]) || null;
    const tooLong = max ? textarea!.value.length > max : false;

    const p = activeCommandPlatform || window.__PLATFORM_DATA__?.platform;

    // Share Now: always available via local credentials — only gate on text content.
    btnShare.disabled = !hasText || tooLong;
    btnShare.textContent = p
        ? `🚀 Share to ${p.charAt(0).toUpperCase() + p.slice(1)}`
        : '🚀 Share Now';

    // Schedule: requires cloud OAuth — disable with hint when not connected.
    if (btnSchedule) {
        const connected = isCurrentPlatformConnected();
        if (p && !connected) {
            btnSchedule.disabled = true;
            btnSchedule.title = 'Connect in Dashboard to enable cloud scheduling';
        } else {
            btnSchedule.disabled = !hasText || tooLong;
            btnSchedule.title = '';
        }
    }
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
        item.innerHTML = `<img src="${escHtml(path)}" class="media-thumb" /><button class="media-remove-btn" data-idx="${idx}">✕</button>`;
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

// ── Drag & Drop Upload (Placeholder Pattern) ──────────────────────────────────
/**
 * Enables drag-and-drop image uploads on a Textarea.
 * Immediately injects a placeholder, uploads in background,
 * then replaces the placeholder with the real URL (Notion/GitHub style).
 */
function enableDragAndDrop(editor: HTMLTextAreaElement | null) {
    if (!editor) return;

    editor.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editor.classList.add('drag-active');
    });

    editor.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editor.classList.remove('drag-active');
    });

    editor.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        editor.classList.remove('drag-active');

        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        if (!file.type.startsWith('image/')) {
            toast('Only images can be dropped here.', 'warning');
            return;
        }

        // 1. Capture cursor position at the exact moment of drop
        const startPos = editor.selectionStart;
        const endPos   = editor.selectionEnd;

        // 2. Build a unique placeholder tied to this specific upload
        const placeholder = `![Uploading ${file.name} ⏳]()`;
        const mdPlaceholder = `\n${placeholder}\n`;

        // 3. Inject placeholder immediately so the user can keep typing
        editor.value = editor.value.substring(0, startPos) + mdPlaceholder + editor.value.substring(endPos);
        editor.selectionStart = editor.selectionEnd = startPos + mdPlaceholder.length;
        editor.dispatchEvent(new Event('input'));
        toast(`Uploading ${file.name}…`, 'info');

        // 4. Compress & upload (same pipeline as the regular button)
        try {
            let base64Data: string, size: number, type: string, name: string;
            const isLarge = file.size > 2 * 1024 * 1024;
            if (isLarge && !file.type.match(/video|gif/i)) {
                const compressed = await processAndCompressImage(file);
                base64Data = compressed.base64Data;
                size       = compressed.size;
                type       = compressed.type;
                name       = compressed.name;
            } else {
                await new Promise<void>((res) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        base64Data = (reader.result as string).split(',')[1];
                        size = file.size;
                        type = file.type;
                        name = file.name;
                        res();
                    };
                    reader.readAsDataURL(file);
                });
            }
            // Pass placeholderRef so the extension echoes it back in fileUploaded
            send('uploadFile', {
                file: { name: name!, size: size!, type: type!, base64Data: base64Data! },
                placeholderRef: placeholder
            });
        } catch {
            toast('Failed to process dropped image.', 'error');
            // Clean up orphaned placeholder on error
            editor.value = editor.value.replace(mdPlaceholder, '');
            editor.dispatchEvent(new Event('input'));
        }
    });
}

// Activate Drag & Drop on both editors + fire webviewReady handshake.
// webviewReady tells the extension that this Composer is mounted and ready
// to receive a pending CodeSnap image (the event-driven alternative to setTimeout).
// Single onReady() guard prevents double-attach when readyState is already 'complete'.
function onReady(): void {
    enableDragAndDrop(get<HTMLTextAreaElement>('post-text'));
    enableDragAndDrop(get<HTMLTextAreaElement>('blog-body'));
    // Signal readiness to the extension host
    send('webviewReady');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
} else {
    onReady();
}

// Attach media button
btnMedia?.addEventListener('click', () => { if (fileInput) fileInput.click(); });

// ── 📸 CodeSnap button (Pull Flow) ───────────────────────────────────────────
// Opens CodeSnap panel from inside the Composer. The rendered image will be
// auto-attached when the user clicks Share in the CodeSnap panel.
btnCodeSnap?.addEventListener('click', () => {
    send('triggerCodeSnap');
});

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

    send('share', payload);
});

// ── Schedule Button ───────────────────────────────────────────
function openScheduleModal(mode: 'social' | 'blog' | 'thread') {
    const modal = get('scheduleModal');
    if (!modal) return;
    
    scheduleMode = mode;

    // Update modal title
    const titleEl = modal.querySelector<HTMLElement>('.modal-header h3');
    if (titleEl) {
        titleEl.innerHTML = mode === 'blog'
            ? '<span class="header-icon">📅</span> Schedule Article'
            : mode === 'thread'
            ? '<span class="header-icon">📅</span> Schedule Thread'
            : '<span class="header-icon">📅</span> Schedule Post';
    }
    
    // Set default time to +1 hour
    const dateInput = get<HTMLInputElement>('scheduleDate');
    if (dateInput) {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        now.setMinutes(0);
        // Format to YYYY-MM-DDTHH:mm
        const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        dateInput.value = localISO;
    }
    
    modal.style.display = 'flex';
}

btnSchedule?.addEventListener('click', () => openScheduleModal('social'));
get('btn-schedule-blog')?.addEventListener('click', () => openScheduleModal('blog'));

get('closeScheduleModal')?.addEventListener('click', () => {
    const modal = get('scheduleModal');
    if (modal) modal.style.display = 'none';
});

get('cancelScheduleBtn')?.addEventListener('click', () => {
    const modal = get('scheduleModal');
    if (modal) modal.style.display = 'none';
});

get('confirmScheduleBtn')?.addEventListener('click', () => {
    // Get content from the right source based on schedule mode
    const activeText = scheduleMode === 'blog'
        ? getBlogBodyText()
        : textarea?.value.trim();

    if (!activeText) {
        toast(
            scheduleMode === 'blog'
                ? 'No article content. Read a Markdown file first.'
                : 'Write something first.',
            'warning'
        );
        return;
    }
    
    const dateInput = get<HTMLInputElement>('scheduleDate');
    const rawTime = dateInput?.value;
    const scheduledTime = rawTime ? new Date(rawTime).toISOString() : null;
    
    if (!scheduledTime) {
        toast('Please select a date and time.', 'warning');
        return;
    }

    const scheduleDate = new Date(scheduledTime);
    if (scheduleDate <= new Date()) {
        toast('Scheduled time must be in the future.', 'warning');
        return;
    }

    setComposerLocked(true);
    const modal = get('scheduleModal');
    if (modal) modal.style.display = 'none';
    
    if (scheduleMode === 'social') {
        const currentPlat = activeCommandPlatform || window.__PLATFORM_DATA__?.platform;
        const platforms = currentPlat ? [currentPlat] : [];
        
        if (platforms.length === 0) {
            toast('No platform selected for scheduling.', 'error');
            setComposerLocked(false);
            return;
        }

        send('schedulePost', {
            postText: activeText,
            platforms,
            scheduledTime: scheduledTime,
            mediaFilePaths: activeMediaPaths
        });
    } else if (scheduleMode === 'thread') {
        const valid = threadPosts.filter(p => p.text.trim() || p.mediaFilePaths.length > 0);
        if (!valid.length) {
            toast('Thread is empty.', 'warning');
            setComposerLocked(false);
            return;
        }
        send('scheduleThread', {
            platform: activeCommandPlatform || (window as { __AUTO_THREAD_PLATFORM__?: string }).__AUTO_THREAD_PLATFORM__,
            posts: valid.map(p => ({ text: p.text, mediaFilePaths: p.mediaFilePaths })),
            scheduledTime: scheduledTime
        });
    } else if (scheduleMode === 'blog') {
        const platform = getSingleBlogPlatform();
        if (!platform) {
            toast('No blog platform selected.', 'warning');
            setComposerLocked(false);
            return;
        }

        send('scheduleBlog', {
            platform,
            post: activeText,
            title: get<HTMLInputElement>('blog-title')?.value.trim(),
            tags: get<HTMLInputElement>('blog-tags')?.value.trim().split(',').map(t => t.trim()).filter(Boolean),
            description: get<HTMLTextAreaElement>('blog-description')?.value.trim(),
            coverImage: get<HTMLInputElement>('blog-cover-image')?.value.trim(),
            canonicalUrl: get<HTMLInputElement>('blog-canonical-url')?.value.trim(),
            series: get<HTMLInputElement>('blog-series')?.value.trim(),
            scheduledTime: scheduledTime
        });
    }
    
    toast('Scheduling post...', 'info');
});

// ── DotShare AI Copilot Controller ───────────────────────────────────────────
let cachedReleaseContext: ProjectReleaseContext | null = null;
let releaseContextRequestId = 0;
let releaseContextLoading = false;
let releaseContextAvailable = false;

function refreshReleaseContext(): void {
    releaseContextLoading = true;
    releaseContextAvailable = false;
    const button = get<HTMLButtonElement>('btn-ai-modal-generate');
    if (button) { button.disabled = true; button.textContent = 'Reading release…'; }
    send('extractReleaseContext', {
        requestId: ++releaseContextRequestId,
        scope: get<HTMLSelectElement>('ai-release-scope')?.value || 'release',
        releaseTag: get<HTMLSelectElement>('ai-release-tag')?.value || undefined
    });
}

get('ai-release-scope')?.addEventListener('change', () => {
    const tag = get<HTMLSelectElement>('ai-release-tag');
    if (tag) tag.disabled = get<HTMLSelectElement>('ai-release-scope')?.value === 'working_tree';
    refreshReleaseContext();
});
get('ai-release-tag')?.addEventListener('change', refreshReleaseContext);
let lastGeneratedTone: PostTone = 'professional';

function getSelectedAiModelCredentials(): { provider: string; apiKey?: string; model: string } | undefined {
    const activeTab = document.querySelector<HTMLElement>('.tab-btn.active[data-provider]');
    const activeProvider = activeTab?.getAttribute('data-provider') || 'gemini';
    const panel = get(`${activeProvider}Panel`) || document.querySelector('.provider-panel.active') || document.querySelector('.provider-panel');
    if (!panel) return undefined;
    const provider = panel.id.replace('Panel', '');
    const keyInput = panel.querySelector<HTMLInputElement>('input[type="password"]');
    const modelSel = panel.querySelector<HTMLSelectElement>('select');
    if (!modelSel?.value) {
        return undefined;
    }
    return {
        provider,
        model: modelSel.value,
        apiKey: keyInput?.value.trim() || undefined
    };
}

let savedUserCtaLinks: UserCtaLink[] = [];
const selectedSavedCtaLinkIds = new Set<string>();

function updateCtaActiveCount(): void {
    const countBadge = get('ai-cta-active-count');
    if (!countBadge) return;

    let activeCount = 0;
    const repoChecked = get<HTMLInputElement>('ai-cta-repo-check')?.checked;
    const repoUrl = cachedReleaseContext?.repoUrl;
    if (repoChecked && repoUrl) {
        activeCount++;
    }

    activeCount += selectedSavedCtaLinkIds.size;

    countBadge.textContent = `${activeCount} active`;
    countBadge.className = activeCount > 0 ? 'ai-badge ready' : 'ai-badge ai-badge-optional';
}

function renderSavedCtaLinks(): void {
    const list = get('ai-cta-saved-list');
    if (!list) return;

    list.innerHTML = '';
    if (savedUserCtaLinks.length === 0) {
        list.innerHTML = '<div style="font-size:11px;color:var(--vscode-descriptionForeground);padding:4px 0;">No saved links yet. Click "➕ Add Link" to save your personal/community URLs.</div>';
        return;
    }

    savedUserCtaLinks.forEach(link => {
        const card = document.createElement('label');
        card.className = 'ai-source-card';
        card.style.display = 'flex';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'space-between';
        card.style.gap = '8px';

        const safeEmoji = escHtml(link.emoji || '🔗');
        const safeLabel = escHtml(link.label);
        const safeUrl = escHtml(link.url);

        card.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                <input type="checkbox" class="ai-cta-saved-checkbox" />
                <div class="ai-source-info" style="min-width:0;">
                    <span class="ai-source-label">${safeEmoji} ${safeLabel}</span>
                    <span class="ai-source-desc" style="word-break:break-all;">${safeUrl}</span>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;">
                <button type="button" class="cta-action-btn btn-edit-cta" title="Edit link">✏️</button>
                <button type="button" class="cta-action-btn btn-delete-cta" title="Delete link">🗑️</button>
            </div>
        `;

        const chk = card.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (chk) {
            chk.checked = selectedSavedCtaLinkIds.has(link.id);
            card.classList.toggle('active', chk.checked);

            chk.addEventListener('change', () => {
                if (chk.checked) {
                    selectedSavedCtaLinkIds.add(link.id);
                } else {
                    selectedSavedCtaLinkIds.delete(link.id);
                }
                card.classList.toggle('active', chk.checked);
                updateCtaActiveCount();
            });
        }

        // Edit button
        card.querySelector<HTMLButtonElement>('.btn-edit-cta')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openCtaAddForm(link);
        });

        // Delete button
        card.querySelector<HTMLButtonElement>('.btn-delete-cta')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteCtaLink(link.id);
        });

        list.appendChild(card);
    });
}

function openCtaAddForm(existing?: UserCtaLink): void {
    const form = get('ai-cta-add-form');
    if (!form) return;

    const idInput = get<HTMLInputElement>('ai-edit-cta-id');
    const emojiInput = get<HTMLInputElement>('ai-new-cta-emoji');
    const labelInput = get<HTMLInputElement>('ai-new-cta-label');
    const urlInput = get<HTMLInputElement>('ai-new-cta-url');
    const saveBtn = get<HTMLButtonElement>('btn-save-new-cta');

    if (idInput) idInput.value = existing?.id || '';
    if (emojiInput) emojiInput.value = existing?.emoji || '';
    if (labelInput) labelInput.value = existing?.label || '';
    if (urlInput) urlInput.value = existing?.url || '';
    if (saveBtn) saveBtn.textContent = existing ? 'Update Link' : 'Save Link';

    form.style.display = 'block';
    labelInput?.focus();
}

function closeCtaAddForm(): void {
    const form = get('ai-cta-add-form');
    if (form) form.style.display = 'none';
}

function deleteCtaLink(id: string): void {
    selectedSavedCtaLinkIds.delete(id);
    savedUserCtaLinks = savedUserCtaLinks.filter(l => l.id !== id);
    send('saveUserCtaLinks', { links: savedUserCtaLinks });
    renderSavedCtaLinks();
    updateCtaActiveCount();
    toast('Link deleted', 'info');
}

let lastRepoCtaUrl: string | undefined;

function updateAiContextBadges(ctx: ProjectReleaseContext): void {
    const changelogBadge = get('ai-changelog-badge');
    const gitBadge = get('ai-git-badge');
    const gitDesc = get('ai-git-desc');
    const gitWarning = get('ai-git-warning');

    if (changelogBadge) {
        changelogBadge.textContent = ctx.version ? `v${ctx.version} ✅` : (ctx.changelogNotes?.length ? `${ctx.changelogNotes.length} notes ✅` : 'Found ✅');
        changelogBadge.classList.add('ready');
    }

    const workingTree = ctx.scope === 'working_tree';
    const boundary = `${ctx.gitBaseTag || 'Initial tree / previous commit'} → ${ctx.targetLabel || 'HEAD'}`;
    if (gitBadge) {
        gitBadge.textContent = workingTree ? 'Uncommitted changes' : `${boundary} (${ctx.gitCommitCount || 0} commits)`;
        gitBadge.classList.toggle('ready', !workingTree);
        gitBadge.classList.toggle('warning', workingTree);
        gitBadge.title = boundary;
    }
    if (gitDesc) gitDesc.textContent = workingTree ? 'Tracked local changes since HEAD' : 'Files and code from the selected committed version';
    if (gitWarning) {
        const messages = ctx.contextWarnings || [];
        gitWarning.style.display = messages.length ? 'block' : 'none';
        gitWarning.textContent = messages.join(' ');
    }
    const tagSelect = get<HTMLSelectElement>('ai-release-tag');
    if (tagSelect) {
        const selected = tagSelect.value;
        tagSelect.replaceChildren();
        const current = document.createElement('option');
        current.value = ''; current.textContent = 'Latest tagged release / HEAD'; tagSelect.appendChild(current);
        const head = document.createElement('option');
        head.value = 'HEAD'; head.textContent = 'Current committed work (HEAD)'; tagSelect.appendChild(head);
        for (const tag of ctx.availableTags || []) {
            const option = document.createElement('option'); option.value = tag; option.textContent = tag; tagSelect.appendChild(option);
        }
        tagSelect.value = selected;
        tagSelect.disabled = workingTree;
    }

    // Repository CTA auto-detection
    const repoContainer = get('ai-cta-repo-container');
    const repoUrlEl = get('ai-cta-repo-url');
    const repoCheck = get<HTMLInputElement>('ai-cta-repo-check');
    const repoCard = get('card-cta-repo');

    const repoChanged = lastRepoCtaUrl !== ctx.repoUrl;

    if (ctx.repoUrl) {
        if (repoContainer) repoContainer.style.display = 'block';
        if (repoUrlEl) repoUrlEl.textContent = ctx.repoUrl;

        if (repoCheck && repoChanged) {
            repoCheck.checked = true;
        }

        if (repoCard) {
            repoCard.classList.toggle('active', !!repoCheck?.checked);
        }

        lastRepoCtaUrl = ctx.repoUrl;
    } else {
        if (repoContainer) repoContainer.style.display = 'none';
        if (repoCheck) repoCheck.checked = false;
        if (repoCard) repoCard.classList.remove('active');

        lastRepoCtaUrl = undefined;
    }

    updateCtaActiveCount();
}

function openDotShareAiModal(): void {
    const modal = get('dotshareAiModal');
    if (!modal) return;

    const plat = activeCommandPlatform || window.__PLATFORM_DATA__?.platform || 'x';
    const isThreadsWs = window.__PLATFORM_DATA__?.workspaceType === 'threads';
    const isBlogWs = window.__PLATFORM_DATA__?.workspaceType === 'blogs' || plat === 'devto';
    const isTwitterOrBluesky = ['x', 'bluesky'].includes(plat);

    // Thread option visibility & state
    const threadOptWrap = get('ai-opt-thread-wrap');
    const threadOptInput = get<HTMLInputElement>('ai-opt-thread');
    if (threadOptWrap && threadOptInput) {
        if (!isBlogWs && (isThreadsWs || isTwitterOrBluesky)) {
            threadOptWrap.style.display = 'flex';
            threadOptInput.checked = isThreadsWs;
        } else {
            threadOptWrap.style.display = 'none';
            threadOptInput.checked = false;
        }
    }

    // Default tone: use lastGeneratedTone if user changed tone, else platform default
    const defaultTone = lastGeneratedTone || (isBlogWs ? 'full_markdown_article' : plat === 'linkedin' ? 'professional' : 'casual_build_in_public');
    document.querySelectorAll<HTMLElement>('.ai-tone-pill').forEach(pill => {
        const toneVal = pill.getAttribute('data-tone');
        const radio = pill.querySelector<HTMLInputElement>('input[type="radio"]');
        const isMatch = toneVal === defaultTone;
        pill.classList.toggle('active', isMatch);
        if (radio) radio.checked = isMatch;
    });

    // Show cached data immediately for zero-latency UI
    if (cachedReleaseContext) {
        updateAiContextBadges(cachedReleaseContext);
    } else {
        const changelogBadge = get('ai-changelog-badge');
        const gitBadge = get('ai-git-badge');
        const gitWarning = get('ai-git-warning');
        if (changelogBadge) {
            changelogBadge.textContent = 'Detecting…';
            changelogBadge.classList.remove('ready');
        }
        if (gitBadge) {
            gitBadge.textContent = 'Detecting…';
            gitBadge.classList.remove('ready', 'warning');
        }
        if (gitWarning) {
            gitWarning.style.display = 'none';
        }
    }

    // Always refresh current project context in background so repoUrl reflects current Git remote
    refreshReleaseContext();

    modal.style.display = 'flex';
}

function resetDotShareAiModalBtn(): void {
    const aiGenBtn = get<HTMLButtonElement>('btn-ai-modal-generate');
    if (aiGenBtn) {
        aiGenBtn.disabled = releaseContextLoading || !releaseContextAvailable;
        aiGenBtn.textContent = releaseContextLoading ? 'Reading release…' : releaseContextAvailable ? '✨ Generate with DotShare AI' : 'Release unavailable';
    }
}

function populateThreadFromParts(parts: string[]): void {
    if (!threadContainer || !parts.length) return;
    
    // Clear existing posts
    threadContainer.innerHTML = '';
    threadPosts.length = 0;

    const max = window.__PLATFORM_DATA__?.maxChars || 280;

    parts.forEach((partText, index) => {
        threadPosts.push({ text: partText, mediaFilePaths: [] });
        const div = document.createElement('div');
        div.innerHTML = `<div class="thread-post" data-thread-index="${index}"><div class="thread-post-header"><span class="thread-post-label">Post ${index + 1}</span><span class="thread-char-counter" data-thread-counter="${index}">${partText.length} / ${max}</span><button class="btn btn-ghost btn-sm btn-remove-thread-post" data-remove-index="${index}">✕</button></div><textarea class="thread-textarea" data-thread-textarea="${index}" placeholder="What's on your mind?" rows="3">${escHtml(partText)}</textarea><div class="thread-post-actions"><button class="btn btn-ghost btn-sm thread-media-btn" data-thread-media="${index}">📎 Media</button><input type="file" class="thread-file-input" data-thread-file="${index}" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4" style="display:none;" multiple /><div class="thread-media-preview" data-thread-preview="${index}" style="display:none;"><span class="thread-media-name"></span><button class="btn btn-ghost btn-sm thread-remove-media" data-thread-remove="${index}">✕</button></div></div></div>`.trim();
        const first = div.firstChild;
        if (first) {
            threadContainer.appendChild(first);
            wireThreadPostEvents(index);
            updateThreadCharCounter(index);
        }
    });

    reIndexThreads();
    updateThreadShareBtn();
}

// Wire modal open triggers
btnGen?.addEventListener('click', openDotShareAiModal);
get('btn-dotshare-ai-threads')?.addEventListener('click', openDotShareAiModal);
get('btn-quick-change-tone')?.addEventListener('click', openDotShareAiModal);
get('btn-dotshare-ai-blog')?.addEventListener('click', openDotShareAiModal);

// Close modal triggers
get('closeDotShareAiModal')?.addEventListener('click', () => {
    resetDotShareAiModalBtn();
    const m = get('dotshareAiModal');
    if (m) m.style.display = 'none';
});
get('cancelDotShareAiBtn')?.addEventListener('click', () => {
    resetDotShareAiModalBtn();
    const m = get('dotshareAiModal');
    if (m) m.style.display = 'none';
});

// Custom angle checkbox toggle
get<HTMLInputElement>('ai-src-custom')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    const card = get('card-src-custom');
    if (card) card.classList.toggle('active', checked);
    const container = get('ai-custom-prompt-container');
    if (container) container.style.display = checked ? 'block' : 'none';
});

// Source cards toggle
['changelog', 'git', 'editor'].forEach(srcKey => {
    get<HTMLInputElement>(`ai-src-${srcKey}`)?.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        const card = get(`card-src-${srcKey}`);
        if (card) card.classList.toggle('active', checked);
    });
});

// CTA collapsible section toggle
get('ai-cta-toggle-header')?.addEventListener('click', () => {
    const content = get('ai-cta-content');
    const icon = get('ai-cta-toggle-icon');
    if (content) {
        const isHidden = content.style.display === 'none' || !content.style.display;
        content.style.display = isHidden ? 'block' : 'none';
        if (icon) icon.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
    }
});

// Repository CTA checkbox toggle
get<HTMLInputElement>('ai-cta-repo-check')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    const card = get('card-cta-repo');
    if (card) card.classList.toggle('active', checked);
    updateCtaActiveCount();
});

// CTA Add Form buttons
get('btn-add-cta-link')?.addEventListener('click', () => openCtaAddForm());
get('btn-cancel-add-cta')?.addEventListener('click', closeCtaAddForm);
get('btn-save-new-cta')?.addEventListener('click', () => {
    const idInput = get<HTMLInputElement>('ai-edit-cta-id');
    const emojiInput = get<HTMLInputElement>('ai-new-cta-emoji');
    const labelInput = get<HTMLInputElement>('ai-new-cta-label');
    const urlInput = get<HTMLInputElement>('ai-new-cta-url');

    const label = labelInput?.value.trim() || '';
    const url = urlInput?.value.trim() || '';
    const emoji = emojiInput?.value.trim() || '🔗';
    const editId = idInput?.value;

    if (!label) {
        toast('⚠️ Please enter a label for the link.', 'warning');
        return;
    }
    const lower = url.toLowerCase();
    if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
        toast('⚠️ Please enter a valid URL starting with http:// or https://', 'warning');
        return;
    }

    const duplicate = savedUserCtaLinks.some(link => link.url === url && link.id !== editId);
    if (duplicate) {
        toast('⚠️ This URL is already saved.', 'warning');
        return;
    }

    if (editId) {
        const idx = savedUserCtaLinks.findIndex(l => l.id === editId);
        if (idx !== -1) {
            savedUserCtaLinks[idx] = { id: editId, label, url, emoji };
        }
    } else {
        savedUserCtaLinks.push({
            id: 'cta_' + Date.now(),
            label,
            url,
            emoji
        });
    }

    send('saveUserCtaLinks', { links: savedUserCtaLinks });
    closeCtaAddForm();
    renderSavedCtaLinks();
    updateCtaActiveCount();
    toast('✅ CTA link saved!', 'success');
});

// Tone pills selection
document.querySelectorAll<HTMLElement>('.ai-tone-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        document.querySelectorAll('.ai-tone-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const radio = pill.querySelector<HTMLInputElement>('input[type="radio"]');
        if (radio) radio.checked = true;
    });
});

// Generate post button in modal
get('btn-ai-modal-generate')?.addEventListener('click', () => {
    if (releaseContextLoading || !releaseContextAvailable) return;
    const creds = getSelectedAiModelCredentials();

    const useChangelog = get<HTMLInputElement>('ai-src-changelog')?.checked ?? true;
    const useGit = get<HTMLInputElement>('ai-src-git')?.checked ?? true;
    const useCustom = get<HTMLInputElement>('ai-src-custom')?.checked ?? false;
    const useEditor = get<HTMLInputElement>('ai-src-editor')?.checked ?? false;
    const customPromptVal = get<HTMLTextAreaElement>('ai-custom-prompt')?.value.trim();

    if (!useChangelog && !useGit && !useEditor && (!useCustom || !customPromptVal)) {
        toast('⚠️ Please select at least one context source or provide a custom topic.', 'warning');
        return;
    }

    const selectedToneRadio = document.querySelector<HTMLInputElement>('input[name="ai-tone"]:checked');
    const selectedTone = (selectedToneRadio?.value as PostTone) || 'professional';
    lastGeneratedTone = selectedTone;

    const selectedLanguage = (get<HTMLSelectElement>('ai-language-select')?.value as 'en' | 'ar') || 'en';
    const includeHashtags = get<HTMLInputElement>('ai-opt-hashtags')?.checked ?? true;
    const threadMode = get<HTMLInputElement>('ai-opt-thread')?.checked ?? false;
    const targetPlatform = (activeCommandPlatform || window.__PLATFORM_DATA__?.platform || 'x') as SocialPlatform;

    // Collect selected CTA Links (Repository + Saved Links)
    const selectedCtaLinks: ReleaseCtaLink[] = [];
    const repoChecked = get<HTMLInputElement>('ai-cta-repo-check')?.checked;
    if (repoChecked && cachedReleaseContext?.repoUrl) {
        selectedCtaLinks.push({
            id: 'current-repository',
            label: 'Repository',
            url: cachedReleaseContext.repoUrl,
            emoji: '⭐',
            source: 'repository'
        });
    }
    savedUserCtaLinks.forEach(link => {
        if (selectedSavedCtaLinkIds.has(link.id)) {
            selectedCtaLinks.push({
                id: link.id,
                label: link.label,
                url: link.url,
                emoji: link.emoji,
                source: 'saved'
            });
        }
    });

    // Filter context selectively from cache while preserving all enriched fields
    const filteredContext: ProjectReleaseContext = {
        ...(cachedReleaseContext || { projectName: 'Project', recentCommits: [] }),
        version: useChangelog ? cachedReleaseContext?.version : undefined,
        changelogNotes: useChangelog ? cachedReleaseContext?.changelogNotes : [],
        latestCommit: useGit ? cachedReleaseContext?.latestCommit : undefined,
        recentCommits: useGit ? cachedReleaseContext?.recentCommits : [],
        gitDiffSummary: useGit ? cachedReleaseContext?.gitDiffSummary : undefined,
        gitBaseTag: useGit ? cachedReleaseContext?.gitBaseTag : undefined,
        gitDirty: useGit ? cachedReleaseContext?.gitDirty : undefined,
        gitCommitCount: useGit ? cachedReleaseContext?.gitCommitCount : undefined,
        relevantCodeSnippets: useGit ? cachedReleaseContext?.relevantCodeSnippets : undefined,
        dependencyChanges: useGit ? cachedReleaseContext?.dependencyChanges : undefined,
        relevantCommits: useGit ? cachedReleaseContext?.relevantCommits : undefined,
        matchingDocNotes: cachedReleaseContext?.matchingDocNotes,
        activeEditorContext: useEditor ? cachedReleaseContext?.activeEditorContext : undefined
    };

    const request: ReleaseGenerationRequest = {
        context: filteredContext,
        targetPlatforms: [targetPlatform],
        tone: selectedTone,
        language: selectedLanguage,
        includeHashtags,
        includeCodeSnippets: get<HTMLInputElement>('ai-opt-code')?.checked ?? true,
        scope: get<HTMLSelectElement>('ai-release-scope')?.value === 'working_tree' ? 'working_tree' : 'release',
        releaseTag: get<HTMLSelectElement>('ai-release-scope')?.value === 'working_tree' ? undefined : get<HTMLSelectElement>('ai-release-tag')?.value || undefined,
        sources: ['readme', ...(useChangelog ? ['changelog', 'docs_search'] as const : []), ...(useGit ? ['git_commits', 'git_diff', 'dependencies'] as const : []), ...(useEditor ? ['active_editor'] as const : [])],
        threadMode,
        customPrompt: useCustom ? customPromptVal : undefined,
        topicQuery: useCustom ? customPromptVal : undefined,
        includeActiveEditor: useEditor,
        ctaLinks: selectedCtaLinks.length > 0 ? selectedCtaLinks : undefined
    };

    const genBtn = get<HTMLButtonElement>('btn-ai-modal-generate');
    if (genBtn) {
        genBtn.disabled = true;
        genBtn.textContent = '⏳ Generating with DotShare AI…';
    }

    send('generateReleasePost', {
        request,
        selectedModel: creds
    });

    toast('✨ DotShare AI is crafting your post…', 'info', 5000);
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
    const tBtn = get<HTMLButtonElement>('btn-share-thread');
    if (tBtn) { tBtn.classList.remove('loading'); }
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

function updateBlogStats(): void {
    const text = get<HTMLTextAreaElement>('blog-body')?.value || '';
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = text.length;
    const readTime = Math.max(1, Math.ceil(words / 200));

    const wordEl = get('blog-word-count');
    const charEl = get('blog-char-count');
    const timeEl = get('blog-reading-time');

    if (wordEl) wordEl.textContent = `${words.toLocaleString()} words`;
    if (charEl) charEl.textContent = `${chars.toLocaleString()} characters`;
    if (timeEl) timeEl.textContent = `${readTime} min read`;
}

function updateBlogRenderedPreview(): void {
    const previewEl = get('blog-rendered-preview');
    if (!previewEl) return;
    const markdownText = get<HTMLTextAreaElement>('blog-body')?.value.trim() || '';
    try {
        const article = document.createElement('article');
        article.className = 'blog-preview-article';
        const header = document.createElement('header');
        header.className = 'blog-preview-header';
        const title = get<HTMLInputElement>('blog-title')?.value.trim() || '';
        if (title) {
            const heading = document.createElement('h1');
            heading.className = 'blog-preview-title';
            heading.dir = 'auto';
            heading.textContent = title;
            header.appendChild(heading);
        }
        const description = get<HTMLTextAreaElement>('blog-description')?.value.trim();
        if (description) {
            const summary = document.createElement('p');
            summary.className = 'blog-preview-description';
            summary.dir = 'auto';
            summary.textContent = description;
            header.appendChild(summary);
        }
        const tags = get<HTMLInputElement>('blog-tags')?.value.split(',').map(tag => tag.trim().replace(/^#+/, '')).filter(Boolean) || [];
        if (tags.length) {
            const list = document.createElement('div');
            list.className = 'blog-preview-tags';
            list.setAttribute('aria-label', 'Article tags');
            for (const tag of [...new Set(tags)]) {
                const badge = document.createElement('span');
                badge.className = 'blog-preview-tag';
                badge.textContent = `#${tag}`;
                list.appendChild(badge);
            }
            header.appendChild(list);
        }
        if (header.childElementCount) article.appendChild(header);
        const body = document.createElement('div');
        body.className = 'blog-preview-body';
        body.dir = 'auto';
        if (markdownText) {
            body.innerHTML = DOMPurify.sanitize(marked.parse(markdownText) as string);
            // Imported Markdown may repeat the metadata title as its opening H1.
            const first = body.firstElementChild;
            if (title && first?.tagName === 'H1' && first.textContent?.trim() === title) first.remove();
            for (const anchor of body.querySelectorAll<HTMLAnchorElement>('a')) {
                const href = anchor.getAttribute('href') || '';
                anchor.removeAttribute('target');
                if (!href.startsWith('#') && !getPreviewWebUrl(href)) {
                    anchor.removeAttribute('href');
                    anchor.setAttribute('aria-disabled', 'true');
                }
            }
        } else {
            body.className += ' blog-preview-empty';
            body.textContent = 'No article content to preview yet. Read a Markdown file or generate an article with DotShare AI.';
        }
        article.appendChild(body);
        previewEl.replaceChildren(article);
    } catch {
        previewEl.innerHTML = `<div style="color:var(--vscode-errorForeground);padding:10px;">Failed to render Markdown preview</div>`;
    }
}

function openBlogPreviewLink(event: MouseEvent): void {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const anchor = event.target instanceof Element ? event.target.closest('a') : null;
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#')) {
        try {
            const id = decodeURIComponent(href.slice(1));
            const target = [...(get('blog-rendered-preview')?.querySelectorAll<HTMLElement>('[id]') || [])].find(element => element.id === id);
            target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        } catch { /* Ignore malformed anchors. */ }
        return;
    }
    const url = getPreviewWebUrl(href);
    if (url) send('openArticlePreviewLink', { url });
}

get('blog-rendered-preview')?.addEventListener('click', openBlogPreviewLink);
get('blog-rendered-preview')?.addEventListener('auxclick', openBlogPreviewLink);

['blog-title', 'blog-description', 'blog-tags'].forEach(id => {
    get(id)?.addEventListener('input', updateBlogRenderedPreview);
});

function revealBlogPublisherUi(): void {
    const preview = get('blog-preview');
    if (preview) preview.style.display = 'block';
    const card = get('blog-platforms-card');
    const actions = get('blog-actions');
    if (card) card.style.display = 'block';
    if (actions) actions.style.display = 'flex';
    updateBlogStats();
    updateBlogRenderedPreview();
    updateBlogPublishButtonsState();
}

function getBlogBodyText(): string {
    return get<HTMLTextAreaElement>('blog-body')?.value.trim() || get<HTMLTextAreaElement>('post-text')?.value.trim() || '';
}

function getSingleBlogPlatform(): 'devto' | null {
    const v = get<HTMLInputElement>('blog-single-platform')?.value?.trim();
    return v === 'devto' ? v : null;
}

function updateBlogPublishButtonsState(): void {
    const has = getBlogBodyText().length > 0;
    (['btn-publish-blog-devto', 'btn-publish-blog', 'btn-schedule-blog'] as const).forEach(id => {
        const b = get<HTMLButtonElement>(id);
        if (b) {
            if (!b.getAttribute('data-original-label')) {
                const initialText = b.textContent?.trim();
                if (initialText) b.setAttribute('data-original-label', initialText);
            }
            const platform = id.includes('devto') ? 'devto'
                           : (getSingleBlogPlatform() || '');

            const originalLabel = b.getAttribute('data-original-label');
            const defaultLabel = platform === 'devto' ? '🚀 Publish to Dev.to'
                               : (platform ? `🚀 Publish to ${platform}` : '🚀 Publish Article');
            const targetLabel = originalLabel || defaultLabel;

            if (platform && !globalConnectedPlatforms.includes(platform)) {
                // For schedule buttons, we strictly require Cloud OAuth.
                if (id.includes('schedule')) {
                    b.disabled = true;
                    b.title = '🔗 Connect in Dashboard to enable cloud scheduling';
                } else {
                    // For regular publish buttons, we allow local tokens.
                    b.disabled = !has;
                    b.textContent = targetLabel;
                }
            } else {
                b.disabled = !has;
                if (id.includes('schedule')) {
                    b.title = '';
                } else {
                    b.textContent = targetLabel;
                }
            }
        }
    });
}

function resetBlogPublishUi(): void {
    const bDev = get<HTMLButtonElement>('btn-publish-blog-devto');
    if (bDev) { setBtnLoading('btn-publish-blog-devto', false); }
    updateBlogPublishButtonsState();
}

function sendBlogShare(platform: 'devto', publishStatus: string): void {
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
        mediaFilePaths: activeMediaPaths || [],  // ← Include uploaded image URLs
        publishStatus, published: publishStatus === 'published',
    });
    toast('Publishing article…', 'info');
}

function wireBlogPublishButton(btn: HTMLButtonElement | null, platform: 'devto', getStatus: () => string): void {
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

get<HTMLTextAreaElement>('blog-body')?.addEventListener('input', () => {
    updateBlogStats();
    updateBlogPublishButtonsState();
    const prev = get('blog-rendered-preview');
    if (prev && prev.style.display !== 'none') {
        updateBlogRenderedPreview();
    }
});

// Blog Mode Switcher (Raw Markdown vs Live Rendered Preview)
get('tab-blog-raw')?.addEventListener('click', () => {
    get('tab-blog-raw')?.classList.add('active');
    get('tab-blog-preview')?.classList.remove('active');
    const body = get('blog-body');
    const prev = get('blog-rendered-preview');
    if (body) body.style.display = 'block';
    if (prev) prev.style.display = 'none';
});

get('tab-blog-preview')?.addEventListener('click', () => {
    get('tab-blog-preview')?.classList.add('active');
    get('tab-blog-raw')?.classList.remove('active');
    const body = get('blog-body');
    const prev = get('blog-rendered-preview');
    if (body) body.style.display = 'none';
    if (prev) {
        prev.style.display = 'block';
        updateBlogRenderedPreview();
    }
});

wireBlogPublishButton(get<HTMLButtonElement>('btn-publish-blog-devto'), 'devto', () => get<HTMLSelectElement>('blog-publish-status-devto')?.value || 'draft');

const singlePlat = getSingleBlogPlatform();
if (singlePlat) wireBlogPublishButton(get<HTMLButtonElement>('btn-publish-blog'), singlePlat, () => get<HTMLSelectElement>('blog-publish-status')?.value || 'draft');

// Cover Image Upload
get('btn-upload-cover')?.addEventListener('click', () => {
    get<HTMLInputElement>('cover-file-input')?.click();
});
get<HTMLInputElement>('cover-file-input')?.addEventListener('change', async (e) => {
    const fileInp = e.target as HTMLInputElement;
    const file = fileInp.files?.[0];
    if (!file) return;
    const btn = get<HTMLButtonElement>('btn-upload-cover');
    if (btn) btn.textContent = '⏳';
    try {
        const { base64Data, size, type, name } = await processAndCompressImage(file);
        send('uploadFile', { file: { name, size, type, base64Data }, placeholderRef: 'COVER_IMAGE' });
    } catch {
        const reader = new FileReader();
        reader.onload = () => {
            const b64 = (reader.result as string).split(',')[1];
            send('uploadFile', { file: { name: file.name, size: file.size, type: file.type, base64Data: b64 }, placeholderRef: 'COVER_IMAGE' });
        };
        reader.readAsDataURL(file);
    }
    fileInp.value = '';
});

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
    
    const p = activeCommandPlatform || (window as { __AUTO_THREAD_PLATFORM__?: string }).__AUTO_THREAD_PLATFORM__;
    const connected = !p || globalConnectedPlatforms.includes(p);
    
    // Share Thread: always available via local credentials
    btnShareThread.disabled = !hasContent || tooLong;
    btnShareThread.textContent = '🚀 Share Thread';

    // Schedule Thread: requires cloud OAuth
    const btnSchedThread = get<HTMLButtonElement>('btn-schedule-thread');
    if (btnSchedThread) {
        if (!connected) {
            btnSchedThread.disabled = true;
            btnSchedThread.title = '🔗 Connect in Dashboard to enable cloud scheduling';
        } else {
            btnSchedThread.disabled = !hasContent || tooLong;
            btnSchedThread.title = '';
        }
    }
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

get('btn-schedule-thread')?.addEventListener('click', () => openScheduleModal('thread'));

// ── AI Model Modal ────────────────────────────────────────────────────────────
const aiKeySaved: Record<string, boolean> = {};
const aiModelRequests: Record<string, number> = {};
function requestAiModels(provider: string, apiKey = ''): void {
    const requestId = (aiModelRequests[provider] || 0) + 1;
    aiModelRequests[provider] = requestId;
    send('fetchAiModels', { provider, apiKey, requestId });
}

function renderAiKeyStatus(provider: string, saved: boolean): void {
    aiKeySaved[provider] = saved;
    const panel = get(`${provider}Panel`);
    const badge = get(`${provider}KeyBadge`);
    const input = panel?.querySelector<HTMLInputElement>('input[type="password"]');
    const group = input?.closest<HTMLElement>('.input-group');
    if (badge) {
        badge.className = `key-status-badge ${saved ? 'saved' : 'missing'}`;
        badge.textContent = saved ? '🔒 Key Saved & Active' : '⚠️ Not Configured';
    }
    if (input && group) {
        if (!input.value.trim()) {
            group.style.display = saved ? 'none' : '';
            input.placeholder = 'Enter a new API key';
        }
        let change = get(`${provider}ReplaceKey`);
        if (!change) {
            change = document.createElement('button');
            change.id = `${provider}ReplaceKey`;
            change.className = 'credential-change-btn';
            change.setAttribute('type', 'button');
            change.textContent = 'Change saved key';
            group.before(change);
            change.addEventListener('click', () => {
                group.style.display = '';
                input.value = '';
                input.placeholder = 'Enter a replacement API key';
                input.focus();
                change!.style.display = 'none';
            });
        }
        change.style.display = saved && !input.value.trim() ? '' : 'none';
    }
}

function discardAiKeyReplacements(): void {
    if (apiKeyDebounceTimer) clearTimeout(apiKeyDebounceTimer);
    Object.entries(aiKeySaved).forEach(([provider, saved]) => {
        const input = get(`${provider}Panel`)?.querySelector<HTMLInputElement>('input[type="password"]');
        if (input) input.value = '';
        aiModelRequests[provider] = (aiModelRequests[provider] || 0) + 1;
        renderAiKeyStatus(provider, saved);
    });
}

function loadModelsForActiveProvider(): void {
    const activeTab = document.querySelector<HTMLElement>('.tab-btn.active[data-provider]');
    const provider = activeTab?.getAttribute('data-provider');
    if (!provider) return;
    const panel = get(`${provider}Panel`);
    if (!panel) return;
    const keyInput = panel.querySelector<HTMLInputElement>('input[type="password"]');
    const select = panel.querySelector<HTMLSelectElement>('select');
    if (select) {
        select.disabled = true;
        select.innerHTML = '<option value="" selected disabled>Loading available models...</option>';
    }
    // Empty key is intentional: backend falls back to stored SecretStorage key
    requestAiModels(provider, keyInput?.value.trim() || '');
}

function openModelModal(): void {
    const modal = get('modelModal');
    if (!modal) return;
    modal.style.display = 'flex';
    loadModelsForActiveProvider();
}

get('btn-ai-model')?.addEventListener('click', openModelModal);
get('btn-ai-keys-config')?.addEventListener('click', openModelModal);

document.querySelectorAll<HTMLElement>('[id^="closeModal"], [id^="close-modal-btn"]').forEach(btn => {
    btn.addEventListener('click', () => { const m = btn.closest('.modal') as HTMLElement | null; if (m) { m.style.display = 'none'; if (m.id === 'modelModal') discardAiKeyReplacements(); } });
});

get('applyModelBtn')?.addEventListener('click', () => {
    const panel = document.querySelector('.provider-panel.active');
    if (!panel) return;
    const provider = panel.id.replace('Panel', '');
    const keyInput = panel.querySelector<HTMLInputElement>('input[type="password"]');
    const modelSel = panel.querySelector<HTMLSelectElement>('select');
    if (keyInput && modelSel) {
        if (!modelSel.value) {
            toast('Please select an AI model.', 'warning');
            return;
        }
        send('applyModelSelection', { provider, model: modelSel.value, apiKey: keyInput.value.trim() });
        // Close, clear the typed replacement and show saved status after the host confirms storage.
    }
});

let apiKeyDebounceTimer: ReturnType<typeof setTimeout> | undefined;

document.querySelectorAll<HTMLElement>('.tab-btn[data-provider]').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn[data-provider]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.provider-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const provider = tab.getAttribute('data-provider') ?? '';
        const panel = get(provider + 'Panel');
        if (panel) {
            panel.classList.add('active');
            const keyInput = panel.querySelector<HTMLInputElement>('input[type="password"]');
            requestAiModels(provider, keyInput?.value.trim() || '');
        }
    });
});

document.querySelectorAll<HTMLInputElement>('.provider-panel input[type="password"]').forEach(keyInput => {
    keyInput.addEventListener('input', () => {
        const panel = keyInput.closest('.provider-panel');
        if (!panel) return;
        const provider = panel.id.replace('Panel', '');
        const select = panel.querySelector<HTMLSelectElement>('select');
        if (select) {
            select.innerHTML = '';
            const opt = document.createElement('option');
            opt.value = '';
            opt.disabled = true;
            opt.selected = true;
            opt.textContent = keyInput.value.trim() ? 'Loading live models from provider...' : `Enter your ${provider} API key to load models`;
            select.appendChild(opt);
            select.disabled = true;
        }

        if (apiKeyDebounceTimer) {
            clearTimeout(apiKeyDebounceTimer);
        }
        apiKeyDebounceTimer = setTimeout(() => {
            requestAiModels(provider, keyInput.value.trim());
        }, 400);
    });
});

// Close modals on backdrop click
document.querySelectorAll<HTMLElement>('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) { modal.style.display = 'none'; if (modal.id === 'modelModal') discardAiKeyReplacements(); } });
});


// ── Message Handler ───────────────────────────────────────────────────────────
window.addEventListener('message', (event: MessageEvent) => {
    try {
        const msg = event.data as Record<string, unknown>;
        if (!msg?.command) return;

        switch (msg.command) {
            case 'LOGOUT_SUCCESS': {
                // Clear connected platforms list
                globalConnectedPlatforms = [];
                
                // Force UI to update button states (disabling cloud schedule buttons)
                updateShareBtn();
                updateBlogPublishButtonsState();
                updateThreadShareBtn();
                
                toast('Logged out successfully', 'info');
                break;
            }

            case 'navigate': {
                // platform-post panels receive navigate to set the active platform
                if ((msg.options as { platform?: string })?.platform) {
                    activeCommandPlatform = String((msg.options as { platform?: string }).platform);

                    setBtnLoading('btn-share', false);
                    setBtnLoading('btn-read-md-file', false);
                    setBtnLoading('btn-generate-ai', false);
                } else {
                    activeCommandPlatform = null;
                }
                updateShareBtn();
                updateThreadShareBtn();
                updateBlogPublishButtonsState();
                break;
            }

            case 'credentialsCleared': {
                document.querySelectorAll<HTMLInputElement>('.provider-panel input[type="password"]').forEach(input => { input.value = ''; });
                Object.keys(aiKeySaved).forEach(provider => {
                    aiModelRequests[provider] = (aiModelRequests[provider] || 0) + 1;
                    renderAiKeyStatus(provider, false);
                    const select = get<HTMLSelectElement>(`${provider}Model`);
                    if (select) {
                        select.disabled = true;
                        select.innerHTML = '<option value="" disabled selected>Enter API key to load models...</option>';
                    }
                });
                break;
            }
            case 'updateConfiguration': {
                const keys = (msg.aiKeysSaved || {}) as Record<string, boolean>;
                Object.entries(keys).forEach(([provider, saved]) => {
                    renderAiKeyStatus(provider, saved);
                });
                break;
            }
            case 'aiModelSelectionApplied': {
                const provider = String(msg.provider);
                const input = get(`${provider}Panel`)?.querySelector<HTMLInputElement>('input[type="password"]');
                if (input) input.value = '';
                aiModelRequests[provider] = (aiModelRequests[provider] || 0) + 1;
                renderAiKeyStatus(provider, true);
                toast('AI model applied!', 'success');
                const modal = get('modelModal');
                if (modal) modal.style.display = 'none';
                break;
            }

            case 'aiModelsLoaded': {
                const provider = msg.provider as string;
                const models = (msg.models as string[]) || [];
                if (msg.requestId !== undefined && msg.requestId !== aiModelRequests[provider]) break;
                renderAiKeyStatus(provider, !!msg.hasSavedKey);
                if (provider) {
                    const select = get<HTMLSelectElement>(`${provider}Model`);

                    if (select) {
                        const currentVal = select.value;
                        select.innerHTML = '';
                        if (models.length > 0) {
                            select.disabled = false;
                            models.forEach(m => {
                                const opt = document.createElement('option');
                                opt.value = m;
                                opt.textContent = m;
                                if (m === currentVal) opt.selected = true;
                                select.appendChild(opt);
                            });
                            if (!select.value && select.options.length > 0) {
                                select.selectedIndex = 0;
                            }
                        } else {
                            select.disabled = true;
                            const opt = document.createElement('option');
                            opt.value = '';
                            opt.disabled = true;
                            opt.selected = true;
                            const providerLabels: Record<string, string> = {
                                gemini: 'Google Gemini',
                                openai: 'OpenAI ChatGPT',
                                claude: 'Anthropic Claude',
                                xai: 'xAI Grok',
                                deepseek: 'DeepSeek'
                            };
                            opt.textContent = `Enter your ${providerLabels[provider] || provider} API key to load models`;
                            select.appendChild(opt);

                        }
                    }
                }
                break;
            }

            case 'userCtaLinksLoaded':
            case 'userCtaLinksUpdated': {
                savedUserCtaLinks = (msg.links as UserCtaLink[]) || [];
                const validIds = new Set(savedUserCtaLinks.map(link => link.id));
                for (const selectedId of selectedSavedCtaLinkIds) {
                    if (!validIds.has(selectedId)) {
                        selectedSavedCtaLinkIds.delete(selectedId);
                    }
                }
                renderSavedCtaLinks();
                updateCtaActiveCount();
                break;
            }

            case 'releaseContextExtracted': {
                if (msg.requestId !== releaseContextRequestId) break;
                releaseContextLoading = false;
                releaseContextAvailable = !!msg.context;
                resetDotShareAiModalBtn();
                if (msg.context) {
                    cachedReleaseContext = msg.context as ProjectReleaseContext;
                    updateAiContextBadges(cachedReleaseContext);
                }
                break;
            }

            case 'releaseContextExtractionFailed': {
                if (msg.requestId !== releaseContextRequestId) break;
                releaseContextLoading = false;
                cachedReleaseContext = null;
                releaseContextAvailable = false;
                const button = get<HTMLButtonElement>('btn-ai-modal-generate');
                if (button) { button.disabled = true; button.textContent = 'Release unavailable'; }
                break;
            }

            case 'releasePostGenerated': {
                resetDotShareAiModalBtn();

                const modal = get('dotshareAiModal');
                if (modal) modal.style.display = 'none';

                const result = msg.result as GeneratedPlatformContent;
                if (!result) break;
                showAiQualityWarnings(result.qualityWarnings);
                if (result.qualityWarnings?.length) toast(result.qualityWarnings.join(' '), 'warning', 12000);

                const isThreadsWorkspace = window.__PLATFORM_DATA__?.workspaceType === 'threads';
                const isBlogWorkspace = window.__PLATFORM_DATA__?.workspaceType === 'blogs' || result.platform === 'devto' || !!result.frontmatter;

                if (isBlogWorkspace) {
                    const blogBody = get<HTMLTextAreaElement>('blog-body');
                    if (blogBody) {
                        let cleanBody = result.rawContent || '';
                        if (result.frontmatter?.title) {
                            cleanBody = cleanBody.replace(/^#\s+[^\r\n]+(?:\r?\n)+/, '').trim();
                        }
                        blogBody.value = cleanBody;
                        blogBody.dispatchEvent(new Event('input'));
                    }
                    if (result.frontmatter) {
                        const eTitle = get<HTMLInputElement>('blog-title');
                        if (eTitle && result.frontmatter.title) eTitle.value = result.frontmatter.title;
                        const eTags = get<HTMLInputElement>('blog-tags');
                        if (eTags && result.frontmatter.tags) {
                            eTags.value = Array.isArray(result.frontmatter.tags) ? result.frontmatter.tags.join(', ') : String(result.frontmatter.tags);
                        }
                        const eDesc = get<HTMLTextAreaElement>('blog-description');
                        if (eDesc && result.frontmatter.description) eDesc.value = result.frontmatter.description;
                        const eUrl = get<HTMLInputElement>('blog-canonical-url');
                        if (eUrl) eUrl.value = '';
                        if (result.frontmatter.published !== undefined) {
                            const v = result.frontmatter.published ? 'published' : 'draft';
                            [get<HTMLSelectElement>('blog-publish-status-devto'), get<HTMLSelectElement>('blog-publish-status')].forEach(s => { if (s) s.value = v; });
                        }
                    }
                    revealBlogPublisherUi();
                    updateBlogRenderedPreview();
                    updateBlogStats();
                    updateBlogPublishButtonsState();
                } else if (result.isThread && result.threadParts && result.threadParts.length > 0) {
                    populateThreadFromParts(result.threadParts);
                } else if (isThreadsWorkspace) {
                    // Single post on threads workspace (e.g. single tweet on X) -> populate as single post in thread composer
                    populateThreadFromParts([result.rawContent]);
                } else if (textarea) {
                    textarea.value = result.rawContent;
                    textarea.dispatchEvent(new Event('input'));
                    updateCharCounter();
                    updateShareBtn();
                }

                // Show tone bar
                const toneBar = get('ai-tone-bar');
                const toneLabel = get('ai-tone-label');
                if (toneBar && toneLabel) {
                    const toneNameMap: Record<string, string> = {
                        professional: 'Professional',
                        casual_build_in_public: 'Build in Public',
                        technical_deep_dive: 'Technical',
                        tldr_bulletin: 'TL;DR',
                        full_markdown_article: 'Full Article (Dev.to)'
                    };
                    toneLabel.textContent = `✨ ${toneNameMap[lastGeneratedTone] || 'AI'}`;
                    toneBar.style.display = 'inline-flex';
                }

                if (isBlogWorkspace) {
                    toast(`✨ DotShare AI generated your Dev.to article with metadata (${result.charCount} chars)!`, 'success');
                } else {
                    toast(`✨ DotShare AI generated post (${result.charCount} chars)!`, 'success');
                }
                break;
            }

            case 'updatePost':
                showAiQualityWarnings();
                if (msg.post && textarea) { textarea.value = String(msg.post); updateCharCounter(); updateShareBtn(); }
                if (msg.post) {
                    const b = get<HTMLTextAreaElement>('blog-body');
                    if (b) {
                        b.value = String(msg.post);
                        updateBlogStats();
                        updateBlogRenderedPreview();
                    }
                }
                updateBlogPublishButtonsState();
                setBtnLoading('btn-dotshare-ai', false);
                setBtnLoading('btn-generate-ai', false);
                setBtnLoading('btn-share', false);
                if (btnGen) { btnGen.disabled = false; btnGen.textContent = '✨ DotShare AI'; }
                if (btnShare) { btnShare.disabled = false; btnShare.textContent = activeCommandPlatform ? `🚀 Share to ${activeCommandPlatform.charAt(0).toUpperCase() + activeCommandPlatform.slice(1)}` : '🚀 Share Now'; }
                toast('Post updated!', 'success');
                break;

            case 'injectText':
                if (msg.text) {
                    const appendText = `\n${msg.text}\n`;
                    if (window.__PLATFORM_DATA__?.workspaceType === 'blogs') {
                        const b = get<HTMLTextAreaElement>('blog-body');
                        if (b) {
                            const insertIndex = b.selectionStart !== undefined ? b.selectionStart : b.value.length;
                            b.value = b.value.slice(0, insertIndex) + appendText + b.value.slice(insertIndex);
                            b.dispatchEvent(new Event('input'));
                        }
                    } else {
                        if (textarea) {
                            const insertIndex = textarea.selectionStart !== undefined ? textarea.selectionStart : textarea.value.length;
                            textarea.value = textarea.value.slice(0, insertIndex) + appendText + textarea.value.slice(insertIndex);
                            textarea.dispatchEvent(new Event('input'));
                        }
                    }
                    toast('Link injected!', 'success');
                }
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
                    [get<HTMLSelectElement>('blog-publish-status-devto'), get<HTMLSelectElement>('blog-publish-status')].forEach(s => { if (s) s.value = v; });
                }
                updateBlogRenderedPreview();
                toast('Frontmatter loaded!', 'success');
                break;
            }

            case 'articlePreviewLinkResult':
                if (msg.opened !== true) toast('VS Code did not open this link.', 'warning');
                break;

            case 'status':
                toast(String(msg.status || ''), (msg.type as 'success' | 'error' | 'warning' | 'info') || 'info');
                if (msg.type === 'error') {
                    setComposerLocked(false);
                    ['btn-share', 'btn-publish-blog', 'btn-publish-blog-devto', 'btn-read-md-file', 'btn-dotshare-ai', 'btn-generate-ai'].forEach(id => setBtnLoading(id, false));
                    const tBtn = get<HTMLButtonElement>('btn-share-thread');
                    if (tBtn) { tBtn.classList.remove('loading'); tBtn.disabled = false; tBtn.textContent = '🚀 Share Thread'; }
                    resetBlogPublishUi();
                    resetDotShareAiModalBtn();

                    if (String(msg.status || '').includes('API Key is required')) {
                        openModelModal();
                    }
                } else {
                    // success / info / warning — only reset utility buttons
                    setBtnLoading('btn-read-md-file', false);
                    setBtnLoading('btn-dotshare-ai', false);
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
                const platformLabel = platform === 'devto' ? 'Dev.to' : platform;
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

                if (msg.placeholderRef === 'COVER_IMAGE') {
                    const coverInput = get<HTMLInputElement>('blog-cover-image');
                    if (coverInput) {
                        coverInput.value = path;
                        coverInput.dispatchEvent(new Event('input')); // Trigger any input listeners
                    }
                    const btn = get<HTMLButtonElement>('btn-upload-cover');
                    if (btn) btn.textContent = '📤 Upload';
                    toast('Cover image uploaded successfully!', 'success');
                    break;
                }

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

                    // Insert markdown image link into active text area ONLY for blog writers
                    if (scheduleMode === 'blog') {
                        const activeEditor = get<HTMLTextAreaElement>('blog-body');
                        if (activeEditor) {
                            const altPlaceholder = 'Image description';
                            const mdLink = `\n![${altPlaceholder}](${path})\n`;

                            // If a drag-and-drop placeholder exists, replace it in-place
                            const dndRef = msg.placeholderRef ? String(msg.placeholderRef) : null;
                            const dndMd  = dndRef ? `\n${dndRef}\n` : null;
                            let insertIndex: number;

                            if (dndMd && activeEditor.value.includes(dndMd)) {
                                // Replace placeholder and mark where alt text starts
                                insertIndex = activeEditor.value.indexOf(dndMd) + 2; // +2 for '\n!'
                                activeEditor.value = activeEditor.value.replace(dndMd, mdLink);
                            } else {
                                // Regular button upload — append at end
                                insertIndex = activeEditor.value.length + 2;
                                activeEditor.value += mdLink;
                            }

                            activeEditor.dispatchEvent(new Event('input'));

                            // 🪄 Auto-select "Image description" so the user types over it instantly
                            activeEditor.focus();
                            const selStart = insertIndex + 2; // skip '!['
                            activeEditor.setSelectionRange(selStart, selStart + altPlaceholder.length);

                            toast('Image uploaded! Type a description for SEO 🔍', 'success', 5000);
                        }
                    } else {
                        toast('Image attached to post! 📸', 'success');
                    }
                }
                break;
            }

            case 'mediaAttached': {
                const files = msg.mediaFiles as Array<{ mediaPath: string; fileName: string; fileSize?: number }> | undefined;
                if (files && files.length > 0) {
                    const MAX = 4; // الحد الأقصى للصور
                    const toAdd = files.slice(0, MAX - activeMediaPaths.length);
                    
                    toAdd.forEach(f => {
                        // بنضيف الصورة للمصفوفة
                        activeMediaPaths.push(f.mediaPath);
                        
                        // لو إحنا في البلوج (Dev.to)، بنعملها Insert جوه الـ Markdown
                        if (scheduleMode === 'blog') {
                            const activeEditor = get<HTMLTextAreaElement>('blog-body');
                            if (activeEditor) {
                                const altPlaceholder = f.fileName || 'CodeSnap';
                                const mdLink = `\n![${altPlaceholder}](${f.mediaPath})\n`;
                                const insertIndex = activeEditor.selectionStart !== undefined ? activeEditor.selectionStart : activeEditor.value.length;
                                activeEditor.value = activeEditor.value.slice(0, insertIndex) + mdLink + activeEditor.value.slice(insertIndex);
                                activeEditor.dispatchEvent(new Event('input'));
                            }
                        }
                    });
                    
                    // تحديث واجهة المستخدم لعرض الـ Thumbnails
                    renderMediaGrid();
                    if (files.length > toAdd.length) toast(`⚠️ Only ${MAX} images allowed. Extra skipped.`, 'warning');
                    
                    const preview = get('media-preview');
                    const ci      = get('media-count-info');
                    if (preview) preview.style.display = 'block';
                    if (ci) ci.textContent = activeMediaPaths.length === 1 ? toAdd[0].fileName : `${activeMediaPaths.length} files selected`;
                    
                    toast('📸 CodeSnap attached!', 'success');
                }
                break;
            }

            case 'mediaRemoved':
                activeMediaPaths = [];
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
                    if (window.__PLATFORM_DATA__?.platform === 'gist') {
                        const gistFileNameInput = get<HTMLInputElement>('gistFileName');
                        const gistDescriptionInput = get<HTMLInputElement>('gistDescription');
                        const gistCodeInput = get<HTMLTextAreaElement>('gistCode');
                        
                        const gistData = d.data as { bodyMarkdown?: string; description?: string; visibility?: string };
                        
                        if (gistFileNameInput && d.title) gistFileNameInput.value = d.title;
                        if (gistCodeInput) gistCodeInput.value = gistData.bodyMarkdown ?? '';
                        if (gistDescriptionInput) gistDescriptionInput.value = gistData.description ?? '';
                        
                        if (gistData.visibility) {
                            const rb = document.querySelector(`input[name="gistVisibility"][value="${gistData.visibility}"]`) as HTMLInputElement;
                            if (rb) rb.checked = true;
                        }
                        toast('Gist Draft loaded', 'info');
                        
                        // Switch to compose view
                        const composeBtn = document.querySelector('.inner-sidebar .tab-btn[data-target="view-compose"]') as HTMLButtonElement;
                        if (composeBtn) composeBtn.click();
                        
                    } else if (d.type === 'article') {
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
                        
                        const composeBtn = document.querySelector('.inner-sidebar .tab-btn[data-target="view-compose"]') as HTMLButtonElement;
                        if (composeBtn) composeBtn.click();
                    } else {
                        const postText = get<HTMLTextAreaElement>('post-text');
                        if (postText) postText.value = d.data.text ?? '';
                        updateShareBtn();
                        toast('Draft loaded', 'info');
                    }
                }
                break;
            }

            case 'updateScheduledPosts': {
                console.log('[DotShare] Received scheduled posts:', msg.scheduledPosts);
                renderScheduledPosts((msg.scheduledPosts as ScheduledPost[]) ?? []);
                break;
            }

            case 'SET_PROFILE':
                console.log('[DotShare] Profile loaded:', msg.data);
                // Profile data can be used for other UI enhancements if needed
                break;

            case 'SET_CONNECTIONS': {
                // Platforms the user has connected via OAuth in the dashboard.
                // Any platform NOT in this list gets the schedule button disabled
                // with a hint to connect from the dashboard.
                const connected = (msg.platforms as string[]) ?? [];
                applyConnectionState(connected);
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
            <div class="draft-card${isActive ? ' draft-card--active' : ''}" data-draft-id="${escapeHtml(d.id)}" data-type="${escapeHtml(d.type)}" data-remote="${!!d.isRemote}" data-remote-id="${escapeHtml(d.remoteId ?? '')}">
                <div class="draft-card-title">${title}</div>
                <div class="draft-card-meta">${badge} ${escapeHtml(platforms)} · ${date}</div>
                <div class="draft-card-actions">
                    <button class="btn btn-secondary btn-sm" data-action="edit-draft" data-id="${escapeHtml(d.id)}">✏️ Load</button>
                    ${!d.isRemote ? `<button class="btn btn-ghost btn-sm" data-action="delete-draft" data-id="${escapeHtml(d.id)}">🗑 Delete</button>` : ''}
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

// ── Render Scheduled Posts ────────────────────────────────────
interface ScheduledPost {
    id: string;
    scheduled_at: string;
    text_preview: string;
    platforms: string[];
    status: string;
    tier: 'free' | 'pro' | 'max';
}

function getTierInterval(tier: string): number {
    switch (tier.toLowerCase()) {
        case 'free': return 60;
        case 'pro': return 5;
        case 'max': return 0;
        default: return 60;
    }
}

function calculateApproxTime(scheduledAt: string, tier: string): Date {
    const date = new Date(scheduledAt);
    const interval = getTierInterval(tier);
    if (interval === 0) return date;

    const ms = date.getTime();
    const intervalMs = interval * 60 * 1000;
    
    // The scheduler runs hourly (Free) or every 5 minutes (Pro).
    // So if scheduled for 10:05, it will run at the next interval point.
    return new Date(Math.ceil(ms / intervalMs) * intervalMs);
}

function renderScheduledPosts(posts: ScheduledPost[]): void {
    console.log('[DotShare] Rendering scheduled posts, count:', posts.length);
    const container = get('scheduled-posts-container');
    if (!container) {
        console.error('[DotShare] scheduled-posts-container not found!');
        return;
    }

    if (!posts || posts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📅</div>
                <div style="font-weight:600;margin-bottom:8px;">No scheduled posts</div>
                <p style="font-size:12px;color:var(--vscode-descriptionForeground);">Schedule a post to see it here.</p>
            </div>`;
        return;
    }

    container.innerHTML = posts.map(p => {
        const intendedDate = new Date(p.scheduled_at);
        const approxDate = calculateApproxTime(p.scheduled_at, p.tier);
        
        const dateStr = intendedDate.toLocaleString(undefined, { 
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
        });
        const approxStr = approxDate.toLocaleTimeString(undefined, {
            hour: '2-digit', minute: '2-digit'
        });

        const text = escapeHtml(p.text_preview);
        const platforms = escapeHtml(p.platforms.join(', '));
        const isMax = p.tier.toLowerCase() === 'max';
        const safeScheduledAt = escapeHtml(p.scheduled_at);
        const safeStatus = escapeHtml(p.status);
        const safeTier = escapeHtml(p.tier);
        const safeId = escapeHtml(p.id);
        
        return `
            <div class="draft-card scheduled-card" style="margin-bottom: 12px; position: relative;" 
                 data-time="${safeScheduledAt}" data-approx="${approxDate.toISOString()}">
                <div class="draft-card-title">${text}</div>
                <div class="draft-card-meta">
                    <span class="draft-badge" style="background:var(--vscode-charts-orange)">${safeStatus}</span>
                    <span class="draft-badge" style="background:var(--vscode-badge-background); color:var(--vscode-badge-foreground)">${safeTier}</span>
                    ${platforms}
                </div>
                <div style="font-size: 11px; margin-top: 8px; color: var(--vscode-descriptionForeground); display: flex; flex-direction: column; gap: 2px;">
                    <div>📅 Intended: ${dateStr}</div>
                    <div style="font-weight: 600; color: var(--vscode-foreground);">
                        🚀 Approx. Execution: ${isMax ? 'Exact Time' : approxStr}
                    </div>
                    <div class="countdown-timer" style="margin-top: 4px; font-weight: bold; color: var(--vscode-charts-blue);">
                        Calculating...
                    </div>
                </div>
                <div class="draft-card-actions" style="margin-top: 12px;">
                    <button class="btn btn-ghost btn-sm" data-action="cancel-scheduled" data-id="${safeId}">🗑 Cancel</button>
                </div>
            </div>
        `;
    }).join('');

    // Wire cancel buttons
    container.querySelectorAll<HTMLButtonElement>('[data-action="cancel-scheduled"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            if (id) send('cancelScheduledPost', { scheduledPostId: id });
        });
    });

    // Initial update
    updateScheduledCountdowns();
}

let lastAutoRefresh = 0;

function updateScheduledCountdowns() {
    const cards = document.querySelectorAll<HTMLElement>('.scheduled-card');
    let needsRefresh = false;

    cards.forEach(card => {
        const approxStr = card.getAttribute('data-approx');
        if (!approxStr) return;

        const target = new Date(approxStr);
        const diff = target.getTime() - Date.now();
        const countdownEl = card.querySelector<HTMLElement>('.countdown-timer');
        if (!countdownEl) return;

        if (diff <= 0) {
            countdownEl.textContent = '⏱️ Processing by Server...';
            countdownEl.style.color = 'var(--vscode-charts-green)';
            needsRefresh = true;
        } else {
            const hours = Math.floor(diff / 3600000);
            const mins = Math.floor((diff % 3600000) / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            
            let timeStr = '';
            if (hours > 0) timeStr += `${hours}h `;
            timeStr += `${mins}m ${secs}s`;
            
            countdownEl.textContent = `⏳ Execution in: ${timeStr}`;
        }
    });

    // Auto-refresh the list every 15 seconds if there is a post currently processing
    if (needsRefresh && (Date.now() - lastAutoRefresh > 15000)) {
        lastAutoRefresh = Date.now();
        send('loadScheduledPosts');
    }
}

// Start the countdown loop
setInterval(updateScheduledCountdowns, 1000);


// ── Init ──────────────────────────────────────────────────────────────────────
try {
    send('loadConfiguration');
    
    // Sidebar Tab Navigation
    document.querySelectorAll<HTMLButtonElement>('.inner-sidebar .tab-btn[data-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            if (!targetId) return;

            // Update buttons
            document.querySelectorAll('.inner-sidebar .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update views
            document.querySelectorAll('.tab-view').forEach(view => {
                (view as HTMLElement).style.display = 'none';
                view.classList.remove('active-view');
            });

            const targetView = get(targetId);
            if (targetView) {
                targetView.style.display = 'block';
                targetView.classList.add('active-view');
            }

            // Optional: Auto-refresh data when switching tabs
            if (targetId === 'view-drafts') {
                send('listLocalDrafts');
            } else if (targetId === 'view-scheduled') {
                send('loadScheduledPosts');
            }
        });
    });

    // Wire refresh schedule button
    get('btn-refresh-schedule')?.addEventListener('click', () => {
        send('loadScheduledPosts');
        toast('Refreshing scheduled posts...', 'info');
    });

    // Settings placeholder
    document.querySelector('.nav-bottom .tab-btn')?.addEventListener('click', () => {
        toast('Settings coming soon...', 'info');
    });
    
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
            let text: string;
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

    // Fetch which platforms the user has connected via OAuth.
    // The response triggers SET_CONNECTIONS → applyConnectionState().
    send('loadOAuthConnections');

    // Fetch saved user CTA links
    send('loadUserCtaLinks');

    updateShareBtn();
    console.log('[DotShare platform-post] Initialized');
} catch (e) {
    console.error('[DotShare platform-post] Init error:', e);
    toast('Failed to initialize', 'error');
}

// ── OAuth Connection State ────────────────────────────────────────────────────
//
// Called whenever the backend sends SET_CONNECTIONS.
// Disables the "☁️ Schedule" button for platforms not yet connected via OAuth,
// and adds a tooltip so the user knows what to do.

function applyConnectionState(connectedPlatforms: string[]): void {
    globalConnectedPlatforms = connectedPlatforms;
    updateShareBtn();
    updateBlogPublishButtonsState();
    updateThreadShareBtn();
}
