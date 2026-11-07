import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { stringify } from 'smol-toml';
import { LibraryClient, readLibraryLaunch } from '../client';
import { LIBRARY_TOOLS, LibraryTool } from '../contracts';

const mockConnect = jest.fn(async () => undefined);
const mockClose = jest.fn(async () => undefined);
const mockTransportClose = jest.fn(async () => undefined);
const mockList = jest.fn(async () => ({ tools: LIBRARY_TOOLS.map(name => ({ name })) }));
const mockCall = jest.fn(async ({ name }: { name: string }) => ({ structuredContent: { success: true, data: name === 'list_accounts' ? { accounts: [] } : name === 'list_drafts' ? { drafts: [] } : { templates: [] } } }));
jest.mock('@modelcontextprotocol/client', () => ({ Client: jest.fn().mockImplementation(() => ({ connect: mockConnect, close: mockClose, listTools: mockList, callTool: mockCall, getServerVersion: () => ({ name: 'dotshare' }) })) }));
jest.mock('@modelcontextprotocol/client/stdio', () => ({ StdioClientTransport: jest.fn().mockImplementation(() => ({ close: mockTransportClose, stderr: { on: jest.fn() } })), getDefaultEnvironment: () => ({ PATH: '/usr/bin' }) }));

let directory: string;
let config: string;
let home: string;
let server: string;
let client: LibraryClient | undefined;
beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-library-test-'));
    home = path.join(directory, 'shared-home'); fs.mkdirSync(home);
    server = path.join(directory, 'bin/dotshare-mcp.js'); fs.mkdirSync(path.dirname(server)); fs.writeFileSync(server, '');
    config = path.join(directory, 'config.toml');
    write();
    mockConnect.mockClear(); mockClose.mockClear(); mockTransportClose.mockClear(); mockCall.mockClear();
    mockList.mockReset(); mockList.mockResolvedValue({ tools: LIBRARY_TOOLS.map(name => ({ name })) });
});
afterEach(async () => { await client?.dispose(); client = undefined; fs.rmSync(directory, { recursive: true, force: true }); });
function write(extra: Record<string, unknown> = {}): void {
    fs.writeFileSync(config, stringify({ mcp_servers: { dotshare: { command: process.execPath, args: [server], cwd: directory,
        env_vars: ['DBUS_SESSION_BUS_ADDRESS', { name: 'XDG_RUNTIME_DIR', source: 'local' }], env: { DOTSHARE_HOME: home, DOTSHARE_MEDIA_ROOTS: directory }, ...extra } } }));
}
it('uses the exact configured installation, home, media roots and forwarded desktop session', () => {
    const launch = readLibraryLaunch(config, { DBUS_SESSION_BUS_ADDRESS: 'session-bus', XDG_RUNTIME_DIR: '/run/user/test', UNFORWARDED_SECRET: 'never-forward' });
    expect(launch).toMatchObject({ command: process.execPath, args: [server], cwd: directory, home, timeout: 600000, startup: 20000 });
    expect(launch.env).toEqual({ PATH: '/usr/bin', DOTSHARE_HOME: home, DOTSHARE_MEDIA_ROOTS: directory, DBUS_SESSION_BUS_ADDRESS: 'session-bus', XDG_RUNTIME_DIR: '/run/user/test' });
    expect(fs.readFileSync(config, 'utf8')).not.toContain('session-bus');
});
it('keeps image access disabled when no explicit roots are configured', () => {
    write({ env: { DOTSHARE_HOME: home } });
    expect(readLibraryLaunch(config).env).not.toHaveProperty('DOTSHARE_MEDIA_ROOTS');
});
it('honors disabled/enabled tools rather than bypassing the client policy', async () => {
    write({ disabled_tools: ['publish_draft'], tools: { delete_template: { enabled: false } } });
    client = new LibraryClient(config); const connection = await client.connect();
    expect(connection.tools).not.toContain('publish_draft'); expect(connection.tools).not.toContain('delete_template');
    await expect(client.call('publish_draft', {})).rejects.toThrow('disabled'); expect(mockCall).not.toHaveBeenCalled();
    write({ enabled_tools: ['get_draft'] }); expect(readLibraryLaunch(config).allowed).toEqual(['get_draft']);
});
it('shares one handshake for concurrent requests and never returns launcher secrets to the view', async () => {
    write({ env: { DOTSHARE_HOME: home, PRIVATE_TOKEN: 'sensitive-launcher-token' } });
    client = new LibraryClient(config);
    const [first, second] = await Promise.all([client.connect(), client.connect()]);
    expect(first).toEqual(second); expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first)).not.toContain('sensitive-launcher-token'); expect(first).not.toHaveProperty('env');
    await client.snapshot(); expect(mockCall.mock.calls.map(call => call[0].name)).toEqual(['list_accounts', 'list_drafts', 'list_templates']);
});
it('passes exact revision/preview/request IDs through without retrying a publication', async () => {
    client = new LibraryClient(config);
    const args = { draftId: 'saved-id', expectedRevision: 4, previewId: 'reviewed-id', requestId: 'stable-publication-id' };
    await client.call('publish_draft', args); expect(mockCall).toHaveBeenCalledWith({ name: 'publish_draft', arguments: args }, { timeout: 600000 });
    mockCall.mockRejectedValueOnce(new Error('sensitive-launcher-token'));
    await expect(client.call('publish_draft', args)).rejects.toThrow('inspect the saved draft outcome');
    expect(mockCall).toHaveBeenCalledTimes(2);
});
it('limits webview actions and payload size before making tool calls', async () => {
    client = new LibraryClient(config);
    await expect(client.call('publish_post' as LibraryTool, {})).rejects.toThrow('not available');
    await expect(client.call('save_template', { text: 'x'.repeat(2 * 1024 * 1024) })).rejects.toThrow('2 MiB');
    expect(mockCall).not.toHaveBeenCalled();
});
it('keeps failed preview data available instead of presenting it as success or losing validation errors', async () => {
    client = new LibraryClient(config);
    mockCall.mockResolvedValueOnce({ structuredContent: { success: false, data: { drafts: [] } } });
    const result = await client.call('preview_draft', {}); expect(result.success).toBe(false); expect(result.data).toEqual({ drafts: [] });
});
it('rejects old servers without the complete shared workflow', async () => {
    mockList.mockResolvedValueOnce({ tools: [{ name: 'list_accounts' }] });
    client = new LibraryClient(config); await expect(client.connect()).rejects.toThrow('Rebuild/update');
    expect(mockClose).toHaveBeenCalled(); expect(mockTransportClose).toHaveBeenCalled();
});
it.each([{ command: 'node' }, { url: 'https://example.com/mcp' }, { args: ['relative-server.js'] }, { enabled: false }, { env: { DOTSHARE_HOME: 123 } }, { tool_timeout_sec: -1 }, { disabled_tools: [123] }])('rejects unsafe or incompatible launcher configuration: %j', extra => {
    write(extra); expect(() => readLibraryLaunch(config)).toThrow();
});
it('fails clearly for missing or invalid config without changing it', () => {
    fs.writeFileSync(config, 'invalid = ['); expect(() => readLibraryLaunch(config)).toThrow('Cannot read'); expect(fs.readFileSync(config, 'utf8')).toBe('invalid = [');
    expect(() => readLibraryLaunch(path.join(directory, 'missing'))).toThrow('Cannot read');
});
it('watches newly created draft/template stores and closes the connection on disposal', async () => {
    const changed = new Promise<void>(resolve => { client = new LibraryClient(config, resolve); });
    await client!.connect(); fs.mkdirSync(path.join(home, 'drafts'));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([changed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('No shared-library change notification')), 2000); })]); }
    finally { if (timer) clearTimeout(timer); }
    await client!.dispose(); await expect(client!.connect()).rejects.toThrow('closed'); expect(mockClose).toHaveBeenCalled();
});
