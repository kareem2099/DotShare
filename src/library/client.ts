import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse } from 'smol-toml';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import { LIBRARY_TOOLS, LibraryTool, LibraryConnection, ToolOutput, LibrarySnapshot } from './contracts';

interface Launch { command: string; args: string[]; cwd: string; env: Record<string, string>; home: string; config: string; timeout: number; startup: number; allowed: LibraryTool[]; }
function object(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function names(value: unknown): string[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some(name => typeof name !== 'string')) throw new Error('Invalid tool policy in the DotShare MCP configuration.');
    return value;
}
function seconds(value: unknown, fallback: number): number {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 3600) throw new Error('Invalid DotShare MCP timeout.');
    return value * 1000;
}
export function readLibraryLaunch(file?: string, environment: NodeJS.ProcessEnv = process.env): Launch {
    const config = path.resolve(file || path.join(environment.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml'));
    let entry: Record<string, unknown> | undefined;
    try {
        if (fs.statSync(config).size > 1024 * 1024) throw new Error();
        entry = object(object(parse(fs.readFileSync(config, 'utf8'), { unsafeKeyBehaviour: 'throw' }).mcp_servers)?.dotshare);
    } catch { throw new Error('Cannot read the DotShare MCP configuration. Run dotshare-agent setup, or choose its config file in DotShare Library settings.'); }
    if (!entry) throw new Error('DotShare is not configured. Run dotshare-agent setup, then reconnect the library.');
    if (entry.enabled === false || entry.disabled === true) throw new Error('DotShare is disabled in the MCP configuration.');
    if (entry.url || typeof entry.command !== 'string' || !path.isAbsolute(entry.command)
        || !Array.isArray(entry.args) || entry.args.length !== 1 || typeof entry.args[0] !== 'string'
        || !path.isAbsolute(entry.args[0]) || path.basename(entry.args[0]) !== 'dotshare-mcp.js') {
        throw new Error('The library needs a local DotShare installation with absolute launcher paths. Run dotshare-agent setup.');
    }
    const cwd = typeof entry.cwd === 'string' ? entry.cwd : path.dirname(path.dirname(entry.args[0]));
    if (!path.isAbsolute(cwd) || !fs.existsSync(entry.command) || !fs.existsSync(entry.args[0]) || !fs.statSync(cwd).isDirectory()) throw new Error('The configured DotShare installation is missing. Run setup from the current installation.');
    const env = { ...getDefaultEnvironment() };
    if (entry.env_vars !== undefined) {
        if (!Array.isArray(entry.env_vars)) throw new Error('Invalid env_vars in the DotShare MCP configuration.');
        for (const item of entry.env_vars) {
            const name = typeof item === 'string' ? item : object(item)?.name;
            if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid forwarded environment variable.');
            if (environment[name] !== undefined) env[name] = environment[name]!;
        }
    }
    const configured = entry.env === undefined ? {} : object(entry.env);
    if (!configured) throw new Error('DotShare MCP env must be a table.');
    for (const [name, value] of Object.entries(configured)) {
        if (typeof value !== 'string') throw new Error('DotShare MCP environment values must be strings.');
        env[name] = value;
    }
    // An unset media allowlist stays unset; opening the UI must never broaden access.
    const home = path.resolve(cwd, env.DOTSHARE_HOME || path.join(env.HOME || env.USERPROFILE || os.homedir(), '.dotshare'));
    const enabled = names(entry.enabled_tools); const disabled = names(entry.disabled_tools) || [];
    const tools = object(entry.tools) || {};
    const allowed = LIBRARY_TOOLS.filter(name => (!enabled || enabled.includes(name)) && !disabled.includes(name) && object(tools[name])?.enabled !== false);
    return { command: entry.command, args: entry.args as string[], cwd, env, home, config,
        timeout: seconds(entry.tool_timeout_sec, 600000), startup: seconds(entry.startup_timeout_sec, 20000), allowed };
}

/** Uses the configured Node/MCP installation, never Electron's ABI or a second credential store. */
export class LibraryClient {
    private client?: Client;
    private transport?: StdioClientTransport;
    private connecting?: Promise<LibraryConnection>;
    private connection?: LibraryConnection;
    private launch?: Launch;
    private disposed = false;
    private watchers: fs.FSWatcher[] = [];
    private timer?: ReturnType<typeof setTimeout>;
    constructor(private readonly configFile?: string, private readonly changed: () => void = () => undefined) {}
    async connect(): Promise<LibraryConnection> {
        if (this.disposed) throw new Error('Library connection is closed. Reconnect the library.');
        if (this.connection) return this.connection;
        if (!this.connecting) this.connecting = this.start().finally(() => { this.connecting = undefined; });
        return this.connecting;
    }
    private async start(): Promise<LibraryConnection> {
        const launch = readLibraryLaunch(this.configFile);
        const client = new Client({ name: 'dotshare-vscode-library', version: '3.8.1' });
        const transport = new StdioClientTransport({ ...launch, stderr: 'pipe', maxBufferSize: 16 * 1024 * 1024 });
        // Never forward subprocess diagnostics or configuration/credential values to the webview.
        transport.stderr?.on('data', () => undefined);
        this.client = client; this.transport = transport; this.launch = launch;
        try {
            await client.connect(transport, { timeout: launch.startup });
            const listing = await client.listTools({}, { timeout: launch.startup });
            const available = listing.tools.map(tool => tool.name);
            if (client.getServerVersion()?.name !== 'dotshare' || LIBRARY_TOOLS.some(name => !available.includes(name))) throw new Error();
            if (this.disposed) throw new Error();
            this.connection = { home: launch.home, config: launch.config, tools: launch.allowed };
            this.watch(); return this.connection;
        } catch {
            await client.close().catch(() => undefined); await transport.close().catch(() => undefined);
            this.client = undefined; this.transport = undefined;
            throw new Error('Could not connect to the current DotShare library. Rebuild/update the CLI installation, run doctor, then reconnect.');
        }
    }
    async call<T = unknown>(name: LibraryTool, args: Record<string, unknown> = {}): Promise<ToolOutput<T>> {
        if (!(LIBRARY_TOOLS as readonly string[]).includes(name)) throw new Error('This action is not available in the publishing library.');
        const connection = await this.connect();
        if (!connection.tools.includes(name)) throw new Error('This tool is disabled in your DotShare MCP configuration.');
        if (Buffer.byteLength(JSON.stringify(args)) > 2 * 1024 * 1024) throw new Error('Library request exceeds 2 MiB.');
        let result;
        try { result = await this.client!.callTool({ name, arguments: args }, { timeout: this.launch!.timeout }); }
        catch { throw new Error('The library connection was interrupted. Reconnect and inspect the saved draft outcome before publishing again. Do not create a new publication request.'); }
        const output = object(result.structuredContent);
        if (!output || typeof output.success !== 'boolean') throw new Error('DotShare returned an unsupported response. Update the CLI installation.');
        return output as unknown as ToolOutput<T>;
    }
    async snapshot(): Promise<LibrarySnapshot> {
        const connection = await this.connect();
        const [accounts, drafts, templates] = await Promise.all([
            this.call<{ accounts: LibrarySnapshot['accounts'] }>('list_accounts'),
            this.call<{ drafts: LibrarySnapshot['drafts'] }>('list_drafts', { limit: 100 }),
            this.call<{ templates: LibrarySnapshot['templates'] }>('list_templates', { limit: 100 }),
        ]);
        if (!accounts.success || !drafts.success || !templates.success) throw new Error(accounts.error || drafts.error || templates.error || 'Could not refresh the library.');
        return { connection, accounts: accounts.data!.accounts, drafts: drafts.data!.drafts, templates: templates.data!.templates };
    }
    private watch(): void {
        this.watchers.forEach(watcher => watcher.close()); this.watchers = [];
        const home = this.launch!.home;
        const directories = [home, path.join(home, 'drafts'), path.join(home, 'templates'), path.join(home, 'operations')];
        if (!fs.existsSync(home)) { let parent = path.dirname(home); while (!fs.existsSync(parent) && path.dirname(parent) !== parent) parent = path.dirname(parent); directories.push(parent); }
        for (const directory of directories) {
            try {
                const watcher = fs.watch(directory, () => {
                    if (this.timer) clearTimeout(this.timer);
                    this.timer = setTimeout(() => { if (!this.disposed) { this.watch(); this.changed(); } }, 200);
                });
                watcher.on('error', () => this.changed()); this.watchers.push(watcher);
            } catch { /* Directory not created yet. Manual refresh/reveal is always available. */ }
        }
    }
    async dispose(): Promise<void> {
        this.disposed = true; if (this.timer) clearTimeout(this.timer);
        this.watchers.forEach(watcher => watcher.close()); this.watchers = [];
        await this.client?.close().catch(() => undefined); await this.transport?.close().catch(() => undefined);
    }
}
