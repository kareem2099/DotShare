import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse } from 'smol-toml';
import { AGENT_TOOL_NAMES } from '../tool-names';
import { runSetup, supportedNode, readClientConfig, Installation } from '../setup';

let directory: string;
let root: string;
let file: string;
let current: Installation;
const probe = jest.fn(async () => ({ success: true, tools: [...AGENT_TOOL_NAMES], message: 'Verified' }));
beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-setup-'));
    root = path.join(directory, 'Project with spaces العربية');
    fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(root, 'bin/dotshare-mcp.js'), '');
    current = { root, node: process.execPath, server: path.join(root, 'bin/dotshare-mcp.js') };
    file = path.join(directory, 'codex', 'config.toml');
    probe.mockClear(); probe.mockResolvedValue({ success: true, tools: [...AGENT_TOOL_NAMES], message: 'Verified' });
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
const context = () => ({ installation: current, home: path.join(directory, 'accounts'), environment: {}, probe });
function existing(value: string): void { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
function entry(): Record<string, unknown> { return readClientConfig(file).entry!; }

it('writes a portable, private Codex config and leaves images disabled unless explicitly enabled', async () => {
    const result = await runSetup({ config: file }, context());
    expect(result.changed).toBe(true);
    expect(result.tools).toBe(AGENT_TOOL_NAMES.length);
    expect(entry()).toMatchObject({ command: process.execPath, args: [current.server], cwd: root, env: { DOTSHARE_MEDIA_ROOTS: '', DOTSHARE_HOME: path.join(directory, 'accounts') } });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(probe).toHaveBeenCalledTimes(1);
});
it('is idempotent: repeated setup does not rewrite settings or create another backup', async () => {
    await runSetup({ config: file }, context());
    const contents = fs.readFileSync(file, 'utf8');
    const before = fs.readdirSync(path.dirname(file));
    expect((await runSetup({ config: file }, context())).changed).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe(contents);
    expect(fs.readdirSync(path.dirname(file))).toEqual(before);
});
it('preserves unrelated settings, comments, tool policies, environment and a private exact backup', async () => {
    const original = `# Keep this comment\nmodel = "chosen-model"\n\n[mcp_servers.other]\ncommand = "other-server"\nenv.TOKEN = "private-other-token"\n\n[mcp_servers.dotshare]\ncommand = ${JSON.stringify(current.node)}\nargs = [${JSON.stringify(current.server)}]\ncwd = ${JSON.stringify(root)}\ndisabled_tools = ["publish_post"]\ntool_timeout_sec = 120\nenv_vars = ["CUSTOM_VAR", {name="REMOTE_NAME", source="remote"}]\n\n[mcp_servers.dotshare.env]\nPRIVATE_TOKEN = "private-inherited-token"\n\n[projects.example]\ntrust_level = "trusted"\n`;
    existing(original);
    const result = await runSetup({ config: file, mediaRoot: [root] }, context());
    const updated = fs.readFileSync(file, 'utf8');
    expect(updated).toContain('# Keep this comment');
    expect(updated).toContain('[mcp_servers.other]\ncommand = "other-server"\nenv.TOKEN = "private-other-token"');
    expect(updated).toContain('[projects.example]\ntrust_level = "trusted"');
    expect(entry()).toMatchObject({ disabled_tools: ['publish_post'], tool_timeout_sec: 120, env: { PRIVATE_TOKEN: 'private-inherited-token' } });
    expect(JSON.stringify(result)).not.toMatch(/private-other-token|private-inherited-token/);
    expect(fs.readFileSync(result.backupPath!, 'utf8')).toBe(original);
    expect(fs.statSync(result.backupPath!).mode & 0o777).toBe(0o600);
    expect(probe.mock.calls[0][0].env.PRIVATE_TOKEN).toBe('private-inherited-token');
});
it('does not mistake table-looking lines in multiline strings for real tables', async () => {
    const original = `notice = '''\n[mcp_servers.dotshare]\nkeep this entire string\n'''\n# Keep the rest\n[mcp_servers.other]\ncommand = "other"\n`;
    existing(original);
    await runSetup({ config: file }, context());
    const updated = fs.readFileSync(file, 'utf8');
    expect(updated).toContain(original.trimEnd());
    expect(parse(updated).notice).toBe(parse(original).notice);
});
it('handles quoted table names and nested DotShare tables without altering another server', async () => {
    existing(`[mcp_servers."dotshare"]\ncommand = ${JSON.stringify(current.node)}\nargs = [${JSON.stringify(current.server)}]\n[mcp_servers."dotshare".tools.publish_post]\napproval_mode = "prompt"\n[mcp_servers.another]\ncommand = "preserve"\n`);
    await runSetup({ config: file }, context());
    expect(entry()).toMatchObject({ tools: { publish_post: { approval_mode: 'prompt' } } });
    expect(fs.readFileSync(file, 'utf8')).toContain('[mcp_servers.another]\ncommand = "preserve"');
});
it('dry-run verifies the server and produces a snippet without writing anything', async () => {
    existing('# original\nmodel="chosen"\n'); const original = fs.readFileSync(file, 'utf8');
    const result = await runSetup({ config: file, dryRun: true }, context());
    expect(result.dryRun).toBe(true); expect(result.changed).toBe(false);
    expect(result.snippet).toContain('[mcp_servers.dotshare]');
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['config.toml']);
});
it('generic setup produces a standard snippet without modifying a client config', async () => {
    const result = await runSetup({ client: 'generic', mediaRoot: [root] }, context());
    expect(JSON.parse(result.snippet).mcpServers.dotshare.args).toEqual([current.server]);
    expect(result.changed).toBe(false); expect(fs.existsSync(file)).toBe(false);
});
it('preserves allowed media directories across setup, and supports an explicit text-only reset', async () => {
    await runSetup({ config: file, mediaRoot: [root, root] }, context());
    expect((await runSetup({ config: file }, context())).mediaRoots).toEqual([fs.realpathSync(root)]);
    expect((await runSetup({ config: file, textOnly: true }, context())).mediaRoots).toEqual([]);
    expect((entry().env as Record<string, string>).DOTSHARE_MEDIA_ROOTS).toBe('');
});
it('rejects invalid or relative image roots before writing settings', async () => {
    for (const mediaRoot of [['relative'], [path.join(directory, 'missing')], [current.server]]) {
        await expect(runSetup({ config: file, mediaRoot }, context())).rejects.toThrow();
        expect(fs.existsSync(file)).toBe(false);
    }
    await expect(runSetup({ config: file, textOnly: true, mediaRoot: [root] }, context())).rejects.toThrow('not both');
});
it('refuses to replace another installation or remote entry without --replace', async () => {
    const original = '[mcp_servers.dotshare]\nurl="https://example.com/mcp"\n[mcp_servers.other]\ncommand="preserve"\n';
    existing(original);
    await expect(runSetup({ config: file }, context())).rejects.toThrow('--replace');
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
    await runSetup({ config: file, replace: true }, context());
    expect(entry().url).toBeUndefined();
    expect(fs.readFileSync(file, 'utf8')).toContain('[mcp_servers.other]\ncommand="preserve"');
});
it('fails safely for malformed/inline settings and does not echo parser snippets containing secrets', async () => {
    existing('secret="private-config-value\n');
    await expect(runSetup({ config: file }, context())).rejects.not.toThrow('private-config-value');
    expect(fs.readFileSync(file, 'utf8')).toContain('private-config-value');
    existing(`mcp_servers.dotshare = {command=${JSON.stringify(current.node)}, args=[${JSON.stringify(current.server)}]}\n`);
    await expect(runSetup({ config: file }, context())).rejects.toThrow('inline or dotted');
});
it('does not change configuration when the MCP handshake fails', async () => {
    existing('model="keep"\n');
    probe.mockResolvedValueOnce({ success: false, tools: [], message: 'MCP handshake failed.' });
    await expect(runSetup({ config: file }, context())).rejects.toThrow('handshake failed');
    expect(fs.readFileSync(file, 'utf8')).toBe('model="keep"\n');
});
it('detects concurrent config edits and preserves the newer file', async () => {
    existing('model="before"\n');
    probe.mockImplementationOnce(async () => {
        fs.writeFileSync(file, 'model="newer"\n'); return { success: true, tools: [], message: 'Verified' };
    });
    await expect(runSetup({ config: file }, context())).rejects.toThrow('changed during setup');
    expect(fs.readFileSync(file, 'utf8')).toBe('model="newer"\n');
    expect(fs.readdirSync(path.dirname(file))).toEqual(['config.toml']);
});
it('honors CODEX_HOME and the intended account directory', async () => {
    const configHome = path.join(directory, 'custom-codex');
    const result = await runSetup({}, { ...context(), home: undefined, environment: { CODEX_HOME: configHome, DOTSHARE_HOME: path.join(directory, 'custom-accounts') } });
    expect(result.configPath).toBe(path.join(configHome, 'config.toml'));
    expect(readClientConfig(result.configPath!).entry?.env).toMatchObject({ DOTSHARE_HOME: path.join(directory, 'custom-accounts') });
});
it('checks the supported Node boundary', () => {
    expect(supportedNode('22.11.0')).toBe(false); expect(supportedNode('22.12.0')).toBe(true);
    expect(supportedNode('20.19.0')).toBe(false); expect(supportedNode('24.0.0')).toBe(true);
});
it('does not echo invalid inherited timeout or env_vars values into setup output', async () => {
    for (const invalid of ['tool_timeout_sec="private-misplaced-value"', 'env_vars=[{name="VALID_NAME", token="private-misplaced-value"}]']) {
        const original = `[mcp_servers.dotshare]\ncommand=${JSON.stringify(current.node)}\nargs=[${JSON.stringify(current.server)}]\n${invalid}\n`;
        existing(original);
        await expect(runSetup({ config: file }, context())).rejects.not.toThrow('private-misplaced-value');
        expect(fs.readFileSync(file, 'utf8')).toBe(original);
    }
});

describe('agent skill', () => {
    const SKILL = '---\nname: dotshare\ndescription: Current DotShare skill.\n---\n\n# DotShare\n';
    let userHome: string;
    beforeEach(() => {
        fs.mkdirSync(path.join(root, 'skills/dotshare'), { recursive: true });
        fs.writeFileSync(path.join(root, 'skills/dotshare/SKILL.md'), SKILL);
        userHome = path.join(directory, 'home');
    });
    const run = jest.fn(async () => ({ code: 0, output: '' }));
    const skillContext = (environment: Record<string, string> = {}) => ({ ...context(), userHome, environment, run });
    const installed = (...parts: string[]) => path.join(userHome, ...parts, 'skills/dotshare/SKILL.md');

    it('installs the skill where each client loads it, once', async () => {
        const codexHome = path.join(directory, 'codex-home');
        const codex = await runSetup({ config: file }, skillContext({ CODEX_HOME: codexHome }));
        expect(codex.skill).toMatchObject({ state: 'missing', changed: true, file: path.join(codexHome, 'skills/dotshare/SKILL.md') });
        expect(fs.readFileSync(path.join(codexHome, 'skills/dotshare/SKILL.md'), 'utf8')).toBe(SKILL);
        expect((await runSetup({ config: file }, skillContext({ CODEX_HOME: codexHome }))).skill).toMatchObject({ state: 'current', changed: false });

        expect((await runSetup({ client: 'claude' }, skillContext())).skill?.changed).toBe(true);
        expect(fs.readFileSync(installed('.claude'), 'utf8')).toBe(SKILL);
        expect((await runSetup({ client: 'cursor', config: path.join(directory, 'cursor.json') }, skillContext())).skill?.changed).toBe(true);
        expect(fs.readFileSync(installed('.cursor'), 'utf8')).toBe(SKILL);
        expect(fs.readdirSync(path.dirname(installed('.cursor')))).toEqual(['SKILL.md']);
    });
    it('updates an older DotShare copy but keeps a different skill unless --replace, with a backup', async () => {
        fs.mkdirSync(path.dirname(installed('.claude')), { recursive: true });
        fs.writeFileSync(installed('.claude'), '---\nname: dotshare\ndescription: Old.\n---\n');
        expect((await runSetup({ client: 'claude' }, skillContext())).skill).toMatchObject({ state: 'outdated', changed: true });
        expect(fs.readFileSync(installed('.claude'), 'utf8')).toBe(SKILL);

        const mine = '---\nname: something-else\n---\nMy own notes\n';
        fs.writeFileSync(installed('.claude'), mine);
        const kept = await runSetup({ client: 'claude' }, skillContext());
        expect(kept.skill).toMatchObject({ state: 'foreign', changed: false });
        expect(kept.skill?.message).toContain('--replace');
        expect(fs.readFileSync(installed('.claude'), 'utf8')).toBe(mine);

        const replaced = await runSetup({ client: 'claude', replace: true }, skillContext());
        expect(replaced.skill).toMatchObject({ state: 'foreign', changed: true });
        expect(fs.readFileSync(installed('.claude'), 'utf8')).toBe(SKILL);
        expect(fs.readFileSync(path.join(replaced.skill!.backupPath!, 'SKILL.md'), 'utf8')).toBe(mine);
        // Outside the skills directory, so the client doesn't load the old skill twice.
        expect(replaced.skill!.backupPath!.startsWith(path.join(directory, 'accounts', 'skill-backups'))).toBe(true);
        expect(fs.readdirSync(path.join(userHome, '.claude/skills'))).toEqual(['dotshare']);
    });
    it('writes no skill with --no-skill or --dry-run, and tells generic clients where it is', async () => {
        expect((await runSetup({ client: 'claude', skill: false }, skillContext())).skill).toBeUndefined();
        const dry = await runSetup({ client: 'claude', dryRun: true }, skillContext());
        expect(dry.skill).toMatchObject({ state: 'missing', changed: false });
        expect(dry.skill?.message).toContain('would install');
        expect(fs.existsSync(path.join(userHome, '.claude'))).toBe(false);
        const generic = await runSetup({ client: 'generic' }, skillContext());
        expect(generic.skill).toBeUndefined();
        expect(generic.nextSteps.join('\n')).toContain(path.join(root, 'skills/dotshare'));
    });
    it('connects Antigravity through its mcp_config.json and installs the skill where it loads skills', async () => {
        const config = path.join(directory, 'gemini/config/mcp_config.json');
        fs.mkdirSync(path.dirname(config), { recursive: true });
        fs.writeFileSync(config, JSON.stringify({ mcpServers: { other: { serverUrl: 'https://example.test/mcp' } } }));
        const result = await runSetup({ client: 'antigravity', config }, skillContext());
        expect(result.changed).toBe(true);
        const servers = JSON.parse(fs.readFileSync(config, 'utf8')).mcpServers;
        expect(servers.other).toEqual({ serverUrl: 'https://example.test/mcp' });
        expect(servers.dotshare).toMatchObject({ command: process.execPath, args: [current.server], env: { DOTSHARE_MEDIA_ROOTS: '' } });
        expect(result.skill).toMatchObject({ changed: true, file: installed('.gemini/config') });
        expect(result.nextSteps[0]).toContain('Antigravity');
        expect((await runSetup({ client: 'antigravity', config }, skillContext())).changed).toBe(false);
    });
    it('installs the skill for any agent with --skills-dir, ~ included', async () => {
        const generic = await runSetup({ client: 'generic', skillsDir: '~/.agents/skills' }, skillContext());
        expect(generic.skill).toMatchObject({ changed: true, file: installed('.agents') });
        expect(generic.nextSteps.join('\n')).not.toContain('--skills-dir');
        const custom = path.join(directory, 'my-agent/skills');
        const codex = await runSetup({ config: file, skillsDir: custom }, skillContext({ CODEX_HOME: path.join(directory, 'codex-home') }));
        expect(codex.skill?.file).toBe(path.join(custom, 'dotshare/SKILL.md'));
        expect(fs.existsSync(path.join(directory, 'codex-home/skills'))).toBe(false);
    });
    it('copies the whole skill folder and drops files an older version had', async () => {
        fs.mkdirSync(path.join(root, 'skills/dotshare/references'));
        fs.writeFileSync(path.join(root, 'skills/dotshare/references/writing.md'), '# Writing\n');
        const target = path.dirname(installed('.claude'));
        fs.mkdirSync(path.join(target, 'references'), { recursive: true });
        fs.writeFileSync(installed('.claude'), '---\nname: dotshare\n---\nold\n');
        fs.writeFileSync(path.join(target, 'references/removed.md'), 'gone in the new version');
        expect((await runSetup({ client: 'claude' }, skillContext())).skill).toMatchObject({ state: 'outdated', changed: true });
        expect(fs.readFileSync(path.join(target, 'references/writing.md'), 'utf8')).toBe('# Writing\n');
        expect(fs.existsSync(path.join(target, 'references/removed.md'))).toBe(false);
        expect(fs.readdirSync(path.join(userHome, '.claude/skills'))).toEqual(['dotshare']);
        // A missing reference file makes the copy out of date.
        fs.rmSync(path.join(target, 'references/writing.md'));
        expect((await runSetup({ client: 'claude' }, skillContext())).skill).toMatchObject({ state: 'outdated', changed: true });
        expect((await runSetup({ client: 'claude' }, skillContext())).skill).toMatchObject({ state: 'current', changed: false });
    });
    it('never writes through a symlinked skill', async () => {
        const elsewhere = path.join(directory, 'elsewhere');
        fs.mkdirSync(elsewhere); fs.writeFileSync(path.join(elsewhere, 'SKILL.md'), '---\nname: dotshare\n---\nlinked copy\n');
        fs.mkdirSync(path.join(userHome, '.claude/skills'), { recursive: true });
        fs.symlinkSync(elsewhere, path.join(userHome, '.claude/skills/dotshare'));
        expect((await runSetup({ client: 'claude' }, skillContext())).skill).toMatchObject({ state: 'linked', changed: false });
        expect(fs.readFileSync(path.join(elsewhere, 'SKILL.md'), 'utf8')).toContain('linked copy');
    });
});
