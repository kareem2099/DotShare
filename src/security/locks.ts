import * as fs from 'fs';
import * as os from 'os';

interface LockOwner { pid: number; host: string; createdAt: number; }
export interface LockOptions {
    /** How long to wait for another writer before giving up. */
    timeoutMs?: number;
    /** Error to throw when the lock stays busy or can't be created. */
    busy: () => Error;
}

/** Locks guard millisecond commits, so a lock this old was left by a crashed process. */
const STALE_AFTER_MS = 10 * 60 * 1000;
/** A lock without an owner record is still being written, unless it has been empty this long. */
const UNWRITTEN_AFTER_MS = 30 * 1000;
const POLL_MS = 50;

const held = new Set<string>();
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const sleep = (ms: number): void => { Atomics.wait(sleeper, 0, 0, ms); };

function alive(pid: number): boolean {
    try { process.kill(pid, 0); return true; }
    catch (error) { return (error as { code?: string }).code === 'EPERM'; }
}

/** The lock's contents if its owner is gone, so it can be removed; undefined while it is held. */
function staleContents(file: string): string | undefined {
    let raw: string; let modified: number;
    try { modified = fs.lstatSync(file).mtimeMs; raw = fs.readFileSync(file, 'utf8'); }
    catch { return undefined; }
    let owner: Partial<LockOwner> = {};
    try { owner = JSON.parse(raw) as Partial<LockOwner>; } catch { /* Not written yet, or truncated by a crash. */ }
    const age = Date.now() - (typeof owner.createdAt === 'number' ? owner.createdAt : modified);
    if (age > STALE_AFTER_MS) return raw;
    if (typeof owner.pid !== 'number') return age > UNWRITTEN_AFTER_MS ? raw : undefined;
    if (owner.host !== os.hostname()) return undefined;
    // A reused PID is ours only when this process isn't actually holding the lock.
    if (owner.pid === process.pid) return held.has(file) ? undefined : raw;
    return alive(owner.pid) ? undefined : raw;
}

function removeIfUnchanged(file: string, contents: string): void {
    try { if (fs.readFileSync(file, 'utf8') === contents) fs.unlinkSync(file); }
    catch { /* Another process already removed or replaced it. */ }
}

/**
 * Run `action` while holding an exclusive lock file. Waits for other writers, and
 * removes locks left behind by crashed processes instead of failing forever.
 */
export function withFileLock<T>(file: string, action: () => T, options: LockOptions): T {
    const deadline = Date.now() + (options.timeoutMs ?? 10000);
    let fd: number;
    for (;;) {
        try {
            fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
            break;
        } catch (error) {
            if ((error as { code?: string }).code !== 'EEXIST') throw options.busy();
            const stale = staleContents(file);
            if (stale !== undefined) { removeIfUnchanged(file, stale); continue; }
            if (Date.now() >= deadline) throw options.busy();
            sleep(POLL_MS);
        }
    }
    held.add(file);
    try {
        const owner: LockOwner = { pid: process.pid, host: os.hostname(), createdAt: Date.now() };
        fs.writeFileSync(fd, JSON.stringify(owner));
        return action();
    } finally {
        held.delete(file);
        fs.closeSync(fd);
        try { fs.unlinkSync(file); } catch { /* Already removed as stale by another process after a long pause. */ }
    }
}
