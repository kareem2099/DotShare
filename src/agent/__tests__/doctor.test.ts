import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runDoctor, formatDoctor } from '../doctor';
import { runSetup, Installation } from '../setup';
import { AccountStore } from '../accounts';

let directory: string;
let current: Installation;
let file: string;
let store: AccountStore;
let getSecret: jest.Mock;
const probe = jest.fn(async () => ({ success: true, tools: ['list_accounts'], message: 'MCP handshake passed.' }));
const verify = jest.fn(async (_store, account) => ({ id: account.id, platform: account.platform, status: 'pass' as const, identity: 'Public handle', message: 'Identity verified.' }));
const binding = jest.fn();
beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-doctor-'));
    fs.mkdirSync(path.join(directory, 'bin')); fs.mkdirSync(path.join(directory, 'out/agent'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'bin/dotshare-mcp.js'), ''); fs.writeFileSync(path.join(directory, 'out/agent/server.js'), '');
    current = { root: directory, server: path.join(directory, 'bin/dotshare-mcp.js'), node: process.execPath };
    file = path.join(directory, 'config.toml');
    probe.mockClear(); probe.mockResolvedValue({ success: true, tools: ['list_accounts'], message: 'MCP handshake passed.' });
    verify.mockClear(); binding.mockReset();
    const secrets = new Map<string, string>();
    getSecret = jest.fn(key => secrets.get(key));
    store = new AccountStore(path.join(directory, 'accounts'), { get: getSecret, set: (key, value) => { secrets.set(key, value); }, delete: key => { secrets.delete(key); } });
    await runSetup({ config: file }, { installation: current, home: store.home, environment: {}, probe });
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
const context = () => ({ installation: current, accounts: store, environment: {}, probe, checkAccount: verify, keyringBinding: binding });
function add(id = 'personal'): void { store.add({ id, name: 'My account', platform: 'x', credentials: { accessToken: 'private-account-token' } }); getSecret.mockClear(); }

it('checks MCP and configuration without reading credentials or changing files by default', async () => {
    add(); const original = fs.readFileSync(file, 'utf8');
    const result = await runDoctor({ config: file }, context());
    expect(result.success).toBe(true); expect(result.mcpReady).toBe(true);
    expect(result.accountChecksPerformed).toBe(false);
    expect(getSecret).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled();
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
    expect(JSON.stringify(result)).not.toContain('private-account-token');
    expect(formatDoctor(result)).toContain('MCP ready: yes');
});
it('checks identities only with --check-accounts, and --account selects only one account', async () => {
    add('one'); add('two');
    const result = await runDoctor({ config: file, account: 'two' }, context());
    expect(result.accountChecksPerformed).toBe(true);
    expect(verify).toHaveBeenCalledTimes(1); expect(verify.mock.calls[0][1].id).toBe('two');
    expect(result.accounts[0].identity).toBe('Public handle');
});
it('does not read any account if a requested account is missing', async () => {
    add('one');
    const result = await runDoctor({ config: file, account: 'missing' }, context());
    expect(result.success).toBe(false); expect(verify).not.toHaveBeenCalled(); expect(getSecret).not.toHaveBeenCalled();
});
it('reports zero accounts and disabled images as actionable warnings rather than a broken MCP server', async () => {
    const result = await runDoctor({ config: file }, context());
    expect(result.success).toBe(true); expect(result.mcpReady).toBe(true);
    expect(result.checks.find(check => check.id === 'accounts')?.status).toBe('warn');
    expect(result.checks.find(check => check.id === 'media-roots')?.fix).toContain('--media-root');
});
it('does not call skipped connectivity verified', async () => {
    probe.mockClear();
    const result = await runDoctor({ config: file, skipMcp: true }, context());
    expect(result.mcpReady).toBeNull(); expect(probe).not.toHaveBeenCalled();
    expect(formatDoctor(result)).toContain('MCP ready: not tested');
});
it('reports handshake failure with repair instructions', async () => {
    probe.mockResolvedValueOnce({ success: false, tools: [], message: 'MCP handshake failed.' });
    const result = await runDoctor({ config: file }, context());
    expect(result.success).toBe(false); expect(result.mcpReady).toBe(false);
    expect(result.checks.find(check => check.id === 'mcp')?.fix).toContain('Build/reinstall');
});
it('detects a missing build before attempting the handshake', async () => {
    fs.unlinkSync(path.join(directory, 'out/agent/server.js')); probe.mockClear();
    const result = await runDoctor({ config: file }, context());
    expect(result.success).toBe(false); expect(probe).not.toHaveBeenCalled();
    expect(result.checks.find(check => check.id === 'bundle')?.fix).toContain('npm run compile');
});
it('distinguishes a disabled/missing client configuration from a healthy standalone server', async () => {
    fs.appendFileSync(file, '\n');
    // Generic client is explicitly not inspected; the standalone handshake still works.
    const generic = await runDoctor({ client: 'generic' }, context());
    expect(generic.mcpReady).toBe(true);
    fs.writeFileSync(file, '[mcp_servers.dotshare]\nenabled=false\ncommand=' + JSON.stringify(current.node) + '\nargs=[' + JSON.stringify(current.server) + ']\n');
    const disabled = await runDoctor({ config: file }, context());
    expect(disabled.mcpReady).toBe(false);
    expect(disabled.checks.find(check => check.id === 'client-config')?.message).toContain('disabled');
    fs.unlinkSync(file);
    const missing = await runDoctor({ config: file }, context());
    expect(missing.mcpReady).toBe(false);
});
it('keeps bad image-root configuration from being reported as usable', async () => {
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('DOTSHARE_MEDIA_ROOTS = ""', 'DOTSHARE_MEDIA_ROOTS = "relative"'));
    const result = await runDoctor({ config: file }, context());
    expect(result.checks.find(check => check.id === 'media-roots')?.status).toBe('warn');
});
it('reports invalid client syntax and missing native bindings without leaking raw errors', async () => {
    binding.mockImplementation(() => { throw new Error('private-native-error'); });
    fs.writeFileSync(file, 'token="private-invalid-token\n');
    const result = await runDoctor({ config: file }, context());
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/private-native-error|private-invalid-token/);
    expect(result.checks.find(check => check.id === 'keyring-binding')?.status).toBe('fail');
});
it('marks failed account checks as failures without changing client settings', async () => {
    add(); const original = fs.readFileSync(file, 'utf8');
    verify.mockResolvedValueOnce({ id: 'personal', platform: 'x', status: 'fail', message: 'Authentication rejected.' });
    const result = await runDoctor({ config: file, checkAccounts: true }, context());
    expect(result.success).toBe(false); expect(result.accounts[0].status).toBe('fail');
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
});
it('does not report malformed client timeout settings as a ready connection', async () => {
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('tool_timeout_sec = 600', 'tool_timeout_sec = "private-invalid-timeout"'));
    const result = await runDoctor({ config: file }, context());
    expect(result.mcpReady).toBe(false);
    expect(JSON.stringify(result)).not.toContain('private-invalid-timeout');
});
