import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse, stringify } from 'smol-toml';
import { randomUUID } from 'crypto';
import { defaultAgentHome } from './accounts';
import { McpLaunch, ProbeMcp, probeMcp } from './mcp-probe';
import { withFileLock } from '../security/locks';

export type SetupClient = 'codex' | 'generic';
export interface Installation { root: string; server: string; node: string; }
export interface SetupOptions { client?: SetupClient; config?: string; mediaRoot?: string[]; textOnly?: boolean; dryRun?: boolean; replace?: boolean; }
export interface SetupContext { installation?: Installation; home?: string; environment?: Record<string, string | undefined>; probe?: ProbeMcp; }
export interface ClientConfig { file: string; original: string; document: Record<string, unknown>; entry?: Record<string, unknown>; }
export interface SetupResult {
    success: boolean; client: SetupClient; configPath?: string; changed: boolean; dryRun: boolean;
    backupPath?: string; mediaRoots: string[]; snippet: string; tools: number; nextSteps: string[];
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

function writeConfig(config: ClientConfig, next: string): string {
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

export async function runSetup(options: SetupOptions = {}, context: SetupContext = {}): Promise<SetupResult> {
    const client = options.client || 'codex';
    if (!['codex', 'generic'].includes(client)) throw new Error('client must be codex or generic.');
    if (client === 'generic' && options.config) throw new Error('--config is only used with --client codex.');
    if (options.textOnly && options.mediaRoot?.length) throw new Error('Use --text-only or --media-root, not both.');
    if (!supportedNode()) throw new Error('DotShare requires Node.js 22.12 or newer.');
    const current = context.installation || installation();
    if (!fs.existsSync(current.server)) throw new Error('DotShare MCP launcher is missing. Reinstall the CLI package or use a complete source checkout.');
    const environment = context.environment || process.env;
    const config = client === 'codex' ? readClientConfig(configPath(options.config, environment)) : undefined;
    const prior = config?.entry;
    const conflict = prior && !sameServer(prior, current);
    if (conflict && !options.replace) throw new Error('Another DotShare server is already configured. Use --replace to replace only that entry, or --client generic to generate a snippet.');
    const base = conflict ? {} : prior || {};
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
    // Never include inherited client secrets or other server settings in the output.
    const snippet = client === 'codex' ? stringify({ mcp_servers: { dotshare: managed } })
        : JSON.stringify({ mcpServers: { dotshare: { command: managed.command, args: managed.args, cwd: managed.cwd, env: managed.env } } }, null, 2);
    const changed = Boolean(config && stringify({ entry: prior || {} }) !== stringify({ entry }));
    let backupPath: string | undefined;
    if (config && changed) {
        const next = replaceCodexEntry(config, entry);
        if (!options.dryRun) backupPath = writeConfig(config, next) || undefined;
    }
    return {
        success: true, client, configPath: config?.file, changed: changed && !options.dryRun,
        dryRun: Boolean(options.dryRun) || client === 'generic', backupPath, mediaRoots: roots, snippet, tools: probe.tools.length,
        nextSteps: [client === 'codex' ? 'Restart/reconnect your MCP client to load DotShare.' : 'Merge this snippet into your MCP client configuration and reconnect it.',
            'Connect an account with: dotshare-agent accounts add <id> --platform <platform>',
            'Verify account access with: dotshare-agent doctor --check-accounts',
            ...(roots.length ? [] : ['Local images are disabled. Enable specific directories with: dotshare-agent setup --media-root /absolute/image/directory'])],
    };
}
