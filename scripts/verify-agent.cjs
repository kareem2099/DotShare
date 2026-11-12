#!/usr/bin/env node
'use strict';
// Real subprocess/stdio smoke test. No platform credentials or publication calls.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-stdio-'));
const env = { ...process.env, DOTSHARE_HOME: home, DOTSHARE_MEDIA_ROOTS: home };
const child = spawn(process.execPath, [path.join(root, 'bin/dotshare-mcp.js')], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
let sequence = 0;
let buffer = '';
let diagnostics = '';
const waiting = new Map();
child.stderr.on('data', chunk => { diagnostics += chunk; });
child.stdout.on('data', chunk => {
    buffer += chunk;
    while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n');
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        try {
            const message = JSON.parse(line);
            waiting.get(message.id)?.resolve(message);
        } catch (error) {
            for (const item of waiting.values()) item.reject(error);
        }
    }
});
child.on('error', error => { for (const item of waiting.values()) item.reject(error); });
child.on('exit', code => { for (const item of waiting.values()) item.reject(new Error(`MCP exited ${code}: ${diagnostics}`)); });
function request(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${method}: ${diagnostics}`)), 10000);
        waiting.set(id, { resolve: message => { clearTimeout(timer); waiting.delete(id); resolve(message); }, reject: error => { clearTimeout(timer); waiting.delete(id); reject(error); } });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
}
(async () => {
    try {
        const initialized = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'dotshare-smoke', version: '1.0.0' } });
        assert.equal(initialized.result.serverInfo.name, 'dotshare');
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
        const tools = await request('tools/list');
        assert.equal(tools.result.tools.length, 25);
        for (const name of ['save_template', 'get_template', 'list_templates', 'delete_template', 'render_template', 'create_draft_from_template', 'get_draft_variants', 'set_draft_variant']) {
            assert(tools.result.tools.some(tool => tool.name === name), name);
        }
        const accounts = await request('tools/call', { name: 'list_accounts', arguments: {} });
        assert.deepEqual(accounts.result.structuredContent.data.accounts, []);
        const preview = await request('tools/call', { name: 'preview_post', arguments: { accountIds: ['missing'], text: 'Preview only' } });
        assert.equal(preview.result.structuredContent.data.valid, false);
        const invalid = await request('tools/call', { name: 'publish_post', arguments: { accountIds: ['missing'], text: 'No request ID' } });
        assert.equal(invalid.result.isError, true);
        const created = await request('tools/call', { name: 'create_draft', arguments: { title: 'MCP smoke draft', content: { text: 'Private saved draft' } } });
        const draft = created.result.structuredContent.data.draft;
        assert.equal(draft.status, 'Draft'); assert.equal(draft.published, false);
        const edited = await request('tools/call', { name: 'update_draft', arguments: { draftId: draft.id, expectedRevision: 1, patch: { text: 'Updated private draft' } } });
        assert.equal(edited.result.structuredContent.data.draft.revision, 2);
        const checked = await request('tools/call', { name: 'preview_draft', arguments: { draftId: draft.id, expectedRevision: 2 } });
        assert.equal(checked.result.isError, true);
        assert.equal(checked.result.structuredContent.data.draft.status, 'Draft');
        const blocked = await request('tools/call', { name: 'publish_draft', arguments: { draftId: draft.id, expectedRevision: 2, previewId: draft.id, requestId: 'blocked-without-preview' } });
        assert.equal(blocked.result.isError, true);
        assert.equal(fs.existsSync(path.join(home, 'operations')), false);
        for (const entry of ['dotshare-agent.js', 'dotshare-cli.js']) {
            const output = execFileSync(process.execPath, [path.join(root, 'bin', entry), 'accounts', 'list'], { cwd: root, env, encoding: 'utf8' });
            assert.deepEqual(JSON.parse(output), { accounts: [] });
        }
        const cli = path.join(root, 'bin/dotshare-agent.js');
        const fromCli = JSON.parse(execFileSync(process.execPath, [cli, 'drafts', 'create', '--title', 'CLI saved draft'], { cwd: root, env, encoding: 'utf8' }));
        const recovered = await request('tools/call', { name: 'get_draft', arguments: { draftId: fromCli.draft.id } });
        assert.equal(recovered.result.structuredContent.data.draft.title, 'CLI saved draft');
        const listing = await request('tools/call', { name: 'list_drafts', arguments: { status: 'Draft' } });
        assert.equal(listing.result.structuredContent.data.drafts.length, 2);
        assert.equal(JSON.stringify(listing).includes('Updated private draft'), false);
        const recipes = await request('tools/call', { name: 'list_templates', arguments: {} });
        assert.equal(recipes.result.structuredContent.data.templates.length, 5);
        const savedRecipe = await request('tools/call', { name: 'save_template', arguments: { id: 'stdio-template', name: 'Smoke recipe', content: { text: 'Base: {{message}}' }, platformVariants: { x: { text: 'X: {{message}}' } } } });
        assert.equal(savedRecipe.result.structuredContent.data.template.revision, 1);
        const incompleteRecipe = await request('tools/call', { name: 'render_template', arguments: { templateId: 'stdio-template', expectedRevision: 1 } });
        assert.equal(incompleteRecipe.result.isError, true);
        const recipeFromCli = JSON.parse(execFileSync(process.execPath, [cli, 'templates', 'get', 'stdio-template'], { cwd: root, env, encoding: 'utf8' }));
        assert.equal(recipeFromCli.template.name, 'Smoke recipe');
        // Metadata only: variant editing never needs platform credentials or publication access.
        fs.writeFileSync(path.join(home, 'accounts.json'), JSON.stringify([{ id: 'smoke-x', name: 'Smoke X', platform: 'x' }]), { mode: 0o600 });
        const filled = JSON.stringify({ values: { message: 'Verified literal data' }, accountIds: ['smoke-x'] });
        const renderedCli = JSON.parse(execFileSync(process.execPath, [cli, 'templates', 'render', 'stdio-template', '--revision', '1', '--input', '-'], { cwd: root, env, encoding: 'utf8', input: filled }));
        assert.equal(renderedCli.valid, true); assert.equal(renderedCli.saved, false);
        const templatedCli = JSON.parse(execFileSync(process.execPath, [cli, 'templates', 'use', 'stdio-template', '--revision', '1', '--input', '-'], { cwd: root, env, encoding: 'utf8', input: filled }));
        assert.equal(templatedCli.draft.status, 'Draft');
        assert.deepEqual(templatedCli.draft.sourceTemplate, { id: 'stdio-template', revision: 1 });
        const versions = await request('tools/call', { name: 'get_draft_variants', arguments: { draftId: templatedCli.draft.id } });
        assert.equal(versions.result.structuredContent.data.variants[0].text, 'X: Verified literal data');
        const editVersion = await request('tools/call', { name: 'set_draft_variant', arguments: { draftId: templatedCli.draft.id, expectedRevision: 1, accountId: 'smoke-x', variant: { text: 'Edited account version' } } });
        assert.equal(editVersion.result.structuredContent.data.draft.revision, 2);
        const versionsCli = JSON.parse(execFileSync(process.execPath, [cli, 'drafts', 'variants', templatedCli.draft.id], { cwd: root, env, encoding: 'utf8' }));
        assert.equal(versionsCli.variants[0].text, 'Edited account version');
        const resetCli = JSON.parse(execFileSync(process.execPath, [cli, 'drafts', 'set-variant', templatedCli.draft.id, 'smoke-x', '--revision', '2', '--input', '-'], { cwd: root, env, encoding: 'utf8', input: 'null' }));
        assert.equal(resetCli.draft.revision, 3); assert.deepEqual(resetCli.draft.content.overrides, {});
        const updatedRecipe = JSON.parse(execFileSync(process.execPath, [cli, 'templates', 'save', '--input', '-'], { cwd: root, env, encoding: 'utf8', input: JSON.stringify({ id: 'stdio-template', expectedRevision: 1, name: 'Edited recipe', content: { text: 'New {{message}}' } }) }));
        assert.equal(updatedRecipe.template.revision, 2);
        const staleRecipe = await request('tools/call', { name: 'render_template', arguments: { templateId: 'stdio-template', expectedRevision: 1, values: { message: 'Cannot use old revision' } } });
        assert.equal(staleRecipe.result.isError, true);
        const deletedRecipe = await request('tools/call', { name: 'delete_template', arguments: { templateId: 'stdio-template', expectedRevision: 2 } });
        assert.equal(deletedRecipe.result.structuredContent.data.deleted, true);
        const independentDraft = await request('tools/call', { name: 'get_draft', arguments: { draftId: templatedCli.draft.id } });
        assert.equal(independentDraft.result.structuredContent.data.draft.content.text, 'Base: Verified literal data');
        assert.equal(fs.existsSync(path.join(home, 'operations')), false);
        const config = path.join(home, 'codex', 'config.toml');
        const run = args => JSON.parse(execFileSync(process.execPath, [cli, ...args, '--json'], { cwd: root, env, encoding: 'utf8', timeout: 30000 }));
        const dryRun = run(['setup', '--config', config, '--dry-run']);
        assert.equal(dryRun.dryRun, true);
        assert.equal(fs.existsSync(config), false);
        const configured = run(['setup', '--config', config, '--text-only']);
        assert.equal(configured.changed, true);
        const contents = fs.readFileSync(config, 'utf8');
        const repeated = run(['setup', '--config', config, '--text-only']);
        assert.equal(repeated.changed, false);
        assert.equal(fs.readFileSync(config, 'utf8'), contents);
        const diagnosed = run(['doctor', '--config', config]);
        assert.equal(diagnosed.success, true);
        assert.equal(diagnosed.mcpReady, true);
        assert.equal(diagnosed.accountChecksPerformed, false);
        const skipped = run(['doctor', '--config', config, '--skip-mcp']);
        assert.equal(skipped.mcpReady, null);
        console.log('Verified: real MCP transport and 25 tools; templates, literal rendering, independent drafts and account variants across MCP/CLI; saved-draft status guards; setup and doctor. No posts published.');
    } finally {
        child.kill('SIGTERM');
        const metadata = path.join(home, 'security.json');
        if (fs.existsSync(metadata)) { const { Entry } = require('@napi-rs/keyring'); const key = JSON.parse(fs.readFileSync(metadata,'utf8')).keyId; new Entry('DotShare CLI', `vault:${key}`, process.platform === 'linux' ? {linux:{store:'secret-service'}} : undefined).deletePassword(); }
        fs.rmSync(home, { recursive: true, force: true });
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
