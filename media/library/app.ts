import type { DraftView, TemplateView, LibrarySnapshot, DraftVariants, LibraryTool, ToolOutput } from '../../src/library/contracts';

interface ViewState { section?: 'drafts' | 'templates'; selected?: string; requests?: Record<string, { revision: number; previewId: string; requestId: string }>; }
declare const acquireVsCodeApi: () => { postMessage(message: unknown): void; getState(): ViewState | undefined; setState(state: ViewState): void; };
const vscode = acquireVsCodeApi();
const persisted = vscode.getState() || {};
let section: 'drafts' | 'templates' = persisted.section || 'drafts';
let selected = persisted.selected || '';
let snapshot: LibrarySnapshot | undefined;
let draft: DraftView | undefined;
let variants: DraftVariants | undefined;
let variantsError = '';
let recipe: TemplateView | undefined;
let variantAccount = '';
let dirty: 'draft' | 'variant' | 'template' | 'fill' | undefined;
let busy = false;
let changedWhileBusy = false;
let refreshing = false;
let sequence = 0;
let epoch = 0;
const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node;
}
function button(text: string, action: () => void, className?: string): HTMLButtonElement { const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', action); return node; }
function field(parent: HTMLElement, title: string, value = '', multiline = false): HTMLInputElement | HTMLTextAreaElement {
    const label = el('label', title); const input = multiline ? el('textarea') : el('input'); input.value = value;
    if (input instanceof HTMLTextAreaElement) { input.rows = 4; input.dir = 'auto'; }
    label.append(input); parent.append(label); return input;
}
function check(parent: HTMLElement, title: string, checked: boolean): HTMLInputElement {
    const label = el('label', undefined, 'check'); const input = el('input'); input.type = 'checkbox'; input.checked = checked; label.append(input, document.createTextNode(title)); parent.append(label); return input;
}
function value(id: string): string { return byId<HTMLInputElement | HTMLTextAreaElement>(id).value; }
function setValue(id: string, value: string): void { byId<HTMLInputElement | HTMLTextAreaElement>(id).value = value; }
function lines(text: string): string[] { return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean); }
function supported(name: LibraryTool): boolean { return !!snapshot?.connection.tools.includes(name); }
function persist(): void { vscode.setState({ ...persisted, section, selected }); }
function notice(text: string, kind = 'info'): void { const node = byId('notice'); node.textContent = text; node.className = `notice ${kind}`; node.hidden = !text; }
function markDirty(kind: NonNullable<typeof dirty>): void { dirty = kind; byId('dirty-bar').hidden = false; syncDraftActions(); }
function clean(): void { dirty = undefined; byId('dirty-bar').hidden = true; byId('external-change').hidden = true; }
function mayLeave(): boolean { if (!dirty) return true; notice('Save or discard your changes before opening another item.', 'warning'); return false; }
function request<T>(operation: string, payload: Record<string, unknown> = {}): Promise<T> {
    const id = `library-${++sequence}`;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('The request timed out. Reconnect and check the saved draft outcome before publishing again.')); }, 660000);
        pending.set(id, { resolve: result => resolve(result as T), reject, timer });
        vscode.postMessage({ command: 'libraryRequest', id, operation, ...payload });
    });
}
async function tool<T>(name: LibraryTool, args: Record<string, unknown> = {}): Promise<T> {
    const output = await request<ToolOutput<T>>('tool', { tool: name, args });
    if (!output.success && output.data === undefined) throw new Error(output.error || 'DotShare could not complete this action.');
    return output.data as T;
}
async function action(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true; notice(''); document.body.classList.add('busy');
    byId('workspace').inert = true; document.querySelector<HTMLElement>('.sidebar')!.inert = true;
    byId<HTMLButtonElement>('refresh').disabled = true; byId<HTMLButtonElement>('reconnect').disabled = true;
    try { await work(); } catch (error) { notice(error instanceof Error ? error.message : 'The action failed.', 'error'); }
    finally {
        busy = false; document.body.classList.remove('busy'); byId('workspace').inert = false; document.querySelector<HTMLElement>('.sidebar')!.inert = false;
        byId<HTMLButtonElement>('refresh').disabled = false; byId<HTMLButtonElement>('reconnect').disabled = false;
        if (changedWhileBusy) { changedWhileBusy = false; void refresh(); }
    }
}
function accountChoices(parent: HTMLElement, selectedIds: string[]): () => string[] {
    const inputs: { id: string; input: HTMLInputElement }[] = [];
    const accounts = snapshot?.accounts || [];
    for (const account of accounts) {
        const label = el('label', undefined, 'account-option'); const input = el('input'); input.type = 'checkbox'; input.checked = selectedIds.includes(account.id);
        label.append(input, document.createTextNode(account.name), el('small', account.platform)); parent.append(label); inputs.push({ id: account.id, input });
    }
    for (const id of selectedIds.filter(id => !accounts.some(account => account.id === id))) {
        const label = el('label', undefined, 'account-option'); const input = el('input'); input.type = 'checkbox'; input.checked = true;
        label.append(input, document.createTextNode(`${id} (not configured)`)); parent.append(label); inputs.push({ id, input });
    }
    if (!inputs.length) parent.append(el('p', 'No local accounts yet. Connect an account with the agent CLI; existing extension accounts are not copied automatically.', 'hint'));
    return () => inputs.filter(item => item.input.checked).map(item => item.id);
}
function renderList(): void {
    byId('draft-count').textContent = String(snapshot?.drafts.length || 0); byId('template-count').textContent = String(snapshot?.templates.length || 0);
    byId('tab-drafts').setAttribute('aria-selected', String(section === 'drafts')); byId('tab-templates').setAttribute('aria-selected', String(section === 'templates'));
    byId('new-item').textContent = section === 'drafts' ? 'New draft' : 'New template';
    byId<HTMLButtonElement>('new-item').disabled = !snapshot || !supported(section === 'drafts' ? 'create_draft' : 'save_template');
    byId('status-filter').hidden = section !== 'drafts';
    const query = value('search').toLowerCase(); const filter = value('status-filter'); const list = byId('items'); list.replaceChildren();
    const records = section === 'drafts' ? snapshot?.drafts || [] : snapshot?.templates || [];
    for (const item of records) {
        const name = 'title' in item ? item.title : item.name;
        if (!name.toLowerCase().includes(query) || ('status' in item && filter && item.status !== filter)) continue;
        const row = button('', () => { if (mayLeave()) void action(() => openItem(item.id)); }, `item${item.id === selected ? ' active' : ''}`);
        row.append(el('strong', name), el('small', `Revision ${item.revision}${'updatedAt' in item ? ` · ${new Date(item.updatedAt).toLocaleDateString()}` : ''}`));
        const badge = el('span', 'status' in item ? item.status : item.builtIn ? 'Built-in' : 'Custom', 'badge');
        if ('status' in item) badge.dataset.status = item.status;
        row.append(badge); list.append(row);
    }
    if (!list.childElementCount) list.append(el('p', snapshot ? 'No matching items.' : 'Connect to load your library.', 'empty'));
}
async function refresh(reconnect = false): Promise<void> {
    if (busy || refreshing) { changedWhileBusy = true; return; }
    refreshing = true;
    try {
        snapshot = await request<LibrarySnapshot>(reconnect ? 'reconnect' : 'snapshot');
        byId('connection-status').textContent = 'Connected · Local'; byId('connection-status').classList.add('ready');
        byId('library-home').textContent = snapshot.connection.home; renderList();
        if (dirty) byId('external-change').hidden = false;
        else if (selected) await openItem(selected);
    } catch (error) { byId('connection-status').textContent = 'Disconnected'; byId('connection-status').classList.remove('ready'); notice((error as Error).message, 'error'); }
    finally { refreshing = false; if (changedWhileBusy && !busy) { changedWhileBusy = false; void refresh(); } }
}
async function openItem(id: string): Promise<void> {
    const ticket = ++epoch; const targetSection = section;
    if (section === 'drafts') {
        let loaded: DraftView | undefined; let loadedVariants: DraftVariants | undefined;
        variantsError = '';
        for (let attempt = 0; attempt < 2; attempt++) {
            loaded = (await tool<{ draft: DraftView }>('get_draft', { draftId: id })).draft;
            try { loadedVariants = supported('get_draft_variants') ? await tool<DraftVariants>('get_draft_variants', { draftId: id }) : undefined; }
            catch (error) { loadedVariants = undefined; variantsError = (error as Error).message; }
            if (!loadedVariants || loadedVariants.revision === loaded.revision) break;
            loaded = undefined;
        }
        if (!loaded) throw new Error('The draft changed while loading. Refresh to get a consistent version.');
        if (ticket !== epoch || targetSection !== section || dirty) return;
        draft = loaded; variants = loadedVariants; recipe = undefined; selected = id;
        if (snapshot) {
            const summary = { id: loaded.id, title: loaded.title, revision: loaded.revision, status: loaded.status, updatedAt: loaded.updatedAt, accountIds: loaded.content.accountIds };
            snapshot.drafts = [summary, ...snapshot.drafts.filter(item => item.id !== loaded.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100);
        }
        clean(); renderDraft();
    } else {
        const loaded = (await tool<{ template: TemplateView }>('get_template', { templateId: id })).template;
        if (ticket !== epoch || targetSection !== section || dirty) return;
        recipe = loaded; draft = undefined; selected = id; clean(); renderTemplate();
        if (snapshot) snapshot.templates = [{ id: loaded.id, name: loaded.name, description: loaded.description, revision: loaded.revision, builtIn: loaded.builtIn, parameters: loaded.parameters }, ...snapshot.templates.filter(item => item.id !== loaded.id)].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 100);
    }
    persist(); renderList();
}
function postsView(parent: HTMLElement, posts: { text: string; media: string[]; characters?: number }[], label?: string): void {
    posts.forEach((post, index) => {
        const card = el('div', undefined, 'post'); if (label) card.append(el('div', `${label}${posts.length > 1 ? ` · Part ${index + 1}/${posts.length}` : ''}`, 'post-meta'));
        card.append(el('div', post.text || '(Image-only post)', 'post-text'));
        if (post.characters !== undefined) card.append(el('div', `${post.characters} characters`, 'post-meta'));
        for (const media of post.media) card.append(el('code', media, 'media-path'));
        parent.append(card);
    });
}
interface PartsEditor { read(): { text: string; media: string[] }[]; add(): void; }
function partsEditor(parent: HTMLElement, initial: { text: string; media: string[] }[], changed: () => void): PartsEditor {
    const values = initial.length ? initial.map(part => ({ ...part, media: [...part.media] })) : [{ text: '', media: [] as string[] }];
    const paint = (): void => {
        parent.replaceChildren();
        values.forEach((part, index) => {
            const card = el('div', undefined, 'thread-part'); const controls = el('div', undefined, 'part-controls'); controls.append(el('strong', `Part ${index + 1}`));
            const buttons = el('div');
            if (index > 0) buttons.append(button('Move up', () => { [values[index - 1], values[index]] = [values[index], values[index - 1]]; changed(); paint(); }, 'quiet'));
            if (values.length > 1) buttons.append(button('Remove', () => { values.splice(index, 1); changed(); paint(); }, 'quiet'));
            controls.append(buttons); card.append(controls);
            const text = field(card, 'Text', part.text, true); text.addEventListener('input', () => { part.text = text.value; changed(); });
            const media = field(card, 'Images, one per line', part.media.join('\n'), true); media.addEventListener('input', () => { part.media = lines(media.value); changed(); });
            parent.append(card);
        });
    };
    paint();
    return { read: () => values.map(part => ({ ...part })), add: () => { if (values.length < 100) { values.push({ text: '', media: [] }); changed(); paint(); } } };
}
function syncDraftActions(): void {
    const preview = byId<HTMLButtonElement>('preview-draft'); const publish = byId<HTMLButtonElement>('publish-draft'); const save = byId<HTMLButtonElement>('save-draft');
    if (!draft || !preview) return;
    const locked = !!draft.publication;
    preview.disabled = locked || !!dirty || !supported('preview_draft');
    publish.disabled = locked || !!dirty || draft.status !== 'Preview' || !supported('publish_draft');
    save.disabled = locked || dirty !== 'draft' || !supported('update_draft');
}
function renderDraft(): void {
    if (!draft) return;
    const current = draft;
    byId('workspace').replaceChildren((byId<HTMLTemplateElement>('draft-layout').content.cloneNode(true)));
    byId('draft-heading').textContent = current.title;
    byId('draft-meta').textContent = `Revision ${current.revision}${current.sourceTemplate ? ` · From ${current.sourceTemplate.id}, revision ${current.sourceTemplate.revision}` : ''}`;
    byId('draft-status').textContent = current.status; byId('draft-status').dataset.status = current.status;
    setValue('draft-title', current.title); setValue('draft-text', current.content.text); setValue('draft-media', current.content.media.join('\n'));
    byId('choose-images').addEventListener('click', () => void action(async () => {
        const result = await request<{ paths: string[] }>('pickImages');
        if (result.paths.length) { setValue('draft-media', [...new Set([...lines(value('draft-media')), ...result.paths])].join('\n')); markDirty('draft'); }
    }));
    const selectedAccounts = accountChoices(byId('draft-accounts'), current.content.accountIds);
    const thread = byId<HTMLInputElement>('draft-thread-mode'); thread.checked = !!current.content.posts;
    const parts = partsEditor(byId('draft-parts'), current.content.posts || [], () => markDirty('draft'));
    byId('add-draft-part').addEventListener('click', () => parts.add());
    const toggleThread = (): void => { byId('draft-message-wrap').hidden = thread.checked; byId('draft-thread-wrap').hidden = !thread.checked; };
    toggleThread(); thread.addEventListener('change', toggleThread);
    byId<HTMLInputElement>('draft-auto-split').checked = current.content.autoSplit;
    const article = current.content.article;
    byId<HTMLInputElement>('article-enabled').checked = !!article;
    byId<HTMLDetailsElement>('article-details').open = !!article;
    setValue('article-title', article?.title || ''); setValue('article-tags', article?.tags.join(', ') || '');
    setValue('article-description', article?.description || ''); setValue('article-canonical', article?.canonicalUrl || '');
    setValue('article-cover', article?.coverImage || ''); setValue('article-series', article?.series || '');
    byId<HTMLInputElement>('article-public').checked = article?.published ?? true;
    const toggleArticle = (): void => { byId('article-fields').hidden = !byId<HTMLInputElement>('article-enabled').checked; };
    toggleArticle(); byId('article-enabled').addEventListener('change', toggleArticle);
    const shared = byId('save-draft').closest('.card')!;
    shared.querySelectorAll('input,textarea').forEach(input => input.addEventListener('input', () => markDirty('draft')));
    byId('save-draft').addEventListener('click', () => void action(async () => {
        const ids = selectedAccounts();
        const articleData = byId<HTMLInputElement>('article-enabled').checked ? {
            title: value('article-title'), tags: value('article-tags').split(',').map(tag => tag.trim()).filter(Boolean), published: byId<HTMLInputElement>('article-public').checked,
            ...(value('article-description') && { description: value('article-description') }), ...(value('article-canonical') && { canonicalUrl: value('article-canonical') }),
            ...(value('article-cover') && { coverImage: value('article-cover') }), ...(value('article-series') && { series: value('article-series') }),
        } : null;
        const patch = { accountIds: ids, text: thread.checked ? '' : value('draft-text'), media: thread.checked ? [] : lines(value('draft-media')),
            posts: thread.checked ? parts.read() : null, article: articleData, autoSplit: byId<HTMLInputElement>('draft-auto-split').checked,
            overrides: Object.fromEntries(Object.entries(current.content.overrides).filter(([id]) => ids.includes(id))),
        };
        await tool('update_draft', { draftId: current.id, expectedRevision: current.revision, title: value('draft-title'), patch });
        clean(); await openItem(current.id); notice('Changes saved. Prepare a new preview before publishing.', 'success');
    }));
    byId('preview-draft').addEventListener('click', () => void action(async () => {
        if (dirty || current.publication) return;
        await tool('preview_draft', { draftId: current.id, expectedRevision: current.revision });
        await openItem(current.id); if (draft?.status === 'Preview') notice('Preview saved. Nothing has been published.', 'success');
    }));
    byId('publish-draft').addEventListener('click', () => void action(async () => {
        if (dirty || current.publication || current.status !== 'Preview' || !current.preview) return;
        persisted.requests ||= {};
        const previous = persisted.requests[current.id];
        const requestId = previous?.revision === current.revision && previous.previewId === current.preview.id ? previous.requestId : crypto.randomUUID();
        persisted.requests[current.id] = { revision: current.revision, previewId: current.preview.id, requestId }; persist();
        await tool('publish_draft', { draftId: current.id, expectedRevision: current.revision, previewId: current.preview.id, requestId });
        await openItem(current.id); notice(draft?.status === 'Published' ? 'Publication completed. See each account’s receipts below.' : 'Check the saved outcome and receipts below.', draft?.status === 'Published' ? 'success' : 'warning');
    }));
    byId('recover-draft').addEventListener('click', () => void action(() => openItem(current.id)));
    if (current.publication) {
        byId('draft-locked').hidden = false;
        byId('draft-locked').textContent = current.status === 'Published' ? 'This saved version was published. Its content is kept with the receipts.' : current.status === 'Scheduled' ? 'This saved version is scheduled on DotSuite. Cancel it from the DotSuite dashboard or with cancel_scheduled_post.' : 'This draft has a publication attempt. Inspect its saved outcome and destination accounts before taking further action. It will not be resent automatically.';
        shared.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('input,textarea,button').forEach(input => { input.disabled = true; });
    }
    renderVariants(); renderReview(); syncDraftActions();
}
function renderVariants(): void {
    const tabs = byId('variant-tabs'); const content = byId('variant-content'); if (!tabs || !draft) return;
    tabs.replaceChildren(); content.replaceChildren();
    if (!variants?.variants.length) { content.append(el('p', variantsError || 'Select accounts and save to see each version here.', variantsError ? 'error-list' : 'hint')); return; }
    if (!variants.variants.some(item => item.accountId === variantAccount)) variantAccount = variants.variants[0].accountId;
    for (const version of variants.variants) {
        const tab = button(version.name, () => { if (dirty === 'variant') { notice('Save or discard this account edit first.', 'warning'); return; } variantAccount = version.accountId; renderVariants(); });
        tab.setAttribute('aria-pressed', String(version.accountId === variantAccount)); tabs.append(tab);
    }
    const version = variants.variants.find(item => item.accountId === variantAccount)!;
    content.append(el('p', `${version.platform} · ${version.source === 'base' ? 'Uses shared content' : 'Custom account version'}`, 'hint'));
    postsView(content, version.posts || [{ text: version.text, media: version.media }]);
    content.append(el('p', `${version.characterCounts.join(' / ')} characters · ${version.characterLimit} per post (${version.limitSource === 'saved-preview' ? 'saved preview limit' : 'default; verify in preview'})`, 'hint'));
    if (draft.publication || !supported('set_draft_variant')) return;
    const controls = el('div', undefined, 'actions');
    const edit = button('Customize this version', () => { if (dirty) { notice('Save or discard your current changes first.', 'warning'); return; } editVariant(version.accountId); });
    controls.append(edit);
    if (version.source !== 'base') controls.append(button('Use shared version', () => {
        if (dirty) { notice('Save or discard your current changes first.', 'warning'); return; }
        void action(async () => { await tool('set_draft_variant', { draftId: draft!.id, expectedRevision: draft!.revision, accountId: version.accountId, variant: null }); await openItem(draft!.id); notice('Account now uses shared content. Prepare a new preview.', 'success'); });
    }, 'quiet'));
    content.append(controls);
}
function editVariant(accountId: string): void {
    const current = draft!; const version = variants!.variants.find(item => item.accountId === accountId)!;
    const parent = byId('variant-content'); parent.replaceChildren(el('h3', `Editing ${version.name}`));
    (byId('save-draft').closest('.card') as HTMLElement).inert = true;
    const mode = check(parent, 'Use explicit thread parts', !!version.posts);
    const text = field(parent, 'Account message', version.text, true);
    const inherit = check(parent, 'Use shared images', current.content.overrides[accountId]?.media === undefined && !version.posts);
    const media = field(parent, 'Account images, one per line', version.media.join('\n'), true);
    const threadWrap = el('div'); parent.append(threadWrap);
    const parts = partsEditor(threadWrap, version.posts || [], () => markDirty('variant'));
    const add = button('Add part', () => parts.add(), 'quiet'); parent.append(add);
    const toggle = (): void => { text.parentElement!.hidden = mode.checked; media.parentElement!.hidden = mode.checked || inherit.checked; inherit.parentElement!.hidden = mode.checked; threadWrap.hidden = add.hidden = !mode.checked; };
    toggle(); mode.addEventListener('change', toggle); inherit.addEventListener('change', toggle);
    parent.querySelectorAll('input,textarea').forEach(input => input.addEventListener('input', () => markDirty('variant')));
    const controls = el('div', undefined, 'actions'); controls.append(button('Save account version', () => void action(async () => {
        const variant = mode.checked ? { posts: parts.read() } : { text: text.value, ...(!inherit.checked && { media: lines(media.value) }) };
        await tool('set_draft_variant', { draftId: current.id, expectedRevision: current.revision, accountId, variant });
        clean(); await openItem(current.id); notice('Account version saved. Prepare a new preview.', 'success');
    }), 'primary'), button('Cancel', () => void action(discard), 'quiet'));
    parent.append(controls); markDirty('variant');
}
function renderReview(): void {
    const current = draft!; const parent = byId('preview-content'); parent.replaceChildren();
    const plan = current.preview?.plan || current.validation;
    if (!plan) parent.append(el('p', 'Save your changes, then prepare a preview of all selected accounts.', 'hint'));
    if (plan?.errors.length) parent.append(el('p', plan.errors.join('\n'), 'error-list'));
    if (current.preview) {
        parent.append(el('p', `Saved preview · revision ${current.preview.revision} · ${new Date(current.preview.createdAt).toLocaleString()}`, 'hint'));
        if (current.content.article) parent.append(el('p', `Dev.to article: ${current.content.article.title} · ${current.content.article.published ? 'Public article on publication' : 'Remote draft only'}`, 'hint'));
        for (const target of current.preview.plan.targets) {
            const group = el('section', undefined, 'post'); group.append(el('h3', `${target.accountId} · ${target.platform}`), el('p', `Limit: ${target.characterLimit} characters · ${target.maxMedia} images per post`, 'post-meta'));
            postsView(group, target.posts); parent.append(group);
        }
    }
    if (plan?.warnings.length) { const notes = el('details'); notes.append(el('summary', 'Preview notes')); for (const warning of plan.warnings) notes.append(el('p', warning, 'hint')); parent.append(notes); }
    if (current.publication) {
        parent.append(el('h3', 'Saved publication outcome'), el('p', `Request: ${current.publication.requestId}`, 'post-meta'));
        const operation = current.publication.operation;
        if (operation?.error) parent.append(el('p', operation.error, 'error-list'));
        if (!operation) parent.append(el('p', 'The publication was reserved; a completed result is not yet available. Check the saved outcome and destination before any further action.', 'callout'));
        for (const delivery of current.publication.deliveries || []) {
            const block = el('section', undefined, 'post'); block.append(el('h3', `${delivery.accountId} · ${delivery.status}`));
            for (const receipt of delivery.receipts) {
                if (receipt.url) block.append(button(receipt.url, () => void action(async () => {
                    const result = await request<{ opened: boolean }>('openLink', { url: receipt.url }); if (!result.opened) notice('This receipt link could not be opened.', 'warning');
                }), 'receipt'));
                else block.append(el('p', `Receipt ID: ${receipt.id}`, 'post-meta'));
            }
            const failure = operation?.results.find(item => item.accountId === delivery.accountId)?.error;
            if (failure) block.append(el('p', failure, 'error-list'));
            parent.append(block);
        }
    }
    byId('publish-draft').hidden = current.status !== 'Preview' || !!current.publication || !supported('publish_draft');
    byId('recover-draft').hidden = !current.publication;
}
function renderTemplate(): void {
    const current = recipe!; const parent = byId('workspace'); parent.replaceChildren();
    const form = el('section', undefined, 'template-form'); parent.append(form);
    const header = el('header', undefined, 'editor-header'); const heading = el('div'); heading.append(el('span', 'REUSABLE TEMPLATE', 'eyebrow'), el('h1', current.name), el('p', `Revision ${current.revision} · ${current.builtIn ? 'Built-in recipe' : 'Custom recipe'}`, 'hint')); header.append(heading); form.append(header);
    const actions = el('div', undefined, 'actions');
    if (supported('save_template')) {
        if (!current.builtIn) actions.append(button('Edit template', () => { if (mayLeave()) renderTemplateEditor(current, false); }));
        actions.append(button('Save a custom copy', () => { if (mayLeave()) renderTemplateEditor(current, true); }, 'quiet'));
    }
    if (!current.builtIn && supported('delete_template')) actions.append(button('Delete template', () => {
        if (!mayLeave()) return;
        const confirmation = el('div', undefined, 'callout'); confirmation.append(el('p', `Delete “${current.name}”? Existing drafts will stay unchanged. This template ID cannot be reused.`));
        confirmation.append(button('Delete this template', () => void action(async () => { await tool('delete_template', { templateId: current.id, expectedRevision: current.revision }); selected = ''; recipe = undefined; clean(); parent.replaceChildren(el('p', 'Template deleted. Existing drafts are unchanged.', 'empty')); persist(); changedWhileBusy = true; }), 'danger'), button('Cancel', () => confirmation.remove(), 'quiet'));
        actions.replaceChildren(confirmation);
    }, 'quiet danger'));
    header.append(actions);
    const grid = el('div', undefined, 'editor-grid'); form.append(grid);
    const fill = el('section', undefined, 'card'); fill.append(el('h2', 'Make it yours'), el('p', current.description || 'Fill the values below to create an independent draft.', 'hint'));
    const title = field(fill, 'New draft title', current.name);
    const accounts = el('fieldset'); accounts.append(el('legend', 'Accounts')); const options = el('div', undefined, 'account-options'); accounts.append(options); fill.append(accounts);
    const ids = accountChoices(options, []);
    const fields: { name: string; input: HTMLInputElement | HTMLTextAreaElement; optional: boolean }[] = [];
    for (const parameter of current.parameters) {
        const input = field(fill, `${parameter.name}${parameter.required ? ' · required' : ' · default available'}`, parameter.default || '', parameter.type !== 'url');
        if (parameter.description) input.parentElement!.append(el('small', parameter.description, 'hint'));
        fields.push({ name: parameter.name, input, optional: !parameter.required });
    }
    fill.querySelectorAll('input,textarea').forEach(input => input.addEventListener('input', () => markDirty('fill')));
    const read = (): Record<string, unknown> => ({ templateId: current.id, expectedRevision: current.revision, accountIds: ids(),
        values: Object.fromEntries(fields.filter(item => item.input.value !== '' || item.optional).map(item => [item.name, item.input.value])) });
    const preview = el('section', undefined, 'card'); preview.append(el('h2', 'Recipe preview'), el('p', 'Filling a template does not publish or validate platform limits. Create a draft, then prepare its publishing preview.', 'hint'));
    const rendered = el('div'); preview.append(rendered); postsView(rendered, current.content.posts || [{ text: current.content.text, media: current.content.media }], 'Base recipe');
    const controls = el('div', undefined, 'actions');
    const tryButton = button('Test fill', () => void action(async () => {
        const result = await tool<{ valid: boolean; errors: string[]; content?: DraftView['content']; variants?: DraftVariants['variants'] }>('render_template', read());
        rendered.replaceChildren();
        if (!result.valid) { rendered.append(el('p', result.errors.join('\n'), 'error-list')); return; }
        if (result.variants?.length) for (const version of result.variants) postsView(rendered, version.posts || [{ text: version.text, media: version.media }], version.accountId);
        else if (result.content) postsView(rendered, result.content.posts || [{ text: result.content.text, media: result.content.media }], 'Filled base content');
        notice('Values filled successfully. No draft or public post was created.', 'success');
    })); tryButton.disabled = !supported('render_template');
    const useButton = button('Create saved draft', () => void action(async () => {
        const result = await tool<{ draft: DraftView }>('create_draft_from_template', { ...read(), title: title.value });
        clean(); section = 'drafts'; selected = result.draft.id; await openItem(selected); changedWhileBusy = true; notice('Draft saved. Review account versions and prepare a preview before publishing.', 'success');
    }), 'primary'); useButton.disabled = !supported('create_draft_from_template');
    controls.append(tryButton, useButton); fill.append(controls); grid.append(fill, preview);
}
function renderTemplateEditor(source?: TemplateView, copy = false): void {
    const parent = byId('workspace'); parent.replaceChildren();
    const form = el('section', undefined, 'template-form'); parent.append(form);
    form.append(el('span', 'TEMPLATE EDITOR', 'eyebrow'), el('h1', source && !copy ? source.name : 'Create a reusable recipe'), el('p', 'Use {{variables}} in your text. Values are filled literally; no AI is called by the recipe.', 'hint'));
    const details = el('section', undefined, 'card'); form.append(details);
    const identifier = field(details, 'Template ID', source ? copy ? `my-${source.id.replace(/^builtin-/, '')}` : source.id : '');
    identifier.disabled = !!source && !copy; identifier.placeholder = 'my-release';
    const name = field(details, 'Template name', source?.name || ''); const description = field(details, 'Description', source?.description || '');
    const base = field(details, 'Shared message template', source?.content.text || '', true);
    const advanced = el('details'); advanced.append(el('summary', 'Advanced content: images, threads and article metadata')); details.append(advanced);
    const contentExtra = { ...(source?.content || {}) } as Record<string, unknown>; delete contentExtra.text;
    const extra = field(advanced, 'Additional content fields (JSON)', JSON.stringify(contentExtra, null, 2), true); extra.classList.add('code-input');
    const platformCard = el('section', undefined, 'card'); form.append(platformCard); platformCard.append(el('h2', 'Platform versions'), el('p', 'Enable an alternate text for a platform. Otherwise it uses the shared message.', 'hint'));
    const platforms: { key: string; enabled: HTMLInputElement; text: HTMLInputElement | HTMLTextAreaElement; extra: HTMLInputElement | HTMLTextAreaElement }[] = [];
    for (const key of ['linkedin', 'mastodon', 'x', 'bluesky', 'telegram', 'discord', 'devto']) {
        const existing = source?.platformVariants[key as keyof TemplateView['platformVariants']];
        const block = el('div', undefined, 'template-platform'); platformCard.append(block);
        const enabled = check(block, key, !!existing); const body = el('div'); body.hidden = !enabled.checked; block.append(body);
        const text = field(body, `${key} message template`, existing?.text || '', true);
        const advancedVariant = el('details'); advancedVariant.append(el('summary', 'Images or explicit thread fields')); body.append(advancedVariant);
        const extras = { ...existing } as Record<string, unknown>; delete extras.text;
        const extra = field(advancedVariant, 'Additional variant fields (JSON)', JSON.stringify(extras, null, 2), true); extra.classList.add('code-input');
        enabled.addEventListener('change', () => { body.hidden = !enabled.checked; }); platforms.push({ key, enabled, text, extra });
    }
    const accountDetails = el('details'); accountDetails.append(el('summary', 'Account-specific template overrides')); platformCard.append(accountDetails);
    const accountJson = field(accountDetails, 'Account ID to variant map (JSON)', JSON.stringify(source?.accountVariants || {}, null, 2), true); accountJson.classList.add('code-input');
    const parameters = el('section', undefined, 'card'); parameters.append(el('h2', 'Variables'), el('p', 'Variables are detected from your recipe. Add a default for optional values, or mark links as HTTPS URLs.', 'hint')); form.append(parameters);
    const parameterFields = el('div'); parameters.append(parameterFields);
    const specs = { ...(source?.variables || {}) }; let lastNames = '';
    const variableNames = (): string[] => [...new Set([...(base.value + extra.value + platforms.filter(item => item.enabled.checked).map(item => item.text.value + item.extra.value).join('') + accountJson.value)
        .matchAll(/{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g)].map(match => match[1]))].sort();
    const paintParameters = (): void => {
        const names = variableNames(); if (lastNames === JSON.stringify(names)) return; lastNames = JSON.stringify(names); parameterFields.replaceChildren();
        if (!names.length) parameterFields.append(el('p', 'Add a placeholder such as {{project}} to your text.', 'hint'));
        for (const variable of names) {
            const block = el('div', undefined, 'parameter'); block.append(el('h3', variable)); parameterFields.append(block);
            const spec = specs[variable] || { type: 'text' as const };
            const about = field(block, 'Description', spec.description || ''); const url = check(block, 'Require an HTTPS URL', spec.type === 'url');
            const defaultEnabled = check(block, 'Use a default value (otherwise required)', spec.default !== undefined); const fallback = field(block, 'Default value', spec.default || ''); fallback.parentElement!.hidden = !defaultEnabled.checked;
            const update = (): void => { specs[variable] = { type: url.checked ? 'url' : 'text', ...(about.value && { description: about.value }), ...(defaultEnabled.checked && { default: fallback.value }) }; markDirty('template'); };
            for (const input of [about, url, defaultEnabled, fallback]) input.addEventListener('input', update);
            defaultEnabled.addEventListener('change', () => { fallback.parentElement!.hidden = !defaultEnabled.checked; });
        }
    };
    paintParameters();
    for (const input of [base, extra, accountJson, ...platforms.flatMap(item => [item.text, item.extra, item.enabled])]) input.addEventListener('input', paintParameters);
    form.querySelectorAll('input,textarea').forEach(input => input.addEventListener('input', () => markDirty('template')));
    const parseObject = (text: string): Record<string, unknown> => { const parsed: unknown = JSON.parse(text); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Advanced fields must contain a JSON object.'); return parsed as Record<string, unknown>; };
    const controls = el('div', undefined, 'actions'); controls.append(button('Save template', () => void action(async () => {
        const platformVariants = Object.fromEntries(platforms.filter(item => item.enabled.checked).map(item => {
            const extras = parseObject(item.extra.value); return [item.key, { ...extras, ...((item.text.value || !extras.posts) && { text: item.text.value }) }];
        }));
        const definition = { id: identifier.value, name: name.value, description: description.value, content: { ...parseObject(extra.value), text: base.value }, platformVariants,
            accountVariants: parseObject(accountJson.value), variables: Object.fromEntries(variableNames().filter(variable => specs[variable]).map(variable => [variable, specs[variable]])),
            ...(source && !copy && { expectedRevision: source.revision }),
        };
        const result = await tool<{ template: TemplateView }>('save_template', definition);
        clean(); selected = result.template.id; section = 'templates'; await openItem(selected); changedWhileBusy = true; notice('Template saved. Existing drafts are unchanged.', 'success');
    }), 'primary'), button('Cancel', () => void action(discard), 'quiet'));
    form.append(controls); if (!source || copy) markDirty('template');
}
async function discard(): Promise<void> {
    clean(); if (selected) await openItem(selected); else { byId('workspace').replaceChildren(el('p', 'Choose a draft or template to continue.', 'empty')); }
}
byId('tab-drafts').addEventListener('click', () => { if (section !== 'drafts' && mayLeave()) { epoch++; section = 'drafts'; selected = ''; draft = undefined; recipe = undefined; clean(); persist(); renderList(); byId('workspace').replaceChildren(el('p', 'Choose a draft, or create a new one.', 'empty')); } });
byId('tab-templates').addEventListener('click', () => { if (section !== 'templates' && mayLeave()) { epoch++; section = 'templates'; selected = ''; draft = undefined; recipe = undefined; clean(); persist(); renderList(); byId('workspace').replaceChildren(el('p', 'Choose a template to fill or customize.', 'empty')); } });
byId('search').addEventListener('input', renderList); byId('status-filter').addEventListener('change', renderList);
byId('new-item').addEventListener('click', () => {
    if (!mayLeave()) return;
    if (section === 'templates') { selected = ''; recipe = undefined; persist(); renderList(); renderTemplateEditor(); }
    else void action(async () => { const created = await tool<{ draft: DraftView }>('create_draft', { title: 'Untitled draft', content: {} }); selected = created.draft.id; await openItem(selected); changedWhileBusy = true; byId<HTMLInputElement>('draft-title').focus(); });
});
byId('discard').addEventListener('click', () => void action(discard)); byId('reload-current').addEventListener('click', () => void action(discard));
byId('refresh').addEventListener('click', () => void refresh()); byId('reconnect').addEventListener('click', () => void refresh(true));
byId('settings').addEventListener('click', () => { void request('settings').catch(error => notice(error.message, 'error')); });
window.addEventListener('message', event => {
    const message = event.data;
    if (message?.command === 'libraryResult') { const item = pending.get(message.id); if (!item) return; clearTimeout(item.timer); pending.delete(message.id); if (message.success) item.resolve(message.data); else item.reject(new Error(message.error || 'Library request failed.')); }
    else if (message?.command === 'libraryChanged') { if (dirty) byId('external-change').hidden = false; if (busy) changedWhileBusy = true; else void refresh(); }
    else if (message?.command === 'libraryReconnectRequired') notice('Library settings changed. Reconnect to use the updated connection.', 'warning');
});
window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); if (!busy && dirty === 'draft') byId<HTMLButtonElement>('save-draft')?.click(); }
});
void refresh();
