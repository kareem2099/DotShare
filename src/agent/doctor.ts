import * as fs from 'fs';
import * as path from 'path';
import { AccountStore, defaultAgentHome } from './accounts';
import { loadKeyringBinding } from '../cli/credential-store';
import { checkAccount, CheckAccount, AccountCheck } from './account-check';
import { ProbeMcp, probeMcp } from './mcp-probe';
import { SetupClient, Installation, installation, configPath, readClientConfig, mediaRoots, object, sameServer, supportedNode, launchEnvironment, configTimeout, forwardedVariables } from './setup';

export interface Diagnostic { id: string; status: 'pass' | 'warn' | 'fail'; message: string; fix?: string; }
export interface DoctorOptions { client?: SetupClient; config?: string; checkAccounts?: boolean; account?: string; skipMcp?: boolean; }
export interface DoctorContext {
    installation?: Installation; accounts?: AccountStore; environment?: Record<string, string | undefined>;
    probe?: ProbeMcp; checkAccount?: CheckAccount; keyringBinding?: () => unknown;
}
export interface DoctorResult {
    success: boolean; mcpReady: boolean | null; client: SetupClient; checks: Diagnostic[];
    accounts: AccountCheck[]; accountChecksPerformed: boolean; notes: string[];
}

export async function runDoctor(options: DoctorOptions = {}, context: DoctorContext = {}): Promise<DoctorResult> {
    const client = options.client || 'codex';
    if (!['codex', 'generic'].includes(client)) throw new Error('client must be codex or generic.');
    if (client === 'generic' && options.config) throw new Error('--config is only used with --client codex.');
    const current = context.installation || installation();
    const environment = context.environment || process.env;
    const checks: Diagnostic[] = [];
    const add = (id: string, status: Diagnostic['status'], message: string, fix?: string): void => { checks.push({ id, status, message, ...(fix && { fix }) }); };
    add('node', supportedNode() ? 'pass' : 'fail', `Node ${process.versions.node}; DotShare requires 22.12+.`, supportedNode() ? undefined : 'Install Node.js 22.12 or newer, then run setup again.');
    const launcher = fs.existsSync(current.server) && fs.statSync(current.server).isFile();
    add('launcher', launcher ? 'pass' : 'fail', launcher ? 'DotShare MCP launcher is present.' : 'DotShare MCP launcher is missing.', launcher ? undefined : 'Reinstall DotShare or restore bin/dotshare-mcp.js in this source checkout.');
    const bundle = path.join(current.root, 'out/agent/server.js');
    const compiled = fs.existsSync(bundle);
    add('bundle', compiled ? 'pass' : 'fail', compiled ? 'Compiled MCP server is present.' : 'Compiled MCP server is missing.', compiled ? undefined : 'From a source checkout run npm run compile; for an installed CLI, reinstall its package.');
    try { (context.keyringBinding || loadKeyringBinding)(); add('keyring-binding', 'pass', 'Native keyring binding loads. Secret access is checked only with --check-accounts.'); }
    catch { add('keyring-binding', 'fail', 'Native keyring binding could not load.', 'Reinstall dependencies for this OS/architecture using a supported Node version.'); }
    let extra: Record<string, unknown> = {};
    let configReady = client === 'generic';
    if (client === 'codex') {
        try {
            const config = readClientConfig(configPath(options.config, environment));
            if (!config.entry) add('client-config', 'fail', 'Codex has no dotshare MCP entry.', 'Run dotshare-agent setup, then restart/reconnect Codex.');
            else if (!sameServer(config.entry, current)) add('client-config', 'fail', 'Codex points at another DotShare installation or transport.', 'Use doctor from that installation, or run setup --replace to select this installation.');
            else if (config.entry.enabled === false) add('client-config', 'fail', 'DotShare is disabled in Codex.', 'Run dotshare-agent setup to enable it, then reconnect Codex.');
            else {
                configTimeout(config.entry.startup_timeout_sec, 20);
                configTimeout(config.entry.tool_timeout_sec, 600);
                forwardedVariables(config.entry.env_vars);
                if (config.entry.enabled !== undefined && typeof config.entry.enabled !== 'boolean') throw new Error();
                extra = object(config.entry.env) || {};
                if (config.entry.env !== undefined && !object(config.entry.env)) throw new Error();
                if (config.entry.command !== current.node) add('client-config', 'fail', 'Codex uses a different Node command from this verified runtime.', 'Run setup using the Node runtime you want Codex to use.');
                else { configReady = true; add('client-config', 'pass', 'Codex points to this DotShare installation. Restart/reconnect is still required after configuration changes.'); }
                if (Array.isArray(config.entry.enabled_tools) || Array.isArray(config.entry.disabled_tools)) {
                    add('tool-policy', 'warn', 'Client tool allow/deny lists are configured; some DotShare tools may be intentionally hidden.', 'Review tool policy if a publishing or preview tool is missing.');
                }
            }
        } catch { add('client-config', 'fail', 'Codex configuration is unreadable or invalid. Its contents were not displayed.', 'Repair config.toml and run setup again.'); }
    } else add('client-config', 'warn', 'Generic MCP client configuration is not inspected. This checks the standalone server only.');
    let effective: Record<string, string> = {};
    try { effective = launchEnvironment(environment, extra); }
    catch { add('environment', 'fail', 'A configured MCP environment value is not a string.', 'Repair the DotShare env table in the client configuration.'); }
    const roots = (effective.DOTSHARE_MEDIA_ROOTS || '').split(path.delimiter).filter(Boolean);
    try {
        const validated = mediaRoots(roots);
        add('media-roots', validated.length ? 'pass' : 'warn', validated.length ? `${validated.length} allowed image director${validated.length === 1 ? 'y' : 'ies'} verified.` : 'Local images are disabled; text-only posts can work.', validated.length ? undefined : 'Enable a specific directory with setup --media-root /absolute/image/directory.');
    } catch { add('media-roots', 'warn', 'DOTSHARE_MEDIA_ROOTS contains a missing, unreadable, or invalid directory. Local images are disabled.', 'Run setup --media-root /absolute/image/directory with an existing directory.'); }
    const store = context.accounts || new AccountStore(path.resolve(effective.DOTSHARE_HOME || defaultAgentHome()));
    let localAccounts: ReturnType<AccountStore['list']>;
    try {
        localAccounts = store.list();
        if (options.account) {
            const requested = store.get(options.account); localAccounts = [requested];
        }
        add('accounts', localAccounts.length ? 'pass' : 'warn', localAccounts.length ? `${localAccounts.length} local account${localAccounts.length === 1 ? '' : 's'} configured.` : 'No local publishing accounts are configured.', localAccounts.length ? undefined : 'Connect one in your terminal: dotshare-agent accounts add <id> --platform <platform>');
    } catch { localAccounts = []; add('accounts', 'fail', 'Account metadata is unreadable, invalid, or the requested account ID is missing.', 'Check accounts list and the account metadata file. No credential values were displayed.'); }
    let handshake = false;
    if (options.skipMcp) add('mcp', 'warn', 'MCP handshake skipped; connectivity has not been verified.');
    else if (supportedNode() && launcher && compiled && !checks.some(check => check.id === 'environment' && check.status === 'fail')) {
        const result = await (context.probe || probeMcp)({ command: current.node, args: [current.server], cwd: current.root, env: effective });
        handshake = result.success;
        add('mcp', result.success ? 'pass' : 'fail', result.message, result.success ? undefined : 'Build/reinstall DotShare and check that this environment permits child processes.');
    } else add('mcp', 'fail', 'Cannot test MCP until the runtime, launcher, bundle and environment checks pass.');
    const accountChecksPerformed = Boolean(options.checkAccounts || options.account);
    add('credential-policy', 'pass', process.platform === 'linux' ? 'Secret Service is required; automatic Linux kernel-keyring fallback is disabled.' : 'Native OS credential storage is required; no file fallback.');
    try {
        const storage = store.files.status();
        add('encrypted-storage', storage.plaintext || storage.unreadable ? 'fail' : storage.initialized ? 'pass' : 'warn',
            `${storage.encrypted} encrypted records; ${storage.plaintext} legacy plaintext; ${storage.unreadable} unreadable. Key access ${accountChecksPerformed && storage.initialized ? 'checked separately' : 'not checked'}.`,
            storage.plaintext ? 'Run dotshare-agent security protect, then restart all MCP clients/VS Code windows.' : storage.unreadable ? 'Inspect/restore the local records before publishing again.' : !storage.initialized ? 'The first saved record requires the OS keyring. Run security protect to initialize explicitly.' : undefined);
        if (accountChecksPerformed && storage.initialized) {
            try { store.files.verifyKey(); add('vault-key', 'pass', 'The matching encryption key is accessible in the required OS credential store.'); }
            catch { add('vault-key', 'fail', 'The encryption key is unavailable. No replacement key was created.', 'Unlock the OS store or restore its original key; do not delete security.json.'); }
        }
    } catch { add('encrypted-storage', 'fail', 'Storage directories or permissions are unsafe or unreadable.', 'Inspect ownership/symlinks, then run security protect.'); }
    const accounts: AccountCheck[] = [];
    if (accountChecksPerformed) {
        for (const account of localAccounts) accounts.push(await (context.checkAccount || checkAccount)(store, account));
    } else if (localAccounts.length) add('account-access', 'warn', 'Credentials and platform identities have not been checked.', 'Run doctor --check-accounts (reads the keyring and contacts platform identity endpoints; never publishes).');
    return {
        success: !checks.some(check => check.status === 'fail') && !accounts.some(account => account.status === 'fail'),
        mcpReady: options.skipMcp ? null : handshake && configReady,
        client, checks, accounts, accountChecksPerformed,
        notes: ['Doctor never publishes, uploads, schedules, refreshes tokens, syncs credentials or changes client settings.',
            'Passing identity checks does not prove posting permissions, encrypted-at-rest storage, or that the running MCP client has reloaded its configuration.'],
    };
}

export function formatDoctor(report: DoctorResult): string {
    const lines = ['DotShare doctor', ...report.checks.map(check => `${check.status.toUpperCase()} ${check.id}: ${check.message}${check.fix ? `\n  Fix: ${check.fix}` : ''}`)];
    for (const account of report.accounts) lines.push(`${account.status.toUpperCase()} account ${account.id} (${account.platform})${account.identity ? `: ${account.identity}` : ''}: ${account.message}${account.fix ? `\n  Fix: ${account.fix}` : ''}`);
    lines.push(`MCP ready: ${report.mcpReady === null ? 'not tested' : report.mcpReady ? 'yes' : 'no'}`, ...report.notes);
    return `${lines.join('\n')}\n`;
}
