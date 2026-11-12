import { Command } from 'commander';
import * as fs from 'fs';
import * as readline from 'readline';
import axios from 'axios';
import { AccountStore } from './accounts';
import { AgentPublisher, safeError } from './publisher';
import { AgentCloud } from './cloud';
import { CREDENTIAL_FIELDS, platformSchema, accountIdSchema } from './schema';
import { startAgentServer } from './server';
import { runSetup, SetupOptions } from './setup';
import { runDoctor, formatDoctor, DoctorOptions } from './doctor';
import { AgentDrafts } from './drafts';
import { AgentTemplates } from './templates';
import { connectAccount } from './connect';
import { AgentStats } from './stats';
import { protectStorage, securityStatus } from '../security/manage';
import { hardenHttp } from '../security/http';
import { privateRead } from '../security/private-files';

function parseInput(text: string): ReturnType<typeof JSON.parse> {
    try { return JSON.parse(text); }
    catch { throw new Error('Invalid JSON input. Its contents were not displayed.'); }
}

async function readInput(file: string, secret = false): Promise<string> {
    if (file !== '-') {
        if (secret) return privateRead(file, 2 * 1024 * 1024);
        const info = fs.statSync(file); if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('Input must be a regular file no larger than 2 MiB.');
        return fs.readFileSync(file, 'utf8');
    }
    if (process.stdin.isTTY) throw new Error('For JSON input, pipe content to --input - or specify a file.');
    let input = '';
    for await (const chunk of process.stdin) {
        input += chunk;
        if (input.length > 2 * 1024 * 1024) throw new Error('Input exceeds 2 MB.');
    }
    return input;
}
async function hiddenQuestion(prompt: string): Promise<string> {
    if (!process.stdin.isTTY) throw new Error('Interactive login requires a terminal. Use --input - for piped JSON.');
    process.stderr.write(prompt);
    // Terminal input is not echoed. No passwords are placed in process arguments.
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    process.stdin.setRawMode(true);
    return new Promise((resolve, reject) => {
        let value = '';
        const finish = (): void => { process.stdin.setRawMode(false); process.stdin.removeListener('data', receive); rl.close(); process.stderr.write('\n'); };
        const receive = (chunk: Buffer): void => {
            for (const char of chunk.toString()) {
                if (char === '\u0003') { finish(); reject(new Error('Login cancelled.')); return; }
                if (char === '\r' || char === '\n') { finish(); resolve(value.trim()); return; }
                if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
                else value += char;
            }
        };
        process.stdin.on('data', receive);
    });
}
function output(value: unknown): void { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function command<Args extends unknown[]>(action: (...args: Args) => Promise<void> | void) {
    return async (...args: Args): Promise<void> => {
        try { await action(...args); }
        catch (error) { output({ success: false, error: safeError(error) }); process.exitCode = 1; }
    };
}

export function setupAgentCommands(program: Command): void {
    hardenHttp();
    const security = program.command('security').description('Inspect and encrypt local storage; never publishes or exports keys');
    security.command('status').action(command(() => { output(securityStatus()); }));
    security.command('protect').description('Require the OS keyring, tighten permissions and encrypt existing local records without plaintext backups')
        .action(command(() => { output(protectStorage()); }));
    const templates = program.command('templates').description('Save reusable local recipes and create drafts with platform/account variants');
    templates.command('list').option('--query <text>').option('--limit <number>', 'Maximum results', '20')
        .action(command((options: { query?: string; limit: string }) => { output(new AgentTemplates().list({ query: options.query, limit: Number(options.limit) })); }));
    templates.command('get <templateId>').action(command((templateId: string) => { output({ template: new AgentTemplates().get(templateId) }); }));
    templates.command('save').requiredOption('--input <file>', 'Full template JSON including id, name and content; expectedRevision for updates, or - for stdin')
        .action(command(async (options: { input: string }) => { output({ template: new AgentTemplates().save(parseInput(await readInput(options.input))) }); }));
    templates.command('delete <templateId>').requiredOption('--revision <number>', 'Current template revision')
        .action(command((templateId: string, options: { revision: string }) => { output(new AgentTemplates().delete({ templateId, expectedRevision: Number(options.revision) })); }));
    templates.command('render <templateId>').requiredOption('--revision <number>', 'Current template revision').requiredOption('--input <file>', 'JSON {values, accountIds?}, or - for stdin')
        .description('Try literal variable substitution without saving or publishing')
        .action(command(async (templateId: string, options: { revision: string; input: string }) => {
            const input = parseInput(await readInput(options.input));
            const result = new AgentTemplates().render({ ...input, templateId, expectedRevision: Number(options.revision) });
            output(result); if (!result.valid) process.exitCode = 1;
        }));
    templates.command('use <templateId>').requiredOption('--revision <number>', 'Current template revision').requiredOption('--input <file>', 'JSON {values, accountIds?, title?}, or - for stdin')
        .description('Save an independent draft from a template; never publishes')
        .action(command(async (templateId: string, options: { revision: string; input: string }) => {
            const input = parseInput(await readInput(options.input));
            output(new AgentTemplates().createDraft({ ...input, templateId, expectedRevision: Number(options.revision) }));
        }));
    const drafts = program.command('drafts').description('Create, edit, preview and publish saved draft revisions');
    drafts.command('variants <draftId>').description('Read effective content for each selected account; does not publish')
        .action(command((draftId: string) => { output(new AgentDrafts().variants(draftId)); }));
    drafts.command('set-variant <draftId> <accountId>').requiredOption('--revision <number>', 'Current draft revision').requiredOption('--input <file>', 'JSON override {text?,media?,posts?}; null resets to base, or - for stdin')
        .action(command(async (draftId: string, accountId: string, options: { revision: string; input: string }) => {
            const variant = parseInput(await readInput(options.input));
            output({ draft: new AgentDrafts().setVariant({ draftId, accountId, expectedRevision: Number(options.revision), variant }) });
        }));
    drafts.command('create').option('--input <file>', 'Draft JSON {title?, content}, or - for stdin').option('--title <title>')
        .description('Save a local draft without publishing')
        .action(command(async (options: { input?: string; title?: string }) => {
            const input = options.input ? parseInput(await readInput(options.input)) : { content: {} };
            if (options.title !== undefined) input.title = options.title;
            output({ draft: new AgentDrafts().create(input) });
        }));
    drafts.command('get <draftId>').description('Read a draft and its current status/receipts').action(command((draftId: string) => { output({ draft: new AgentDrafts().get(draftId) }); }));
    drafts.command('list').option('--status <status>', 'Draft, Preview, Publishing, Published, NeedsReview or SavedRemotely').option('--limit <number>', 'Maximum results', '20')
        .action(command((options: { status?: string; limit: string }) => { output(new AgentDrafts().list({ status: options.status, limit: Number(options.limit) })); }));
    drafts.command('update <draftId>').requiredOption('--revision <number>', 'Current revision from drafts get').requiredOption('--input <file>', 'JSON {title?, patch?}, or - for stdin')
        .description('Edit content; increments revision and invalidates its preview')
        .action(command(async (draftId: string, options: { revision: string; input: string }) => {
            const input = parseInput(await readInput(options.input));
            output({ draft: new AgentDrafts().update({ ...input, draftId, expectedRevision: Number(options.revision) }) });
        }));
    drafts.command('preview <draftId>').requiredOption('--revision <number>', 'Current content revision')
        .description('Save a preview snapshot; never publishes')
        .action(command(async (draftId: string, options: { revision: string }) => {
            const draft = await new AgentDrafts().preview({ draftId, expectedRevision: Number(options.revision) });
            output({ draft }); if (draft.status !== 'Preview') process.exitCode = 1;
        }));
    drafts.command('publish <draftId>').requiredOption('--revision <number>', 'Previewed content revision').requiredOption('--preview-id <id>', 'Saved preview ID')
        .requiredOption('--request-id <id>', 'Stable ID for this authorized publication; preserve on retries')
        .description('Publish exactly the saved preview and return actual publication receipts')
        .action(command(async (draftId: string, options: { revision: string; previewId: string; requestId: string }) => {
            axios.defaults.timeout = 30000; axios.defaults.maxRedirects = 0;
            const result = await new AgentDrafts().publish({ draftId, expectedRevision: Number(options.revision), previewId: options.previewId, requestId: options.requestId });
            output(result); if (!['Published', 'SavedRemotely'].includes(result.draft.status)) process.exitCode = 1;
        }));
    drafts.command('schedule <draftId>').requiredOption('--revision <number>', 'Previewed content revision').requiredOption('--preview-id <id>', 'Saved preview ID')
        .requiredOption('--request-id <id>', 'Stable ID; reuse it on retries').requiredOption('--at <time>', 'ISO 8601 time with timezone, e.g. 2026-12-01T10:00:00+02:00')
        .description('Schedule a previewed draft through DotSuite, one post per platform')
        .action(command(async (draftId: string, options: { revision: string; previewId: string; requestId: string; at: string }) => {
            const result = await new AgentDrafts().schedule({ draftId, expectedRevision: Number(options.revision), previewId: options.previewId, requestId: options.requestId, scheduledAt: options.at });
            output(result); if (result.draft.status !== 'Scheduled') process.exitCode = 1;
        }));
    program.command('setup').description('Connect DotShare to Codex, Claude Code or Cursor, or print a generic MCP client snippet')
        .option('--client <client>', 'codex, claude, cursor or generic', 'codex')
        .option('--config <path>', 'Custom config path (Codex config.toml or Cursor mcp.json)')
        .option('--media-root <paths...>', 'Explicit absolute image directories to allow')
        .option('--text-only', 'Disable local images in the client configuration')
        .option('--dry-run', 'Verify the server and preview configuration without writing it')
        .option('--replace', 'Replace a conflicting dotshare entry; preserve all other MCP servers')
        .option('--json', 'Machine-readable output')
        .action(command(async (options: SetupOptions & { json?: boolean }) => {
            const result = await runSetup(options);
            if (options.json) { output(result); return; }
            process.stdout.write(`DotShare setup\n${result.dryRun ? 'Configuration preview; no settings written.' : result.changed ? 'Client configuration updated.' : 'Client configuration is already up to date.'}\nMCP verified: ${result.tools} tools.\n`);
            if (result.configPath) process.stdout.write(`Config: ${result.configPath}\n`);
            if (result.backupPath) process.stdout.write(`Backup: ${result.backupPath}\n`);
            process.stdout.write(result.mediaRoots.length ? `Images: ${result.mediaRoots.join(', ')}\n` : 'Images: disabled (text-only).\n');
            if (result.dryRun) process.stdout.write(`\n${result.snippet}\n`);
            process.stdout.write(`\nNext steps:\n${result.nextSteps.map(step => `- ${step}`).join('\n')}\n`);
        }));
    program.command('doctor').description('Diagnose local setup and MCP connectivity without publishing')
        .option('--client <client>', 'codex, claude, cursor or generic', 'codex')
        .option('--config <path>', 'Custom config path (Codex config.toml or Cursor mcp.json)')
        .option('--check-accounts', 'Read credentials and check platform identities; never publishes')
        .option('--account <id>', 'Check one account (implies --check-accounts)')
        .option('--skip-mcp', 'Skip the subprocess handshake; connectivity remains unverified')
        .option('--json', 'Machine-readable output')
        .action(command(async (options: DoctorOptions & { json?: boolean }) => {
            const result = await runDoctor(options);
            if (options.json) output(result); else process.stdout.write(formatDoctor(result));
            if (!result.success) process.exitCode = 1;
        }));
    program.command('mcp').description('Start the DotShare MCP server over stdio').action(async () => { await startAgentServer(); });
    const accounts = program.command('accounts').description('Manage local agent accounts (credentials stay in the OS keyring)');
    accounts.command('list').action(command(() => { output({ accounts: new AccountStore().list() }); }));
    accounts.command('add [id]').option('--platform <platform>').option('--name <name>').option('--input <file>', 'Read account JSON from a file or - for stdin')
        .description('Connect a local account using hidden terminal prompts or JSON stdin')
        .action(command(async (id: string | undefined, options: { input?: string; platform?: string; name?: string }) => {
            const store = new AccountStore();
            if (options.input) { output({ account: store.add(parseInput(await readInput(options.input, true))) }); return; }
            const accountId = accountIdSchema.parse(id);
            const platform = platformSchema.parse(options.platform);
            const credentials: Record<string, string> = {};
            for (const field of CREDENTIAL_FIELDS[platform]) credentials[field] = await hiddenQuestion(`${field}: `);
            output({ account: store.add({ id: accountId, name: options.name || accountId, platform, credentials }) });
        }));
    accounts.command('connect <id>').requiredOption('--platform <platform>', 'linkedin or x')
        .option('--name <name>', 'Display name (defaults to the ID, or the existing name)')
        .option('--no-open', 'Print the sign-in link without opening a browser')
        .option('--timeout <seconds>', 'How long to wait for the browser sign-in', '300')
        .description('Sign in to LinkedIn or X in your browser; no token to copy. X sign-ins refresh automatically')
        .action(command(async (id: string, options: { platform: string; name?: string; open: boolean; timeout: string }) => {
            const timeout = Number(options.timeout);
            if (!Number.isInteger(timeout) || timeout < 30 || timeout > 1800) throw new Error('timeout must be between 30 and 1800 seconds.');
            const result = await connectAccount(new AccountStore(), {
                id, platform: options.platform, name: options.name, open: options.open, timeoutMs: timeout * 1000,
                announce: url => process.stderr.write(`Sign in to continue${options.open ? ' (opening your browser)' : ''}:\n${url}\n\nWaiting for the browser... (Ctrl+C to cancel)\n`),
            });
            output({ success: true, ...result });
        }));
    accounts.command('remove <id>').action(command((id: string) => { new AccountStore().remove(id); output({ success: true }); }));
    program.command('preview').requiredOption('--input <file>', 'Post JSON file or - for stdin').action(command(async (options: { input: string }) => {
        const preview = await new AgentPublisher().planner.preview(parseInput(await readInput(options.input)));
        output(preview); if (!preview.valid) process.exitCode = 1;
    }));
    program.command('publish').requiredOption('--input <file>', 'Post JSON including a stable requestId, or - for stdin').action(command(async (options: { input: string }) => {
        axios.defaults.timeout = 30000; axios.defaults.maxRedirects = 0;
        const result = await new AgentPublisher().publish(parseInput(await readInput(options.input)));
        output(result); if (result.operation.status !== 'completed') process.exitCode = 1;
    }));
    program.command('stats').option('--request-id <id>', 'Published operation').option('--draft <draftId>', 'Published draft')
        .description('Show likes, reposts, replies and views for something DotShare published; read-only')
        .action(command(async (options: { requestId?: string; draft?: string }) => {
            const store = new AccountStore();
            const drafts = new AgentDrafts(new AgentPublisher(store));
            output(await new AgentStats(store, undefined, id => drafts.get(id).publication?.requestId).get({ requestId: options.requestId, draftId: options.draft }));
        }));
    program.command('operation <requestId>').action(command((requestId: string) => {
        const operation = new AgentPublisher().journal.get(requestId);
        if (!operation) throw new Error('Operation not found.');
        output({ operation });
    }));
    program.command('history').option('--limit <number>', 'Number of operations', '20').action(command((options: { limit: string }) => {
        const limit = Number(options.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be between 1 and 100.');
        output({ operations: new AgentPublisher().journal.list(limit) });
    }));
    const cloud = program.command('cloud').description('Use the accounts already connected to the DotSuite cloud dashboard');
    cloud.command('login').option('--input <file>', 'Token JSON {"token":"..."} file or - for stdin').action(command(async (options: { input?: string }) => {
        const token = options.input ? parseInput(await readInput(options.input, true)).token : await hiddenQuestion('DotSuite token: ');
        if (typeof token !== 'string') throw new Error('Expected a token string.');
        new AccountStore().setCloudToken(token); output({ success: true });
    }));
    cloud.command('connections').action(command(async () => { output({ platforms: await new AgentCloud(new AccountStore()).connections() }); }));
    cloud.command('schedule').requiredOption('--input <file>', 'Schedule JSON file or - for stdin').action(command(async (options: { input: string }) => {
        const result = await new AgentCloud(new AccountStore()).schedule(parseInput(await readInput(options.input)));
        output(result); if (result.operation.status !== 'completed') process.exitCode = 1;
    }));
    cloud.command('list').action(command(async () => { output({ posts: await new AgentCloud(new AccountStore()).list() }); }));
    cloud.command('cancel <postId>').requiredOption('--request-id <id>').action(command(async (postId: string, options: { requestId: string }) => {
        const result = await new AgentCloud(new AccountStore()).cancel(options.requestId, postId);
        output(result); if (result.operation.status !== 'completed') process.exitCode = 1;
    }));
}
