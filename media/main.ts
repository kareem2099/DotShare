/**
 * DotShare Sidebar — Activity Bar WebView (Platforms/Settings only)
 * Entry point for media/index.html → compiled to media/app.js
 *
 * Architecture note:
 *   - This sidebar only manages platform credentials & OAuth.
 *   - "Create Post" and "Analytics" are separate full webviews (activity bar panels).
 *   - Clicking "✨ Create Post" on any card sends `openFullWebview { action:'createPost' }`.
 */

// ── VS Code API ──────────────────────────────────────────────
interface VsCodeApiSidebar {
    postMessage(msg: unknown): void;
}

const vscodeSidebar = ((): VsCodeApiSidebar => {
    const w = typeof window !== 'undefined' ? (window as any) : undefined;
    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
    if (w?.vscodeSidebar) return w.vscodeSidebar;
    if (g?.vscodeSidebar) return g.vscodeSidebar;
    // Fallback: should not happen in prod
    return { postMessage: (msg: unknown) => console.warn('[DotShare] vscodeSidebar not ready', msg) };
})();

// ── DOM Element Cache ────────────────────────────────────────
const _elCache: Record<string, HTMLElement | null> = {};
function getEl<T extends HTMLElement>(id: string): T | null {
    if (_elCache[id] === undefined) _elCache[id] = document.getElementById(id);
    return _elCache[id] as T | null;
}

// ── Status Toast ─────────────────────────────────────────────
function showStatus(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const el = getEl('statusMessage');
    if (!el) return;
    el.textContent = message;
    el.className = `status-message ${type}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ── Value Helpers ────────────────────────────────────────────
function getValue(id: string): string {
    return (getEl<HTMLInputElement>(id)?.value ?? '').trim();
}

function setInputValue(id: string, value: string): void {
    const el = getEl<HTMLInputElement>(id);
    if (el && value !== undefined) el.value = value;
}

// ── send ─────────────────────────────────────────────────────
function send(msg: Record<string, unknown>): void {
    try {
        vscodeSidebar.postMessage(msg);
    } catch (e) {
        console.error('[DotShare] postMessage failed', e);
    }
}

// ── Platform Credential Savers ───────────────────────────────
const platformSavers: Record<string, () => void> = {
    linkedin: () => send({ command: 'saveLinkedinToken', linkedinToken: getValue('linkedinToken') }),
    telegram: () => send({ command: 'saveTelegramCredentials', telegramBot: getValue('telegramBot'), telegramChat: getValue('telegramChat') }),
    x: () => send({ command: 'saveXCredentials', xAccessToken: getValue('xAccessToken'), xAccessSecret: getValue('xAccessSecret') }),
    facebook: () => send({ command: 'saveFacebookToken', facebookToken: getValue('facebookToken'), facebookPageToken: getValue('facebookPageToken'), facebookPageId: getValue('facebookPageId') }),
    discord: () => send({ command: 'saveDiscordWebhook', discordWebhookUrl: getValue('discordWebhook') }),
    reddit: () => send({ command: 'saveRedditCredentials', redditAccessToken: getValue('redditAccessToken'), redditRefreshToken: '' }),
    bluesky: () => send({ command: 'saveBlueSkyCredentials', blueskyIdentifier: getValue('blueskyIdentifier'), blueskyPassword: getValue('blueskyPassword') }),
    devto: () => send({ command: 'saveDevToCredentials', devtoApiKey: getValue('devtoApiKey') }),
    medium: () => send({ command: 'saveMediumCredentials', mediumAccessToken: getValue('mediumAccessToken') }),
};

// ── Article publisher (Dev.to / Medium) — mirrors media/webview ─────────
const BLOG_BTN_LABEL_DEVTO = '🚀 Publish to Dev.to';
const BLOG_BTN_LABEL_MEDIUM = '🚀 Publish to Medium';

function getBlogBodyText(): string {
    return getEl<HTMLTextAreaElement>('blog-body')?.value.trim() || '';
}

function revealBlogPublisherUi(): void {
    const preview = getEl('blog-preview');
    if (preview) preview.style.display = 'block';
    const devtoCard = getEl('blog-publish-devto-card');
    const mediumCard = getEl('blog-publish-medium-card');
    if (devtoCard) devtoCard.style.display = 'block';
    if (mediumCard) mediumCard.style.display = 'block';
    updateBlogPublishButtonsState();
}

function updateBlogPublishButtonsState(): void {
    const has = getBlogBodyText().length > 0;
    const bDev = getEl<HTMLButtonElement>('btn-publish-blog-devto');
    const bMed = getEl<HTMLButtonElement>('btn-publish-blog-medium');
    if (bDev) bDev.disabled = !has;
    if (bMed) bMed.disabled = !has;
}

function resetBlogPublishUi(): void {
    const has = getBlogBodyText().length > 0;
    const bDev = getEl<HTMLButtonElement>('btn-publish-blog-devto');
    if (bDev) {
        bDev.disabled = !has;
        bDev.textContent = BLOG_BTN_LABEL_DEVTO;
    }
    const bMed = getEl<HTMLButtonElement>('btn-publish-blog-medium');
    if (bMed) {
        bMed.disabled = !has;
        bMed.textContent = BLOG_BTN_LABEL_MEDIUM;
    }
}

function sendBlogShare(platform: 'devto' | 'medium', publishStatus: string): void {
    const postText = getBlogBodyText();
    if (!postText) {
        showStatus('No article body to publish. Read a Markdown file or paste content first.', 'error');
        return;
    }
    const title = getValue('blog-title');
    const tagsInput = getValue('blog-tags');
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : undefined;
    const description = getEl<HTMLTextAreaElement>('blog-description')?.value.trim();
    const coverImage = getValue('blog-cover-image');
    const canonicalUrl = getValue('blog-canonical-url');
    const series = getValue('blog-series');
    send({
        command: 'shareBlog',
        platforms: [platform],
        post: postText,
        title: title || undefined,
        tags,
        description: description || undefined,
        coverImage: coverImage || undefined,
        canonicalUrl: canonicalUrl || undefined,
        series: series || undefined,
        publishStatus,
        published: publishStatus === 'published',
    });
    showStatus('Publishing article…', 'info');
}

function wireBlogPublishButton(btn: HTMLButtonElement | null, platform: 'devto' | 'medium', getStatus: () => string): void {
    if (!btn) return;
    btn.addEventListener('click', () => {
        try {
            const publishStatus = getStatus() || 'draft';
            btn.disabled = true;
            btn.textContent = '⏳ Publishing...';
            sendBlogShare(platform, publishStatus);
        } catch (e) {
            console.error('[DotShare Sidebar] Publish error', e);
            showStatus('Failed to publish article', 'error');
            resetBlogPublishUi();
        }
    });
}

// ── OAuth ────────────────────────────────────────────────────
function openOAuth(platform: string): void {
    send({ command: 'openOAuth', platform });
    showStatus(`Opening ${platform} OAuth…`, 'info');
}

function disconnectOAuth(platform: string): void {
    send({ command: 'disconnectOAuth', platform });
    showStatus(`Disconnected from ${platform}`, 'success');
}

// ── OAuth Button UI Sync ─────────────────────────────────────
// Platforms that use OAuth (connect/disconnect flow)
const OAUTH_PLATFORMS = ['linkedin', 'x', 'facebook', 'reddit'] as const;
type OAuthPlatform = typeof OAUTH_PLATFORMS[number];

function updateOAuthButtons(tokenMap: Record<string, string | undefined>): void {
    OAUTH_PLATFORMS.forEach(platform => {
        const hasToken = !!(tokenMap[platform]);
        const connectBtn = getEl(`oauthConnect_${platform}`);
        const disconnectBtn = getEl(`oauthDisconnect_${platform}`);
        if (connectBtn) connectBtn.style.display = hasToken ? 'none' : 'inline-flex';
        if (disconnectBtn) disconnectBtn.style.display = hasToken ? 'inline-block' : 'none';
    });
}

// ── Theme Button Sync ────────────────────────────────────────
function updateThemeButton(): void {
    const btn = getEl('themeToggle');
    if (!btn) return;
    const isDark = document.body.classList.contains('dark');
    const icon = btn.querySelector<HTMLElement>('.icon');
    const text = btn.querySelector<HTMLElement>('.text');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    if (text) text.textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

// ── Apply Translations ───────────────────────────────────────
function applyTranslations(dict: Record<string, string>): void {
    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.getAttribute('data-key');
        if (!key || !dict[key]) return;
        if (el.tagName === 'INPUT') {
            (el as HTMLInputElement).placeholder = dict[key];
        } else {
            el.textContent = dict[key];
        }
    });
}

// ── Saved APIs Modal ─────────────────────────────────────────
let _currentSavedApisPlatform = '';

function openSavedApisModal(platform: string): void {
    _currentSavedApisPlatform = platform;
    const platformNameEl = getEl('currentPlatformName');
    if (platformNameEl) platformNameEl.textContent = `— ${platform.charAt(0).toUpperCase() + platform.slice(1)}`;
    send({ command: 'loadSavedApis', platform });
}

function renderSavedApis(savedApis: Array<{ id: string; name: string; isDefault?: boolean }>): void {
    const listEl = getEl('savedApisList');
    if (!listEl) return;
    if (!savedApis.length) {
        listEl.innerHTML = '<div class="no-saved-apis"><p>No saved API configurations yet.</p></div>';
    } else {
        listEl.innerHTML = savedApis.map(api => `
            <div class="saved-api-item">
                <div class="saved-api-info">
                    <span class="saved-api-name">${escapeHtml(api.name)}</span>
                    ${api.isDefault ? '<span style="color:var(--success);font-size:10px;">Default</span>' : ''}
                </div>
                <div class="saved-api-actions">
                    <button class="btn btn-sm btn-secondary" data-action="loadApi" data-id="${api.id}">Load</button>
                    <button class="btn btn-sm btn-ghost" data-action="deleteApi" data-id="${api.id}">Delete</button>
                </div>
            </div>
        `).join('');

        // Wire delegated clicks
        listEl.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                const id = btn.getAttribute('data-id') ?? '';
                if (action === 'loadApi') {
                    send({ command: 'loadApiConfig', apiId: id });
                    showStatus('Loading configuration…', 'info');
                    const modal = getEl('savedApisModal');
                    if (modal) modal.style.display = 'none';
                } else if (action === 'deleteApi') {
                    send({ command: 'deleteApiConfig', apiId: id });
                    showStatus('Configuration deleted!', 'success');
                }
            });
        });
    }
    const modal = getEl('savedApisModal');
    if (modal) modal.style.display = 'flex';
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Auth Server Health Check ────────────────────────────────
let authServerHealthy = true;

async function checkAuthServerHealth(): Promise<void> {
    try {
        const authServerUrl = 'https://dotshare-auth-server.vercel.app';
        const response = await fetch(`${authServerUrl}/`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000), // 5 second timeout
        });
        authServerHealthy = response.ok;
    } catch (error) {
        console.warn('[Server Health] Auth server is down or unreachable:', error instanceof Error ? error.message : String(error));
        authServerHealthy = false;
    }
    setOAuthButtonsState();
}

function setOAuthButtonsState(): void {
    const oauthBtns = document.querySelectorAll<HTMLButtonElement>('[id^="oauthConnect_"]');
    const serverStatusMsg = 'Server Under Maintenance - OAuth temporarily unavailable';
    
    oauthBtns.forEach(btn => {
        if (!authServerHealthy) {
            btn.disabled = true;
            btn.title = serverStatusMsg;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.classList.add('oauth-disabled');
        } else {
            btn.disabled = false;
            btn.title = '';
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.classList.remove('oauth-disabled');
        }
    });
}

// ── Event Listeners ──────────────────────────────────────────
function initEventListeners(): void {

    // ① Auto-Save on Blur (replacing old data-save buttons)
    const blurAutoSaves: Record<string, string> = {
        linkedinToken: 'linkedin',
        telegramBot: 'telegram',
        telegramChat: 'telegram',
        xAccessToken: 'x',
        xAccessSecret: 'x',
        facebookToken: 'facebook',
        facebookPageToken: 'facebook',
        facebookPageId: 'facebook',
        discordWebhook: 'discord',
        redditAccessToken: 'reddit',
        blueskyIdentifier: 'bluesky',
        blueskyPassword: 'bluesky',
        devtoApiKey: 'devto',
        mediumAccessToken: 'medium'
    };

    Object.entries(blurAutoSaves).forEach(([inputId, platform]) => {
        const input = getEl<HTMLInputElement>(inputId);
        if (input) {
            input.addEventListener('blur', () => {
                const saver = platformSavers[platform];
                if (saver) {
                    saver();
                    showStatus('Credentials auto-saved!', 'success');
                }
            });
        }
    });

    // ② OAuth connect (id pattern: oauthConnect_<platform>)
    document.querySelectorAll<HTMLElement>('[id^="oauthConnect_"]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!authServerHealthy) {
                showStatus('Server under maintenance. OAuth temporarily unavailable.', 'error');
                return;
            }
            const platform = btn.getAttribute('data-platform');
            if (platform) openOAuth(platform);
        });
    });

    // ③ OAuth disconnect
    document.querySelectorAll<HTMLElement>('[id^="oauthDisconnect_"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const platform = btn.getAttribute('data-platform');
            if (platform) disconnectOAuth(platform);
        });
    });

    // ③-B OAuth Refresh
    document.querySelectorAll<HTMLElement>('[id^="oauthRefresh_"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const platform = btn.getAttribute('data-platform');
            if (platform) {
                send({ command: 'forceRefresh', platform });
                showStatus(`Refreshing ${platform} connection…`, 'info');
            }
        });
    });

    // ④ OAuth advanced toggle (show/hide manual token input)
    document.querySelectorAll<HTMLElement>('[id^="oauthAdvancedToggle_"]').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const platform = toggle.id.replace('oauthAdvancedToggle_', '');
            const content = getEl(`oauthAdvancedContent_${platform}`);
            const icon = toggle.querySelector<HTMLElement>('.toggle-icon');
            if (!content) return;
            const opening = content.style.display === 'none' || content.style.display === '';
            content.style.display = opening ? 'block' : 'none';
            if (icon) icon.textContent = opening ? '⌃' : '⌄';
        });
    });

    // ⑤ "✨ Create Post" button on each card → open full webview
    document.querySelectorAll<HTMLElement>('.create-post-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const platform = btn.getAttribute('data-platform') ?? '';
            send({ command: 'openFullWebview', action: 'createPost', platform });
            showStatus(`Opening post editor…`, 'info');
        });
    });

    // ⑥ "📚 Saved APIs" per platform
    document.querySelectorAll<HTMLElement>('.saved-apis-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const platform = btn.getAttribute('data-platform') ?? '';
            if (platform) openSavedApisModal(platform);
        });
    });

    // ⑦ Saved APIs modal — close
    getEl('closeSavedApisModal')?.addEventListener('click', () => {
        const modal = getEl('savedApisModal');
        if (modal) modal.style.display = 'none';
    });

    // ⑧ Add New API config button (renders inline form in modal body)
    getEl('addNewApiSetBtn')?.addEventListener('click', () => {
        const body = document.querySelector<HTMLElement>('#savedApisModal .modal-body');
        if (!body) return;
        if (body.querySelector('#inlineApiForm')) return;
        const form = document.createElement('div');
        form.id = 'inlineApiForm';
        form.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color);';
        form.innerHTML = `
            <div class="input-group">
                <label>Configuration Name</label>
                <input type="text" id="apiSetName" placeholder="e.g., Personal, Work…">
            </div>
            <div style="display:flex;gap:8px;margin-top:8px;">
                <button class="primary-btn" id="saveApiSetBtn" style="font-size:12px;padding:7px 14px;">💾 Save</button>
                <button class="secondary-btn" id="cancelApiEditBtn" style="font-size:12px;padding:7px 12px;">Cancel</button>
            </div>
        `;
        body.appendChild(form);
        form.querySelector('#saveApiSetBtn')?.addEventListener('click', () => {
            const name = (document.getElementById('apiSetName') as HTMLInputElement)?.value?.trim();
            if (!name) { showStatus('Please enter a name', 'error'); return; }
            send({ command: 'saveApiSet', name, platform: _currentSavedApisPlatform });
            showStatus('Configuration saved!', 'success');
            form.remove();
        });
        form.querySelector('#cancelApiEditBtn')?.addEventListener('click', () => form.remove());
    });

    // ⑨ Close any modal on backdrop click
    document.querySelectorAll<HTMLElement>('.modal').forEach(modal => {
        modal.addEventListener('click', e => {
            if (e.target === modal) modal.style.display = 'none';
        });
    });

    // ⑫ Language select
    getEl('languageSelect')?.addEventListener('change', e => {
        const lang = (e.target as HTMLSelectElement).value;
        send({ command: 'changeLanguage', language: lang });
    });

    // ⑬ Theme toggle
    getEl('themeToggle')?.addEventListener('click', () => {
        send({ command: 'toggleTheme' });
    });

    // ⑭ Quick action buttons (if present in sidebar)
    getEl('openPostBtn')?.addEventListener('click', () => {
        send({ command: 'openFullWebview', action: 'createPost' });
    });
    getEl('openAnalyticsBtn')?.addEventListener('click', () => {
        send({ command: 'openFullWebview', action: 'analytics' });
    });

    // Check auth server health on startup
    checkAuthServerHealth();
    
    // Periodically check server health (every 30 seconds)
    setInterval(() => {
        checkAuthServerHealth();
    }, 30000);
}

// ── Message Handler ──────────────────────────────────────────
window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as Record<string, any>;
    if (!msg?.command) return;

    switch (msg.command) {

        case 'updateConfiguration': {
            // Platform credentials
            setInputValue('linkedinToken', msg.linkedinToken ?? '');
            setInputValue('telegramBot', msg.telegramBot ?? '');
            setInputValue('telegramChat', msg.telegramChat ?? '');
            setInputValue('xAccessToken', msg.xAccessToken ?? '');
            setInputValue('xAccessSecret', msg.xAccessSecret ?? '');
            setInputValue('facebookToken', msg.facebookToken ?? '');
            setInputValue('facebookPageToken', msg.facebookPageToken ?? '');
            setInputValue('facebookPageId', msg.facebookPageId ?? '');
            setInputValue('discordWebhook', msg.discordWebhookUrl ?? '');
            setInputValue('redditAccessToken', msg.redditAccessToken ?? '');
            setInputValue('blueskyIdentifier', msg.blueskyIdentifier ?? '');
            setInputValue('blueskyPassword', msg.blueskyPassword ?? '');
            setInputValue('devtoApiKey', msg.devtoApiKey ?? '');
            setInputValue('mediumAccessToken', msg.mediumAccessToken ?? '');

            // OAuth buttons
            updateOAuthButtons({
                linkedin: msg.linkedinToken,
                x: msg.xAccessToken,
                facebook: msg.facebookToken,
                reddit: msg.redditAccessToken,
            });

            // Theme
            if (msg.theme !== undefined) {
                if (msg.theme === 'dark') document.body.classList.add('dark');
                else document.body.classList.remove('dark');
                updateThemeButton();
            }

            // Language select sync
            if (msg.language) {
                const sel = getEl<HTMLSelectElement>('languageSelect');
                if (sel) sel.value = msg.language;
            }

            // Translations
            if (msg.translations) applyTranslations(msg.translations);

            // AEGIS 1.4.0: Proactive Refresh Badges & Expiry Dates
            ['linkedin', 'x', 'facebook', 'reddit'].forEach(plt => {
                const soon = msg[`${plt}ShouldRefreshSoon`];
                const expiresAt = msg[`${plt}ExpiresAt`];
                updateAegisStatus(plt, soon, expiresAt);
            });
            break;
        }

        case 'themeChanged':
            if (msg.theme === 'dark') document.body.classList.add('dark');
            else document.body.classList.remove('dark');
            updateThemeButton();
            break;

        case 'languageChanged':
            if (msg.translations) applyTranslations(msg.translations);
            if (msg.language) {
                const sel = getEl<HTMLSelectElement>('languageSelect');
                if (sel) sel.value = msg.language;
            }
            break;

        case 'status':
            if (msg.status && msg.type) showStatus(msg.status, msg.type);
            if (msg.type === 'error') {
                // error handling
            }
            break;

        case 'updatePost':
            if (msg.post) {
                const blogBodyEl = getEl<HTMLTextAreaElement>('blog-body');
                if (blogBodyEl) blogBodyEl.value = String(msg.post);
                updateBlogPublishButtonsState();
                showStatus('Article body updated', 'success');
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
            if (!fm) break;
            if (fm.title) setInputValue('blog-title', fm.title);
            if (fm.tags?.length) setInputValue('blog-tags', fm.tags.join(', '));
            if (fm.description) {
                const el = getEl<HTMLTextAreaElement>('blog-description');
                if (el) el.value = fm.description;
            }
            if (fm.cover_image) setInputValue('blog-cover-image', fm.cover_image);
            if (fm.canonical_url) setInputValue('blog-canonical-url', fm.canonical_url);
            if (fm.series) setInputValue('blog-series', fm.series);
            if (fm.published !== undefined) {
                const v = fm.published ? 'published' : 'draft';
                const sd = getEl<HTMLSelectElement>('blog-publish-status-devto');
                const sm = getEl<HTMLSelectElement>('blog-publish-status-medium');
                if (sd) sd.value = v;
                if (sm) sm.value = v;
            }
            showStatus('Frontmatter loaded', 'success');
            break;
        }

        case 'shareComplete':
            // reset UI handled elsewhere
            break;

        case 'savedApisLoaded':
            if (Array.isArray(msg.savedApis)) renderSavedApis(msg.savedApis);
            break;

        case 'oauthTokenReceived':
            // Called after OAuth callback completes — update UI immediately
            if (msg.platform && msg.token) {
                updateOAuthButtons({ [msg.platform]: msg.token });
                showStatus(`${msg.platform} connected successfully!`, 'success');
            }
            break;
    }
});

/** AEGIS 1.4.0: Visual intelligence for token health */
function updateAegisStatus(platform: string, shouldRefreshSoon: boolean, expiresAt: string | number | undefined): void {
    const badge = getEl(`aegisBadge_${platform}`);
    const text = getEl(`expiryText_${platform}`);
    const refreshBtn = getEl(`oauthRefresh_${platform}`);
    const connectBtn = getEl(`oauthConnect_${platform}`);
    const disconnectBtn = getEl(`oauthDisconnect_${platform}`);

    const isConnected = !!(disconnectBtn && disconnectBtn.style.display !== 'none');

    if (!badge || !text || !refreshBtn || !isConnected) {
        if (badge) badge.style.display = 'none';
        if (refreshBtn) refreshBtn.style.display = 'none';
        return;
    }

    // 1. Refresh Button Visibility
    refreshBtn.style.display = shouldRefreshSoon ? 'inline-block' : 'none';

    // 2. Badge Visibility
    badge.style.display = (shouldRefreshSoon || expiresAt) ? 'inline-flex' : 'none';

    // 3. Expiry Formatting
    if (expiresAt) {
        const date = new Date(Number(expiresAt));
        const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        text.textContent = `Expires on ${dateStr}`;
        badge.title = `Your ${platform} session expires on ${date.toLocaleString()}. Click Refresh to renew early.`;
    } else {
        text.textContent = 'Token health: Stable';
        badge.title = 'Token health: Stable';
    }

    // 4. Highlight badge if soon
    badge.style.borderColor = shouldRefreshSoon ? 'rgba(245, 158, 11, 0.6)' : 'rgba(16, 185, 129, 0.3)';
    badge.style.color = shouldRefreshSoon ? 'var(--warning)' : 'var(--success)';
    const icon = badge.querySelector('.warning-icon');
    if (icon) icon.textContent = shouldRefreshSoon ? '⚠️' : '🛡️';
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        initEventListeners();

        send({ command: 'loadConfiguration' });
        console.log('[DotShare Sidebar] Initialized');
    } catch (e) {
        console.error('[DotShare Sidebar] Init error:', e);
        showStatus('Failed to initialize sidebar', 'error');
    }
});