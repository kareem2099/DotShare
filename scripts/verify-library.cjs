#!/usr/bin/env node
'use strict';
const { createPreview } = require('./preview-library.cjs');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
    const preview = await createPreview();
    const call = async (name, args) => { const result = await preview.client.call(name, args); assert.equal(result.success, true, JSON.stringify(result)); return result.data; };
    const cli = (args, input) => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, '../bin/dotshare-agent.js'), ...args], { env: { ...process.env, DOTSHARE_HOME: preview.home }, input, encoding: 'utf8' }));
    try {
        if (process.argv.includes('--configured-read-only')) {
            const configured = new preview.client.constructor();
            try {
                const actual = await configured.snapshot();
                console.log(JSON.stringify({ verified: true, home: actual.connection.home, accounts: actual.accounts.map(account => account.id), drafts: actual.drafts.length, templates: actual.templates.length, readOnly: true }));
            } finally { await configured.dispose(); }
            return;
        }
        const snapshot = await preview.client.snapshot(); assert.equal(snapshot.accounts.length, 2); assert.equal(snapshot.templates.length, 5);
        const { template } = await call('save_template', { id: 'ui-release', name: 'UI release', content: { text: 'Shared {{message}}' }, platformVariants: { x: { text: 'X {{message}}' } } });
        assert.equal(cli(['templates', 'get', template.id]).template.revision, 1);
        const { draft } = await call('create_draft_from_template', { templateId: template.id, expectedRevision: 1, values: { message: 'tested across surfaces' }, accountIds: ['demo-x', 'demo-linkedin'] });
        const edited = cli(['drafts', 'update', draft.id, '--revision', '1', '--input', '-'], JSON.stringify({ patch: { text: 'Changed by another process' } })); assert.equal(edited.draft.revision, 2);
        assert.equal((await call('get_draft', { draftId: draft.id })).draft.content.text, 'Changed by another process');
        let saved = (await call('preview_draft', { draftId: draft.id, expectedRevision: 2 })).draft; const oldPreview = saved.preview.id;
        await call('set_draft_variant', { draftId: draft.id, expectedRevision: 2, accountId: 'demo-x', variant: { text: 'Reviewed X version' } });
        const stale = await preview.client.call('publish_draft', { draftId: draft.id, expectedRevision: 2, previewId: oldPreview, requestId: 'stale-ui-publication' }); assert.equal(stale.success, false);
        saved = (await call('preview_draft', { draftId: draft.id, expectedRevision: 3 })).draft;
        const request = { draftId: draft.id, expectedRevision: 3, previewId: saved.preview.id, requestId: 'reviewed-ui-publication' };
        const published = await call('publish_draft', request); assert.equal(published.draft.status, 'Published');
        const replay = await call('publish_draft', request); assert.equal(replay.replayed, true);
        assert.equal(fs.readFileSync(path.join(preview.home, 'test-deliveries.jsonl'), 'utf8').trim().split('\n').length, 2);
        assert.equal(cli(['drafts', 'get', draft.id]).draft.status, 'Published');
        const partial = (await call('create_draft', { title: 'Partial fixture', content: { accountIds: ['demo-x', 'demo-linkedin'], text: 'Public first part', overrides: { 'demo-linkedin': { text: '[fail]' } } } })).draft;
        const partialPreview = (await call('preview_draft', { draftId: partial.id, expectedRevision: 1 })).draft;
        const partialRequest = { draftId: partial.id, expectedRevision: 1, previewId: partialPreview.preview.id, requestId: 'partial-ui-fixture' };
        const uncertain = await preview.client.call('publish_draft', partialRequest); assert.equal(uncertain.success, false); assert.equal(uncertain.data.draft.status, 'NeedsReview');
        assert.equal(uncertain.data.draft.publication.deliveries[0].receipts.length, 1);
        await preview.client.call('publish_draft', partialRequest);
        assert.equal(fs.readFileSync(path.join(preview.home, 'test-deliveries.jsonl'), 'utf8').trim().split('\n').length, 3);
        const bypass = await preview.client.call('publish_draft', { ...partialRequest, requestId: 'must-not-bypass' }); assert.equal(bypass.success, false);
        await call('delete_template', { templateId: template.id, expectedRevision: 1 });
        assert.equal((await call('get_draft', { draftId: draft.id })).draft.sourceTemplate.id, template.id);
        console.log('Verified: the VS Code library bridge uses the same MCP/CLI store, revisions, variants, saved previews and publication receipts. Replays do not resend. All publications used fake adapters.');
    } finally { await preview.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
