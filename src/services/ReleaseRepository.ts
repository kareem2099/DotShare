import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { ReleaseContextScope } from '../types/dotshare-ai';

const execute = promisify(execFile);
const MAX_FILE_BYTES = 512 * 1024;

/** All release evidence is read at one immutable commit, never from a dirty checkout. */
export class ReleaseRepository {
    public readonly warnings: string[] = [];
    public targetRef = '';
    public targetLabel = 'HEAD';
    public releaseTag?: string;
    public baseRef = '';
    public baseTag?: string;
    public availableTags: string[] = [];
    public dirty = false;
    public changedFiles: string[] = [];
    public initialTree = false;

    private constructor(public readonly root: string, public readonly scope: ReleaseContextScope) {}

    public static async open(root: string, scope: ReleaseContextScope = 'release', releaseTag?: string): Promise<ReleaseRepository | undefined> {
        if (scope !== 'release' && scope !== 'working_tree') throw new Error('Invalid release context scope.');
        const discovery = new ReleaseRepository(root, scope);
        const topLevel = (await discovery.git(['rev-parse', '--show-toplevel'], true)).trim();
        const repo = new ReleaseRepository(topLevel || root, scope);
        const head = (await repo.git(['rev-parse', '--verify', 'HEAD'], true)).trim();
        if (!head) {
            if (releaseTag) throw new Error('A release tag requires a Git repository with commits.');
            return undefined;
        }
        repo.targetRef = head;
        const [tags, status] = await Promise.all([
            repo.git(['for-each-ref', '--sort=-creatordate', '--format=%(refname:strip=2)', 'refs/tags']),
            repo.git(['status', '--porcelain', '--untracked-files=normal'])
        ]);
        repo.availableTags = tags.trim().split('\n').filter(Boolean).slice(0, 100);
        repo.dirty = !!status.trim();
        if (scope === 'release') {
            if (releaseTag && releaseTag !== 'HEAD') {
                if (releaseTag.length > 200 || /[\r\n\0]/.test(releaseTag)) throw new Error('Invalid release tag.');
                repo.targetRef = (await repo.git(['rev-parse', '--verify', '--end-of-options', `refs/tags/${releaseTag}^{commit}`])).trim();
                repo.releaseTag = releaseTag;
            } else {
                repo.releaseTag = (await repo.git(['describe', '--tags', '--exact-match', head], true)).trim() || undefined;
                if (!releaseTag && !repo.releaseTag) {
                    repo.releaseTag = (await repo.git(['describe', '--tags', '--abbrev=0', head], true)).trim() || undefined;
                    if (repo.releaseTag) {
                        repo.targetRef = (await repo.git(['rev-parse', '--verify', '--end-of-options', `refs/tags/${repo.releaseTag}^{commit}`])).trim();
                        repo.warnings.push(`Commits after ${repo.releaseTag} are excluded; choose Current committed work (HEAD) to describe them.`);
                    }
                }
            }
            repo.targetLabel = repo.releaseTag || `HEAD (${head.slice(0, 8)})`;
            const parent = (await repo.git(['rev-parse', '--verify', `${repo.targetRef}^`], true)).trim();
            const previous = (await repo.git(['describe', '--tags', '--abbrev=0', repo.releaseTag ? `${repo.targetRef}^` : repo.targetRef], true)).trim();
            repo.baseTag = previous || undefined;
            repo.baseRef = previous ? (await repo.git(['rev-parse', '--verify', '--end-of-options', `refs/tags/${previous}^{commit}`])).trim() : parent;
            if (!repo.baseRef || (repo.releaseTag && !previous)) {
                repo.initialTree = true;
                // Git recognizes its canonical empty tree in both SHA-1 and SHA-256 repositories.
                const format = (await repo.git(['rev-parse', '--show-object-format'])).trim();
                repo.baseRef = createHash(format === 'sha256' ? 'sha256' : 'sha1').update('tree 0\0').digest('hex');
                repo.warnings.push('No previous release tag; this first release includes the complete committed tree.');
            } else if (!repo.baseTag) {
                repo.warnings.push('No release tags; committed changes are limited to the latest commit.');
            }
            if (repo.dirty) repo.warnings.push('Local changes are excluded from this release article.');
        } else {
            repo.baseRef = head;
            repo.targetLabel = 'Working tree';
            repo.warnings.push('This is an uncommitted update, not a published release. Untracked files are excluded.');
        }
        repo.changedFiles = (await repo.diff(['--name-only', '-z'])).split('\0').filter(Boolean);
        return repo;
    }

    public get commitRange(): string {
        return this.initialTree ? this.targetRef : `${this.baseRef}..${this.targetRef}`;
    }

    public async git(args: string[], optional = false): Promise<string> {
        try {
            const { stdout } = await execute('git', ['-c', 'core.quotePath=false', ...args], {
                cwd: this.root, timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true
            });
            return stdout;
        } catch {
            if (optional) return '';
            // Never include stderr or repository content in error messages.
            throw new Error('Could not read Git release evidence. Check the selected tag and repository.');
        }
    }

    public diff(flags: string[], files: string[] = []): Promise<string> {
        const refs = this.scope === 'working_tree' ? [this.baseRef] : [this.baseRef, this.targetRef];
        return this.git(['diff', '--no-ext-diff', '--no-textconv', ...flags, ...refs, '--', ...files]);
    }

    public async listFiles(): Promise<string[]> {
        const result = this.scope === 'release'
            ? await this.git(['ls-tree', '-r', '--name-only', '-z', this.targetRef])
            : await this.git(['ls-files', '-z']);
        return result.split('\0').filter(Boolean);
    }

    public async readFile(file: string, ref?: string): Promise<string> {
        if (!file || path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) return '';
        const revision = ref || (this.scope === 'release' ? this.targetRef : undefined);
        if (revision) {
            // Only immutable revisions resolved by this repository are accepted.
            if (!/^[a-f0-9]{40,64}$/.test(revision)) return '';
            const entry = await this.git(['ls-tree', revision, '--', file], true);
            if (!entry.startsWith('100')) return ''; // Exclude symlinks and submodules.
            const size = Number((await this.git(['cat-file', '-s', `${revision}:${file}`], true)).trim());
            if (!Number.isFinite(size) || size > MAX_FILE_BYTES) return '';
            return this.git(['show', `${revision}:${file}`], true);
        }
        try {
            const realRoot = await fs.realpath(this.root);
            const realFile = await fs.realpath(path.join(this.root, file));
            const relative = path.relative(realRoot, realFile);
            if (relative.startsWith('..') || path.isAbsolute(relative)) return '';
            if ((await fs.stat(realFile)).size > MAX_FILE_BYTES) return '';
            return await fs.readFile(realFile, 'utf8');
        } catch { return ''; }
    }
}
