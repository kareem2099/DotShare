import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentTemplates } from '../templates';
import { AccountStore } from '../accounts';
import { AgentPublisher, PublishAdapter } from '../publisher';
import { AgentDrafts } from '../drafts';

let home: string;
let accounts: AccountStore;
let drafts: AgentDrafts;
let templates: AgentTemplates;
let publisher: AgentPublisher;
let adapter: jest.MockedFunction<PublishAdapter>;
beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-templates-'));
    const secrets = new Map<string, string>();
    accounts = new AccountStore(home, { get: key => secrets.get(key), set: (key, value) => { secrets.set(key, value); }, delete: key => { secrets.delete(key); } });
    for (const [id, platform] of [['personal', 'x'], ['work', 'linkedin'], ['other', 'x']] as const) {
        accounts.add({ id, platform, name: id, credentials: { accessToken: `private-${id}-token` } });
    }
    adapter = jest.fn(async (target, _credentials, _input, report) => { report({ id: target.accountId, url: `https://example.com/posts/${target.accountId}` }); });
    publisher = new AgentPublisher(accounts, adapter, [home]);
    drafts = new AgentDrafts(publisher); templates = new AgentTemplates(accounts, drafts);
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
const recipe = (extra: Record<string, unknown> = {}) => ({ id: 'my-release', name: 'My release', content: { text: '{{project}} {{version}}\n{{link}}' },
    variables: { link: { type: 'url' }, version: { default: 'v1' } }, ...extra });
const render = (extra: Record<string, unknown> = {}) => templates.render({ templateId: 'my-release', expectedRevision: 1, values: { project: 'DotShare', link: 'https://example.com/release' }, ...extra });
function create() {
    templates.save(recipe());
    return templates.createDraft({ templateId: 'my-release', expectedRevision: 1, values: { project: 'DotShare', link: 'https://example.com/release' }, accountIds: ['personal', 'work'] }).draft;
}

it('ships five discoverable read-only recipes whose required variables all render', () => {
    const before = jest.spyOn(accounts, 'credentials');
    const listing = templates.list(); expect(listing.templates).toHaveLength(5);
    for (const summary of listing.templates) {
        expect(summary.builtIn).toBe(true); expect(summary).not.toHaveProperty('content');
        const template = templates.get(summary.id);
        const values = Object.fromEntries(template.parameters.map(parameter => [parameter.name, parameter.type === 'url' ? 'https://example.com' : `Supplied ${parameter.name}`]));
        const result = templates.render({ templateId: template.id, expectedRevision: 1, values });
        expect(result.valid).toBe(true); expect(result.saved).toBe(false); expect(result.published).toBe(false);
    }
    expect(fs.existsSync(path.join(home, 'templates'))).toBe(false);
    expect(before).not.toHaveBeenCalled(); expect(adapter).not.toHaveBeenCalled();
});
it('saves a private recipe, infers parameters/defaults and survives a restart without credentials', () => {
    const readSecret = jest.spyOn(accounts, 'credentials');
    const template = templates.save(recipe());
    expect(template.revision).toBe(1);
    expect(template.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'version', required: false, default: 'v1' }), expect.objectContaining({ name: 'project', required: true })]));
    expect(fs.statSync(path.join(home, 'templates')).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(home, 'templates/my-release.json')).mode & 0o777).toBe(0o600);
    expect(new AgentTemplates(accounts, drafts).get(template.id)).toEqual(template);
    expect(readSecret).not.toHaveBeenCalled();
});
it('updates by full replacement and rejects stale or missing revision claims', () => {
    templates.save(recipe());
    expect(() => templates.save(recipe())).toThrow('revision changed');
    expect(() => templates.save(recipe({ expectedRevision: 2 }))).toThrow('revision changed');
    const changed = templates.save({ id: 'my-release', name: 'Changed', expectedRevision: 1, content: { text: '{{message}}' } });
    expect(changed.revision).toBe(2); expect(changed.variables).toEqual({});
    expect(() => render()).toThrow('revision changed');
    expect(() => templates.save(recipe({ id: 'new-id', expectedRevision: 1 }))).toThrow('does not exist');
});
it('supports literal defaults, Unicode and explicit values overriding defaults', () => {
    templates.save(recipe());
    const result = render({ values: { project: 'دوت شير', version: 'v2', link: 'https://example.com/تحديث' } });
    expect(result.valid && result.content.text).toBe('دوت شير v2\nhttps://example.com/تحديث');
    expect(render().valid && render().content?.text).toContain('v1');
});
it('reports missing and unknown values without saving a draft or silently guessing', () => {
    templates.save(recipe());
    const result = render({ values: { typo: 'wrong' } });
    expect(result.valid).toBe(false); expect(result.missingVariables).toEqual(['link', 'project']);
    expect(result.errors.join(' ')).toContain('Unknown variable "typo"');
    expect(() => templates.createDraft({ templateId: 'my-release', expectedRevision: 1, values: {} })).toThrow('No draft saved');
    expect(fs.existsSync(path.join(home, 'drafts'))).toBe(false);
});
it('substitutes values exactly once and treats shell, HTML and template-looking text as literal data', () => {
    templates.save({ id: 'literal', name: 'Literal data', content: { text: '{{value}} / {{value}}' } });
    const value = '$& {{another}} $(touch /tmp/never-execute-dotshare-template) <script>alert(1)</script>';
    const result = templates.render({ templateId: 'literal', expectedRevision: 1, values: { value } });
    expect(result.valid && result.content.text).toBe(`${value} / ${value}`);
    expect(adapter).not.toHaveBeenCalled();
});
it.each(['{{project.name}}', '{{#if project}}', '{{project', 'project}}', '{{constructor}}', '{{__proto__}}'])('rejects malformed or executable-looking syntax: %s', text => {
    expect(() => templates.save({ id: 'bad-syntax', name: 'Bad', content: { text } })).toThrow();
    expect(fs.existsSync(path.join(home, 'templates/bad-syntax.json'))).toBe(false);
});
it('rejects undeclared uses of variable metadata and unsafe HTTPS URL values/defaults', () => {
    expect(() => templates.save(recipe({ variables: { unused: {} } }))).toThrow('not used');
    expect(() => templates.save(recipe({ variables: { link: { type: 'url', default: 'http://example.com' } } }))).toThrow('HTTPS');
    templates.save(recipe());
    for (const link of ['http://example.com', 'https://secret@example.com', 'file:///tmp/a', ' https://example.com']) {
        const result = render({ values: { project: 'DotShare', link } }); expect(result.valid).toBe(false); expect(result.errors.join(' ')).toContain('HTTPS');
    }
});
it('renders nested thread parts, article metadata and public URLs then validates their concrete schema', () => {
    templates.save({ id: 'nested', name: 'Article', content: { posts: [{ text: '{{body}}', media: ['{{image}}'] }], article: { title: '{{title}}', canonicalUrl: '{{link}}', tags: ['{{tag}}'] } } });
    const values = { body: 'Markdown body', image: 'https://example.com/image.png', title: 'Article title', link: 'https://example.com/article', tag: 'typescript' };
    const valid = templates.render({ templateId: 'nested', expectedRevision: 1, values });
    expect(valid.valid && valid.content.posts?.[0]).toEqual({ text: values.body, media: [values.image] });
    const invalid = templates.render({ templateId: 'nested', expectedRevision: 1, values: { ...values, title: 'x'.repeat(129), tag: 'Invalid Tag' } });
    expect(invalid.valid).toBe(false); expect(invalid.errors.join(' ')).toContain('article');
});
it('selects account variants before platform variants, then falls back to base inheritance', () => {
    templates.save(recipe({ platformVariants: { x: { text: 'X: {{project}}' }, linkedin: { text: 'LinkedIn: {{project}}' } }, accountVariants: { personal: { text: 'Personal: {{project}}' } } }));
    const result = render({ accountIds: ['personal', 'work', 'other'] });
    expect(result.valid && result.variants.map(variant => [variant.accountId, variant.source, variant.text])).toEqual([
        ['personal', 'account', 'Personal: DotShare'], ['work', 'platform', 'LinkedIn: DotShare'], ['other', 'platform', 'X: DotShare'],
    ]);
    expect(result.valid && result.content.overrides.personal.text).toBe('Personal: DotShare');
});
it('chooses a whole account variant instead of accidentally mixing it with a platform thread', () => {
    templates.save(recipe({ content: { text: 'Base {{project}}', media: ['/base.png'] }, variables: {}, platformVariants: { x: { posts: [{ text: 'Platform {{project}}' }] } }, accountVariants: { personal: { text: 'Account {{project}}' } } }));
    const result = render({ values: { project: 'DotShare' }, accountIds: ['personal', 'other'] });
    expect(result.valid && result.variants[0]).toMatchObject({ text: 'Account DotShare', media: ['/base.png'], posts: undefined });
    expect(result.valid && result.variants[1]).toMatchObject({ text: '', media: [], posts: [{ text: 'Platform DotShare', media: [] }] });
});
it('creates an independent saved draft with origin metadata and no implicit preview or publication', () => {
    const readSecret = jest.spyOn(accounts, 'credentials');
    const draft = create();
    expect(draft.status).toBe('Draft'); expect(draft.published).toBe(false); expect(draft.preview).toBeUndefined();
    expect(draft.sourceTemplate).toEqual({ id: 'my-release', revision: 1 });
    templates.save(recipe({ expectedRevision: 1, content: { text: 'Later content' }, variables: {} }));
    templates.delete({ templateId: 'my-release', expectedRevision: 2 });
    expect(new AgentDrafts(publisher).get(draft.id).content.text).toContain('DotShare v1');
    expect(readSecret).not.toHaveBeenCalled(); expect(adapter).not.toHaveBeenCalled();
});
it('deletes only the recipe body and keeps a revision tombstone to prevent stale resurrection', () => {
    templates.save(recipe());
    expect(() => templates.delete({ templateId: 'my-release', expectedRevision: 2 })).toThrow('revision changed');
    expect(templates.delete({ templateId: 'my-release', expectedRevision: 1 })).toMatchObject({ deleted: true, draftsChanged: false });
    expect(templates.list({ query: 'my-release' }).templates).toEqual([]);
    expect(() => templates.get('my-release')).toThrow('not found');
    expect(() => templates.save(recipe())).toThrow('was deleted');
    expect(fs.readFileSync(path.join(home, 'templates/my-release.json'), 'utf8')).not.toContain('{{project}}');
});
it('protects built-ins while allowing a separately saved custom copy', () => {
    expect(() => templates.save(recipe({ id: 'builtin-release' }))).toThrow('read-only');
    expect(() => templates.delete({ templateId: 'builtin-release', expectedRevision: 1 })).toThrow('read-only');
    const original = templates.get('builtin-release');
    expect(templates.save({ id: 'my-own-release', name: original.name, description: original.description, content: original.content,
        variables: original.variables, platformVariants: original.platformVariants, accountVariants: original.accountVariants }).builtIn).toBe(false);
});
it('rejects duplicate/missing selected accounts without reading secrets or creating drafts', () => {
    templates.save(recipe());
    expect(() => render({ accountIds: ['personal', 'personal'] })).toThrow('unique');
    expect(() => render({ accountIds: ['missing'] })).toThrow('not configured');
    expect(fs.existsSync(path.join(home, 'drafts'))).toBe(false);
});
it('bounds expanded output before allocating a huge repeated substitution and writes nothing', () => {
    templates.save({ id: 'bounded', name: 'Bounded', content: { text: '{{large}}'.repeat(100) } });
    expect(() => templates.createDraft({ templateId: 'bounded', expectedRevision: 1, values: { large: 'x'.repeat(100000) } })).toThrow('1 MiB');
    expect(fs.existsSync(path.join(home, 'drafts'))).toBe(false);
});
it('fails closed on corrupted stored templates, invalid IDs and an active edit lock', () => {
    templates.save(recipe());
    expect(() => templates.get('../accounts')).toThrow();
    fs.writeFileSync(path.join(home, 'templates/my-release.json.lock'), '');
    expect(() => templates.save(recipe({ expectedRevision: 1 }))).toThrow('locked');
    fs.unlinkSync(path.join(home, 'templates/my-release.json.lock'));
    fs.writeFileSync(path.join(home, 'templates/my-release.json'), '{broken');
    expect(() => templates.get('my-release')).toThrow('unreadable');
    expect(() => templates.save(recipe({ expectedRevision: 1 }))).toThrow('unreadable');
});
it('replaces exactly one account version, preserves other accounts and blocks stale edits', () => {
    const draft = create();
    const changed = drafts.setVariant({ draftId: draft.id, expectedRevision: 1, accountId: 'personal', variant: { text: 'Short X version' } });
    expect(changed.revision).toBe(2); expect(changed.content.text).toBe(draft.content.text);
    expect(drafts.variants(draft.id).variants.map(variant => [variant.accountId, variant.text, variant.source])).toEqual([
        ['personal', 'Short X version', 'account'], ['work', draft.content.text, 'base'],
    ]);
    expect(() => drafts.setVariant({ draftId: draft.id, expectedRevision: 1, accountId: 'work', variant: { text: 'Stale' } })).toThrow('revision changed');
    expect(() => drafts.setVariant({ draftId: draft.id, expectedRevision: 2, accountId: 'other', variant: { text: 'Unselected' } })).toThrow('already selected');
    expect(drafts.get(draft.id).revision).toBe(2);
});
it('resets a variant to current base content, never to an old template recipe', () => {
    const draft = create();
    drafts.setVariant({ draftId: draft.id, expectedRevision: 1, accountId: 'personal', variant: { posts: [{ text: 'Thread one' }, { text: 'Thread two' }] } });
    const view = drafts.variants(draft.id);
    expect(view.variants[0]).toMatchObject({ text: '', media: [], posts: [{ text: 'Thread one', media: [] }, { text: 'Thread two', media: [] }] });
    drafts.update({ draftId: draft.id, expectedRevision: 2, patch: { text: 'Updated base' } });
    const reset = drafts.setVariant({ draftId: draft.id, expectedRevision: 3, accountId: 'personal', variant: null });
    expect(reset.revision).toBe(4); expect(reset.content.overrides).toEqual({});
    expect(drafts.variants(draft.id).variants[0]).toMatchObject({ text: 'Updated base', source: 'base', limitSource: 'platform-default' });
});
it('invalidates a preview after a variant edit and publishes only the newly reviewed per-account text', async () => {
    const draft = create();
    const first = await drafts.preview({ draftId: draft.id, expectedRevision: 1 });
    expect(drafts.variants(draft.id).variants[0].limitSource).toBe('saved-preview');
    const edited = drafts.setVariant({ draftId: draft.id, expectedRevision: 1, accountId: 'personal', variant: { text: 'Specific X text' } });
    expect(edited.status).toBe('Draft'); expect(edited.preview).toBeUndefined();
    await expect(drafts.publish({ draftId: draft.id, expectedRevision: 1, previewId: first.preview!.id, requestId: 'stale-variant-test' })).rejects.toThrow('revision changed');
    expect(adapter).not.toHaveBeenCalled();
    const previewed = await drafts.preview({ draftId: draft.id, expectedRevision: 2 });
    expect(previewed.status).toBe('Preview');
    const published = await drafts.publish({ draftId: draft.id, expectedRevision: 2, previewId: previewed.preview!.id, requestId: 'reviewed-variants' });
    expect(published.draft.status).toBe('Published');
    expect(adapter.mock.calls.map(call => [call[0].accountId, call[0].posts[0].text])).toEqual([['personal', 'Specific X text'], ['work', draft.content.text]]);
    expect(() => drafts.setVariant({ draftId: draft.id, expectedRevision: 2, accountId: 'work', variant: { text: 'Too late' } })).toThrow('publication attempt');
});
it('uses the same resolver for base explicit threads, overridden text and actual preview counts', async () => {
    const draft = drafts.create({ content: { accountIds: ['personal', 'other'], posts: [{ text: 'First https://example.com/a-very-long-link' }, { text: 'Second' }] } });
    drafts.setVariant({ draftId: draft.id, expectedRevision: 1, accountId: 'other', variant: { text: 'One short post' } });
    const viewed = drafts.variants(draft.id);
    const previewed = await drafts.preview({ draftId: draft.id, expectedRevision: 2 });
    expect(previewed.status).toBe('Preview');
    expect(viewed.variants.map(variant => variant.characterCounts)).toEqual(previewed.preview!.plan.targets.map(target => target.posts.map(post => post.characters)));
    expect(previewed.preview!.plan.targets.map(target => target.posts.length)).toEqual([2, 1]);
});
it('inherits base images for text-only variants, while an explicit empty media array removes them', async () => {
    const file = path.join(home, 'shared.png');
    fs.writeFileSync(file, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]));
    templates.save({ id: 'image-recipe', name: 'Image recipe', content: { text: 'Base {{project}}', media: [file] }, platformVariants: { x: { text: 'X: {{project}}' } } });
    const created = templates.createDraft({ templateId: 'image-recipe', expectedRevision: 1, values: { project: 'DotShare' }, accountIds: ['personal'] }).draft;
    expect(created.content.overrides.personal).not.toHaveProperty('media');
    const previewed = await drafts.preview({ draftId: created.id, expectedRevision: 1 });
    expect(previewed.status).toBe('Preview'); expect(previewed.preview!.plan.targets[0].posts[0].media).toEqual([file]);
    drafts.setVariant({ draftId: created.id, expectedRevision: 1, accountId: 'personal', variant: { text: 'Text only', media: [] } });
    const textOnly = await drafts.preview({ draftId: created.id, expectedRevision: 2 });
    expect(textOnly.status).toBe('Preview'); expect(textOnly.preview!.plan.targets[0].posts[0].media).toEqual([]);
});
