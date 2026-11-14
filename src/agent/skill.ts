import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { Installation, SetupClient } from './setup';

/**
 * The DotShare agent skill (skills/dotshare: SKILL.md plus its references) teaches an
 * agent to write posts and follow the draft → preview → approval → publish workflow.
 * Clients only load skills from their own skills directory, so setup copies the
 * folder there and doctor checks the copy.
 */
export const SKILL_NAME = 'dotshare';

/** The skill folder shipped with this installation, or undefined in a build without it. */
export function skillSource(current: Installation): string | undefined {
    const directory = path.join(current.root, 'skills', SKILL_NAME);
    return fs.existsSync(path.join(directory, 'SKILL.md')) ? directory : undefined;
}

/**
 * Where the skill goes: `skillsDir/dotshare` when given (any agent that reads
 * SKILL.md skills), otherwise where each client loads personal skills from. The
 * generic client has no known directory.
 */
export function skillDirectory(client: SetupClient, environment: Record<string, string | undefined> = process.env, home = os.homedir(), skillsDir?: string): string | undefined {
    if (skillsDir) return path.join(path.resolve(skillsDir.replace(/^~(?=$|[\\/])/, home)), SKILL_NAME);
    const base = client === 'claude' ? environment.CLAUDE_CONFIG_DIR || path.join(home, '.claude')
        : client === 'codex' ? environment.CODEX_HOME || path.join(home, '.codex')
            : client === 'cursor' ? path.join(home, '.cursor')
                : client === 'antigravity' ? path.join(home, '.gemini', 'config') : undefined;
    return base ? path.join(path.resolve(base), 'skills', SKILL_NAME) : undefined;
}

export type SkillState = 'missing' | 'current' | 'outdated' | 'foreign' | 'linked' | 'unreadable';
export interface SkillStatus { file: string; state: SkillState; }

/** Relative paths of every regular file under a directory, sorted. */
function files(directory: string, prefix = ''): string[] {
    return fs.readdirSync(path.join(directory, prefix), { withFileTypes: true }).flatMap(entry => {
        const relative = path.join(prefix, entry.name);
        return entry.isDirectory() ? files(directory, relative) : entry.isFile() ? [relative] : [relative + '\0'];
    }).sort();
}

/** The same files with the same bytes. */
function sameTree(a: string, b: string): boolean {
    const left = files(a);
    const right = files(b);
    return left.length === right.length && left.every((file, i) => file === right[i] && !file.endsWith('\0')
        && fs.readFileSync(path.join(a, file)).equals(fs.readFileSync(path.join(b, file))));
}

/** The skill name in a SKILL.md front matter, if it has one. */
function frontMatterName(text: string): string | undefined {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    return match ? /^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(match[1])?.[1] : undefined;
}

/**
 * Compares the installed folder with the packaged one. `outdated` is another DotShare
 * version (or a partial copy); `foreign` is a different skill under the same name;
 * `linked` is a symlink, which setup never writes through.
 */
export function skillStatus(source: string, directory: string): SkillStatus {
    const file = path.join(directory, 'SKILL.md');
    let stat: fs.Stats;
    try { stat = fs.lstatSync(directory); } catch { return { file, state: 'missing' }; }
    try {
        if (stat.isSymbolicLink()) return { file, state: fs.existsSync(file) && sameTree(source, fs.realpathSync(directory)) ? 'current' : 'linked' };
        if (!stat.isDirectory()) return { file, state: 'foreign' };
        if (!fs.existsSync(file)) return { file, state: fs.readdirSync(directory).length ? 'foreign' : 'missing' };
        if (fs.lstatSync(file).isSymbolicLink()) return { file, state: sameTree(source, directory) ? 'current' : 'linked' };
        if (sameTree(source, directory)) return { file, state: 'current' };
        return { file, state: frontMatterName(fs.readFileSync(file, 'utf8')) === SKILL_NAME ? 'outdated' : 'foreign' };
    } catch { return { file, state: 'unreadable' }; }
}

export interface SkillInstall { file: string; state: SkillState; changed: boolean; backupPath?: string; message: string; }

/**
 * Installs or updates the skill folder. An older DotShare copy is replaced as a whole,
 * so files it no longer ships disappear. Anything else under that name is kept unless
 * `replace` is set, and then moved to `backupRoot` first, outside the skills directory
 * so the client doesn't load it twice. The swap is a rename, so the client never sees
 * half a skill.
 */
export function installSkill(source: string, directory: string, options: { replace?: boolean; dryRun?: boolean; backupRoot?: string } = {}): SkillInstall {
    const { file, state } = skillStatus(source, directory);
    if (state === 'current') return { file, state, changed: false, message: `Agent skill is up to date: ${directory}` };
    if (state === 'linked') return { file, state, changed: false, message: `The agent skill at ${directory} is a symlink to another copy; it was left as is.` };
    if (state === 'unreadable') return { file, state, changed: false, message: `The agent skill at ${directory} is unreadable; it was left as is.` };
    if (state === 'foreign' && !options.replace) {
        return { file, state, changed: false, message: `Another skill named "${SKILL_NAME}" is installed at ${directory}; it was kept. Use --replace to replace it (a backup is kept).` };
    }
    const verb = state === 'missing' ? 'install' : 'update';
    if (options.dryRun) return { file, state, changed: false, message: `Setup would ${verb} the agent skill at ${directory}.` };
    const parent = path.dirname(directory);
    fs.mkdirSync(parent, { recursive: true, mode: 0o755 });
    const incoming = path.join(parent, `.${SKILL_NAME}-new-${randomUUID()}`);
    const outgoing = path.join(parent, `.${SKILL_NAME}-old-${randomUUID()}`);
    let backupPath: string | undefined;
    try {
        const existed = fs.existsSync(directory);
        if (existed && state === 'foreign') {
            // Back up first: if anything below fails, the user's skill is still in place.
            backupPath = path.join(options.backupRoot || parent, `${SKILL_NAME}-skill-before-dotshare-${randomUUID()}`);
            fs.mkdirSync(path.dirname(backupPath), { recursive: true, mode: 0o700 });
            fs.cpSync(directory, backupPath, { recursive: true, errorOnExist: true, force: false });
        }
        fs.cpSync(source, incoming, { recursive: true, dereference: true, errorOnExist: true, force: false });
        if (existed) fs.renameSync(directory, outgoing);
        try { fs.renameSync(incoming, directory); }
        catch (error) { if (existed) fs.renameSync(outgoing, directory); throw error; }
    } finally {
        fs.rmSync(incoming, { recursive: true, force: true });
        fs.rmSync(outgoing, { recursive: true, force: true });
    }
    return { file, state, changed: true, ...(backupPath && { backupPath }), message: `Agent skill ${verb === 'install' ? 'installed' : 'updated'}: ${directory}` };
}
