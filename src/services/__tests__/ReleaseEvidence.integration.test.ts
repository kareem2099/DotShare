import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { ProjectContextService as Context } from '../ProjectContextService';
import { ReleaseRepository } from '../ReleaseRepository';

let root: string;
function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function write(file: string, content: string): void {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
}
function commit(message: string): void { git('add', '.'); git('commit', '-m', message); }

beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'dotshare-evidence-'));
    git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
    write('README.md', '# Example\nA Python fixture. Rust and React are discussed as alternatives, not used.');
    write('pyproject.toml', '[project]\nname = "Example"\ndescription = "Fixture"\ndependencies = ["PyQt6>=6"]');
    write('core/vault.py', '# Header\n\ndef recognize(value):\n    return False\n');
    write('CHANGELOG.md', '## [1.0.0]\n- Initial version.');
    commit('Initial release'); git('tag', 'v1.0.0');
    write('core/vault.py', '# Header\n\ndef recognize(value):\n    digest = keyed_digest(value)\n    return digest in cached_digests\n');
    write('tests/test_vault.py', '# A larger test file should not outrank implementation.\n' + 'assert True\n'.repeat(150));
    write('CHANGELOG.md', '## [1.1.0]\n### Fixed\n- Recognize stored Vault values\n  after auto-lock without retaining the encryption key.\n' + Array.from({length: 20}, (_, i) => `- Fix ${i}.\n`).join('') + '\n## [1.0.0]\n- Initial version.');
    write('docs/releases/1.1.0.md', '# 1.1.0\n\n## Verification\n- 589 passed.\n\n## Remaining checks\nManual desktop checks are still required.');
    write('ROADMAP.md', '# Plan\nVault will use a future cloud service.');
    commit('Harden Vault recognition'); git('tag', '-a', 'v1.1.0', '-m', 'Release 1.1.0');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('keeps tag-to-tag evidence, commits and complete changelog despite staged and unstaged edits', async () => {
    write('roadmap.md', 'Untracked local plan');
    write('core/vault.py', 'LOCAL_SECRET_IMPLEMENTATION'); git('add', 'core/vault.py');
    write('CHANGELOG.md', '## [9.9.9]\n- Unpublished feature.');
    const context = await Context.buildContext(root);
    expect(context.version).toBe('1.1.0');
    expect(context.gitDirty).toBe(true);
    expect(context.gitBaseTag).toBe('v1.0.0');
    expect(context.gitDiffSummary).toContain('core/vault.py');
    expect(context.recentCommits).toEqual(['• Harden Vault recognition']);
    expect(context.changelogNotes).toContain('Recognize stored Vault values after auto-lock without retaining the encryption key.');
    expect(context.changelogNotes).toContain('Fix 19.');
    expect(context.relevantCodeSnippets?.[0].code).toContain('keyed_digest(value)');
    expect(JSON.stringify(context)).not.toContain('LOCAL_SECRET_IMPLEMENTATION');
    expect(JSON.stringify(context)).not.toContain('Unpublished feature');
    expect(context.techStack).toContain('PyQt6');
    expect(context.techStack).not.toContain('Rust');
    expect(context.techStack).not.toContain('React');
    expect(context.releaseDocuments?.[0].content).toContain('589 passed');
    expect(context.releaseDocuments?.[0].content).toContain('Manual desktop checks');
    expect(context.releaseDocuments?.some(doc => /roadmap/i.test(doc.file))).toBe(false);
});

it('reads an explicitly selected old tag even after new commits and edited manifests', async () => {
    write('pyproject.toml', '[project]\nname = "WrongFutureName"');
    write('core/vault.py', 'future_behavior()'); commit('Unreleased future changes');
    const context = await Context.buildContext(root, { releaseTag: 'v1.1.0' });
    expect(context.projectName).toBe('Example');
    expect(context.version).toBe('1.1.0');
    expect(context.recentCommits).not.toContain('• Unreleased future changes');
    expect(context.relevantCodeSnippets?.[0].code).not.toContain('future_behavior');
});

it('uses the working-tree diff only when explicitly requested', async () => {
    write('core/vault.py', 'def new_local_behavior():\n    return 42\n');
    const context = await Context.buildContext(root, { scope: 'working_tree' });
    expect(context.scope).toBe('working_tree');
    expect(context.recentCommits).toEqual([]);
    expect(context.relevantCodeSnippets?.[0].code).toContain('new_local_behavior');
    expect(context.contextWarnings?.join(' ')).toContain('Untracked files are excluded');
});

it('extracts real source with verifiable line ranges and excludes Python tests', async () => {
    const context = await Context.buildContext(root);
    const snippets = context.relevantCodeSnippets!;
    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets.every(snippet => !snippet.file.startsWith('tests/'))).toBe(true);
    expect(snippets[0].startLine).toBeGreaterThan(0);
    expect(snippets[0].code).not.toContain('@@');
    expect(snippets[0].code).not.toContain('+    return');
    expect(snippets[0].language).toBe('python');
});

it('supports an initial tagged tree and a repository opened from a subfolder', async () => {
    const context = await Context.buildContext(path.join(root, 'core'), { releaseTag: 'v1.0.0' });
    expect(context.gitDiffSummary).toContain('README.md');
    expect(context.projectName).toBe('Example');
    expect(context.version).toBe('1.0.0');
    expect(context.gitCommitCount).toBe(1);
});

it('does not include older commits when no tags exist', async () => {
    git('tag', '-d', 'v1.0.0', 'v1.1.0');
    const context = await Context.buildContext(root);
    expect(context.recentCommits).toEqual(['• Harden Vault recognition']);
    expect(context.gitCommitCount).toBe(1);
});

it('respects source opt-outs, even with a custom topic', async () => {
    const context = await Context.buildContext(root, { sources: ['readme'], topicQuery: 'Vault' });
    expect(context.changelogNotes).toEqual([]);
    expect(context.recentCommits).toEqual([]);
    expect(context.relevantCommits).toEqual([]);
    expect(context.relevantCodeSnippets).toEqual([]);
    expect(context.releaseDocuments).toEqual([]);
});

it('rejects invalid tags instead of silently switching evidence to HEAD', async () => {
    await expect(Context.buildContext(root, { releaseTag: 'missing-tag' })).rejects.toThrow('Git release evidence');
});

it('keeps reads pinned when HEAD changes after snapshot resolution', async () => {
    const repo = (await ReleaseRepository.open(root))!;
    write('core/vault.py', 'moved_head()'); commit('Move HEAD');
    expect(await repo.readFile('core/vault.py')).toContain('keyed_digest(value)');
    expect(await repo.diff(['--name-only'])).not.toContain('README.md');
});

it('defaults to the latest tagged release and allows HEAD work without reusing old changelog notes', async () => {
    write('core/vault.py', 'def next_release_behavior():\n    return 43\n'); commit('Future committed work');
    const released = await Context.buildContext(root);
    expect(released.releaseTag).toBe('v1.1.0');
    expect(released.recentCommits).not.toContain('• Future committed work');
    const head = await Context.buildContext(root, { releaseTag: 'HEAD' });
    expect(head.recentCommits).toEqual(['• Future committed work']);
    expect(head.changelogNotes).toEqual([]);
    expect(head.version).toBeUndefined();
});

it('reads linked worktrees with a .git file', async () => {
    const checkout = path.join(root, 'linked-checkout');
    git('worktree', 'add', '--detach', checkout, 'v1.1.0');
    const context = await Context.buildContext(checkout);
    expect(context.version).toBe('1.1.0');
    expect(context.relevantCodeSnippets?.[0].code).toContain('keyed_digest');
});

it('excludes unchanged released notes from a local working-tree update', async () => {
    write('core/vault.py', 'def local_only():\n    return 7\n');
    const context = await Context.buildContext(root, { scope: 'working_tree' });
    expect(context.changelogNotes).toEqual([]);
    expect(context.version).toBeUndefined();
});
