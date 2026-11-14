import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse, stringify } from 'smol-toml';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { defaultAgentHome } from './accounts';
import { McpLaunch, ProbeMcp, probeMcp } from './mcp-probe';
import { withFileLock } from '../security/locks';
import { SkillInstall, installSkill, skillDirectory, skillSource } from './skill';

export type SetupClient = 'codex' | 'claude' | 'cursor' | 'antigravity' | 'generic';
export const SETUP_CLIENTS: readonly SetupClient[] = ['codex', 'claude', 'cursor', 'antigravity', 'generic'];
/** Clients whose MCP settings are a JSON file with an `mcpServers` object. */
export const JSON_CLIENTS: readonly SetupClient[] = ['cursor', 'antigravity'];
/** Runs the Claude Code CLI; replaceable in tests. Resolves with its exit code and output. */
export type RunCommand = (command: string, args: string[]) => Promise<{ code: number; output: string }>;
export interface Installation { root: string; server: string; node: string; }
export interface SetupOptions { client?: SetupClient; config?: string; mediaRoot?: string[]; textOnly?: boolean; dryRun?: boolean; replace?: boolean; skill?: boolean; skillsDir?: string; }
/** `home` is DOTSHARE_HOME (accounts); `userHome` is the OS home directory that holds the clients' skills. */
export interface SetupContext { installation?: Installation; home?: string; userHome?: string; environment?: Record<string, string | undefined>; probe?: ProbeMcp; run?: RunCommand; }
export interface ClientConfig { file: string; original: string; document: Record<string, unknown>; entry?: Record<string, unknown>; }
export interface SetupResult {
    success: boolean; client: SetupClient; configPath?: string; changed: boolean; dryRun: boolean;
    backupPath?: string; mediaRoots: string[]; snippet: string; tools: number; nextSteps: string[];
    /** The agent skill in the client's skills directory; absent for the generic client, with --no-skill, or in a build without it. */
    skill?: SkillInstall;
}
const SESSION_VARIABLES = ['DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'DISPLAY', 'WAYLAND_DISPLAY'];
export const installation = (): Installation => {
    const root = path.resolve(__dirname, '../..');
    return { root, server: path.join(root, 'bin/dotshare-mcp.js'), node: process.execPath };
};
export function object(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function supportedNode(version = process.versions.node): boolean {
    const [major, minor] = version.split('.').map(Number);
    return major > 22 || (major === 22 && minor >= 12);
}
export function configTimeout(value: unknown, fallback: number): number {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error('MCP timeouts must be positive numbers. Repair the existing DotShare entry before setup.');
    return value;
}
export function forwardedVariables(value: unknown): (string | { name: string; source?: 'local' | 'remote' })[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error('env_vars must be an array of environment variable names.');
    return value.map(item => {
        if (typeof item === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(item)) return item;
        const variable = object(item);
        if (variable && typeof variable.name === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.name)
            && Object.keys(variable).every(key => ['name', 'source'].includes(key))
            && (variable.source === undefined || variable.source === 'local' || variable.source === 'remote')) {
            return { name: variable.name, ...(variable.source !== undefined && { source: variable.source as 'local' | 'remote' }) };
        }
        throw new Error('Invalid env_vars entry. Use a variable name or an object with name and local/remote source only.');
    });
}
export function configPath(file?: string, environment = process.env): string {
    return path.resolve(file || path.join(environment.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml'));
}
/** Cursor reads MCP servers from ~/.cursor/mcp.json (`mcpServers`). */
export function cursorConfigPath(file?: string): string {
    return path.resolve(file || path.join(os.homedir(), '.cursor', 'mcp.json'));
}
/** Antigravity (App and CLI) reads global MCP servers from ~/.gemini/config/mcp_config.json (`mcpServers`). */
export function antigravityConfigPath(file?: string): string {
    return path.resolve(file || path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json'));
}
/** The MCP settings file of a JSON client. */
export function jsonConfigPath(client: SetupClient, file?: string): string {
    return client === 'antigravity' ? antigravityConfigPath(file) : cursorConfigPath(file);
}
export interface JsonClientConfig { file: string; original: string; document: Record<string, unknown>; entry?: Record<string, unknown>; }
export function readJsonClientConfig(file: string): JsonClientConfig {
    let original = '';
    try {
        if (fs.existsSync(file)) {
            file = fs.realpathSync(file);
            if (!fs.statSync(file).isFile() || fs.statSync(file).size > 1024 * 1024) throw new Error();
            original = fs.readFileSync(file, 'utf8');
        }
    } catch { throw new Error('Cannot read the MCP client configuration. Check its file path and permissions.'); }
    let document: Record<string, unknown> | undefined;
    try { document = original.trim() ? object(JSON.parse(original)) : {}; }
    catch { throw new Error('Client configuration contains invalid JSON. Repair it before running setup; no settings were changed.'); }
    if (!document) throw new Error('Client configuration must be a JSON object.');
    const servers = document.mcpServers === undefined ? {} : object(document.mcpServers);
    if (!servers) throw new Error('mcpServers must be a JSON object.');
    const entry = servers.dotshare === undefined ? undefined : object(servers.dotshare);
    if (servers.dotshare !== undefined && !entry) throw new Error('The dotshare MCP entry must be a JSON object.');
    return { file, original, document, entry };
}

const runCommand: RunCommand = (command, args) => new Promise(resolve => {
    execFile(command, args, { timeout: 60000, windowsHide: true, shell: false }, (error, stdout, stderr) => {
        const code = error ? typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 127 : 0;
        resolve({ code, output: `${stdout}${stderr}`.slice(0, 2000) });
    });
});

export function readClientConfig(file: string): ClientConfig {
    let original = '';
    try {
        if (fs.existsSync(file)) {
            file = fs.realpathSync(file);
            if (!fs.statSync(file).isFile() || fs.statSync(file).size > 1024 * 1024) throw new Error();
            original = fs.readFileSync(file, 'utf8');
        }
    } catch { throw new Error('Cannot read the MCP client configuration. Check its file path and permissions.'); }
    let document: Record<string, unknown>;
    try { document = parse(original, { unsafeKeyBehaviour: 'throw', integersAsBigInt: 'asNeeded' }); }
    catch { throw new Error('Client configuration contains invalid or unsupported TOML. Repair it before running setup; no settings were changed.'); }
    const servers = document.mcp_servers === undefined ? {} : object(document.mcp_servers);
    if (!servers) throw new Error('mcp_servers must be a TOML table.');
    const entry = servers.dotshare === undefined ? undefined : object(servers.dotshare);
    if (servers.dotshare !== undefined && !entry) throw new Error('The dotshare MCP entry must be a TOML table.');
    return { file, original, document, entry };
}
export function mediaRoots(value: string[]): string[] {
    return [...new Set(value.map(root => {
        if (!path.isAbsolute(root) || root.includes(path.delimiter)) throw new Error('Image roots must be absolute directory paths without the OS path delimiter.');
        let real: string;
        try { real = fs.realpathSync(root); if (!fs.statSync(real).isDirectory()) throw new Error(); fs.accessSync(real, fs.constants.R_OK); }
        catch { throw new Error('An image directory is missing, unreadable, or is not a directory.'); }
        return real;
    }))];
}
export function launchEnvironment(environment: Record<string, string | undefined>, extra: Record<string, unknown> = {}): Record<string, string> {
    const result = Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    for (const [key, value] of Object.entries(extra)) {
        if (typeof value !== 'string') throw new Error('MCP environment values must be strings.');
        result[key] = value;
    }
    return result;
}
export function sameServer(entry: Record<string, unknown>, current: Installation): boolean {
    const args = entry.args;
    if (entry.url !== undefined || !Array.isArray(args) || args.length !== 1 || typeof args[0] !== 'string') return false;
    try { return fs.realpathSync(path.resolve(typeof entry.cwd === 'string' ? entry.cwd : current.root, args[0])) === fs.realpathSync(current.server); }
    catch { return false; }
}

// Keep other tables, comments and multiline strings byte-for-byte. A candidate
// table header only counts when the prefix is complete TOML, so a header-looking
// line inside a multiline value cannot cause deletion of unrelated settings.
export function replaceCodexEntry(config: ClientConfig, entry: Record<string, unknown>): string {
    const headers: { start: number; owned: boolean }[] = [];
    let offset = 0;
    for (const line of config.original.split(/(?<=\n)/)) {
        if (/^\s*\[/.test(line)) {
            try {
                parse(config.original.slice(0, offset));
                const header = parse(line);
                headers.push({ start: offset, owned: object(header.mcp_servers)?.dotshare !== undefined });
            } catch { /* A multiline value, array continuation, or non-header line. */ }
        }
        offset += line.length;
    }
    if (config.entry && !headers.some(header => header.owned)) {
        throw new Error('The existing DotShare entry uses inline or dotted TOML keys. Convert it to [mcp_servers.dotshare], or use setup --client generic to get a configuration snippet.');
    }
    let original = ''; let cursor = 0;
    headers.forEach((header, index) => {
        if (!header.owned) return;
        original += config.original.slice(cursor, header.start);
        cursor = headers[index + 1]?.start ?? config.original.length;
    });
    original += config.original.slice(cursor);
    const next = `${original.trimEnd()}\n\n${stringify({ mcp_servers: { dotshare: entry } })}`.trimStart();
    try { parse(next, { unsafeKeyBehaviour: 'throw', integersAsBigInt: 'asNeeded' }); }
    catch { throw new Error('Could not safely merge the DotShare configuration. No client settings were changed.'); }
    return next;
}

function writeConfig(config: Pick<ClientConfig, 'file' | 'original'>, next: string): string {
    fs.mkdirSync(path.dirname(config.file), { recursive: true, mode: 0o700 });
    const temporary = `${config.file}.${randomUUID()}.tmp`;
    return withFileLock(`${config.file}.dotshare-setup.lock`, () => {
        try {
            const current = fs.existsSync(config.file) ? fs.readFileSync(config.file, 'utf8') : '';
            if (current !== config.original) throw new Error('Client settings changed during setup. Run setup again to preserve the newer settings.');
            const backup = `${config.file}.before-dotshare-${randomUUID()}`;
            if (fs.existsSync(config.file)) fs.writeFileSync(backup, config.original, { flag: 'wx', mode: 0o600 });
            fs.writeFileSync(temporary, next, { flag: 'wx', mode: 0o600 });
            fs.renameSync(temporary, config.file);
            return fs.existsSync(backup) ? backup : '';
        } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
    }, { busy: () => new Error('Cannot lock the client config. Check directory permissions, or wait for the other setup process to finish.') });
}

/**
 * Adds DotShare to Claude Code's user scope through its own CLI rather than
 * editing ~/.claude.json, which Claude Code rewrites while it runs.
 */
async function addToClaudeCode(entry: Record<string, unknown>, replace: boolean, run: RunCommand): Promise<boolean> {
    const add = (): Promise<{ code: number; output: string }> => run('claude', ['mcp', 'add-json', '--scope', 'user', 'dotshare', JSON.stringify(entry)]);
    let result = await add();
    if (result.code === 127) throw new Error('The claude command was not found. Install Claude Code, or run setup --client claude --dry-run and add the printed command yourself.');
    if (result.code !== 0 && /already exists/i.test(result.output)) {
        if (!replace) throw new Error('Claude Code already has a dotshare MCP server. Use --replace to replace it.');
        const removed = await run('claude', ['mcp', 'remove', '--scope', 'user', 'dotshare']);
        if (removed.code !== 0) throw new Error('Could not replace the existing dotshare server in Claude Code. Remove it with: claude mcp remove dotshare');
        result = await add();
    }
    if (result.code !== 0) throw new Error('Claude Code did not accept the DotShare server. Run setup --client claude --dry-run and add the printed command yourself.');
    return true;
}

export async function runSetup(options: SetupOptions = {}, context: SetupContext = {}): Promise<SetupResult> {
    const client = options.client || 'codex';
    if (!SETUP_CLIENTS.includes(client)) throw new Error(`client must be one of: ${SETUP_CLIENTS.join(', ')}.`);
    if ((client === 'generic' || client === 'claude') && options.config) throw new Error('--config is only used with --client codex, cursor or antigravity.');
    if (options.textOnly && options.mediaRoot?.length) throw new Error('Use --text-only or --media-root, not both.');
    if (!supportedNode()) throw new Error('DotShare requires Node.js 22.12 or newer.');
    const current = context.installation || installation();
    if (!fs.existsSync(current.server)) throw new Error('DotShare MCP launcher is missing. Reinstall the CLI package or use a complete source checkout.');
    const environment = context.environment || process.env;
    const config = client === 'codex' ? readClientConfig(configPath(options.config, environment)) : undefined;
    const json = JSON_CLIENTS.includes(client) ? readJsonClientConfig(jsonConfigPath(client, options.config)) : undefined;
    const prior = config?.entry || json?.entry;
    const conflict = prior && !sameServer(prior, current);
    if (conflict && !options.replace) throw new Error('Another DotShare server is already configured. Use --replace to replace only that entry, or --client generic to generate a snippet.');
    const base = conflict ? {} : client === 'codex' ? prior || {} : {};
    const inheritedVariables = forwardedVariables(base.env_vars);
    const previousEnv = object(base.env) || {};
    const roots = mediaRoots(options.textOnly ? [] : options.mediaRoot ?? String(previousEnv.DOTSHARE_MEDIA_ROOTS ?? environment.DOTSHARE_MEDIA_ROOTS ?? '').split(path.delimiter).filter(Boolean));
    const home = path.resolve(context.home || String(previousEnv.DOTSHARE_HOME || environment.DOTSHARE_HOME || defaultAgentHome()));
    const managed = {
        command: current.node, args: [current.server], cwd: current.root,
        startup_timeout_sec: configTimeout(base.startup_timeout_sec, 20), tool_timeout_sec: configTimeout(base.tool_timeout_sec, 600),
        env_vars: [...inheritedVariables, ...SESSION_VARIABLES.filter(name => !inheritedVariables.some(value => value === name || object(value)?.name === name))],
        env: { DOTSHARE_HOME: home, DOTSHARE_MEDIA_ROOTS: roots.join(path.delimiter) },
    };
    const entry = { ...base, ...managed, ...(base.enabled === false && { enabled: true }), env: { ...previousEnv, ...managed.env } };
    const launch: McpLaunch = { command: current.node, args: [current.server], cwd: current.root, env: launchEnvironment(environment, entry.env) };
    const probe = await (context.probe || probeMcp)(launch);
    if (!probe.success) throw new Error(probe.message);
    // JSON clients (Claude Code, Cursor, Antigravity, generic) take an absolute server path and no cwd.
    const jsonEntry = { command: managed.command, args: managed.args, env: managed.env };
    // Never include inherited client secrets or other server settings in the output.
    const snippet = client === 'codex' ? stringify({ mcp_servers: { dotshare: managed } })
        : client === 'claude' ? `claude mcp add-json --scope user dotshare '${JSON.stringify(jsonEntry)}'`
            : JSON.stringify({ mcpServers: { dotshare: jsonEntry } }, null, 2);
    let changed = false;
    let backupPath: string | undefined;
    let configFile: string | undefined;
    if (config) {
        changed = stringify({ entry: prior || {} }) !== stringify({ entry });
        configFile = config.file;
        if (changed && !options.dryRun) backupPath = writeConfig(config, replaceCodexEntry(config, entry)) || undefined;
    } else if (json) {
        changed = JSON.stringify(prior || {}) !== JSON.stringify(jsonEntry);
        configFile = json.file;
        const servers = { ...(object(json.document.mcpServers) || {}), dotshare: jsonEntry };
        if (changed && !options.dryRun) backupPath = writeConfig(json, `${JSON.stringify({ ...json.document, mcpServers: servers }, null, 2)}\n`) || undefined;
    } else if (client === 'claude' && !options.dryRun) {
        changed = await addToClaudeCode(jsonEntry, Boolean(options.replace), context.run || runCommand);
    }
    const skill = setupSkill(client, current, options, environment, context.userHome, path.join(home, 'skill-backups'));
    const reload = client === 'codex' ? 'Restart/reconnect Codex to load DotShare.'
        : client === 'cursor' ? 'Reload Cursor (or toggle DotShare in Settings → MCP) to load DotShare.'
            : client === 'antigravity' ? 'Refresh MCP servers in Antigravity (agent panel → Customizations → MCP Servers) and start a new conversation to load DotShare and its skill.'
            : client === 'claude' ? options.dryRun ? 'Run the command in snippet to add DotShare to Claude Code, then start a new session.' : 'Start a new Claude Code session (or run /mcp) to load DotShare.'
                : 'Merge this snippet into your MCP client configuration and reconnect it.';
    return {
        success: true, client, configPath: configFile, changed: changed && !options.dryRun,
        dryRun: Boolean(options.dryRun) || client === 'generic', backupPath, mediaRoots: roots, snippet, tools: probe.tools.length,
        ...(skill && { skill }),
        nextSteps: [reload,
            ...(client === 'generic' && !skill && options.skill !== false && skillSource(current) ? [`Install the agent skill so your agent follows DotShare's draft → preview → approval workflow: run setup --client generic --skills-dir <your agent's skills directory> (for example ~/.agents/skills), or copy ${skillSource(current)} there.`] : []),
            'Connect LinkedIn or X in your browser with: dotshare-agent accounts connect <id> --platform linkedin|x',
            'Connect other platforms with: dotshare-agent accounts add <id> --platform <platform>',
            'Verify account access with: dotshare-agent doctor --check-accounts',
            ...(roots.length ? [] : ['Local images are disabled. Enable specific directories with: dotshare-agent setup --media-root /absolute/image/directory'])],
    };
}

/** Copies the agent skill into the client's skills directory. Never fails setup. */
function setupSkill(client: SetupClient, current: Installation, options: SetupOptions, environment: Record<string, string | undefined>, userHome: string | undefined, backupRoot: string): SkillInstall | undefined {
    const source = skillSource(current);
    const directory = skillDirectory(client, environment, userHome, options.skillsDir);
    if (options.skill === false || !source || !directory) return undefined;
    try { return installSkill(source, directory, { replace: options.replace, dryRun: options.dryRun, backupRoot }); }
    catch { return { file: path.join(directory, 'SKILL.md'), state: 'unreadable', changed: false, message: `Could not write the agent skill to ${directory}. Check that directory's permissions; the MCP setup itself is complete.` }; }
}
