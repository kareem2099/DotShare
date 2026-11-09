import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { withFileLock } from '../locks';

let directory: string;
let lock: string;
const busy = () => new Error('busy');
const owner = (pid: number, createdAt = Date.now(), host = os.hostname()) => JSON.stringify({ pid, host, createdAt });
/** A PID that existed and has exited, so nothing is running under it. */
const deadPid = (): number => spawnSync(process.execPath, ['-e', '']).pid!;

beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-lock-test-'));
    lock = path.join(directory, 'write.lock');
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

it('runs the action and removes its lock afterwards', () => {
    expect(withFileLock(lock, () => fs.existsSync(lock), { busy })).toBe(true);
    expect(fs.existsSync(lock)).toBe(false);
});

it('removes the lock even when the action throws', () => {
    expect(() => withFileLock(lock, () => { throw new Error('action failed'); }, { busy })).toThrow('action failed');
    expect(fs.existsSync(lock)).toBe(false);
});

it('recovers a lock left by a crashed process', () => {
    fs.writeFileSync(lock, owner(deadPid()));
    expect(withFileLock(lock, () => 'ran', { busy, timeoutMs: 0 })).toBe('ran');
});

it('recovers a lock from a reused PID that this process does not hold', () => {
    fs.writeFileSync(lock, owner(process.pid));
    expect(withFileLock(lock, () => 'ran', { busy, timeoutMs: 0 })).toBe('ran');
});

it('recovers a lock older than any real commit, and an empty lock left before its owner was written', () => {
    fs.writeFileSync(lock, owner(process.ppid, Date.now() - 11 * 60 * 1000));
    expect(withFileLock(lock, () => 'old', { busy, timeoutMs: 0 })).toBe('old');
    fs.writeFileSync(lock, '');
    const past = new Date(Date.now() - 60 * 1000);
    fs.utimesSync(lock, past, past);
    expect(withFileLock(lock, () => 'empty', { busy, timeoutMs: 0 })).toBe('empty');
});

it('waits for a live owner and reports busy instead of stealing its lock', () => {
    // The parent process is alive, so this lock is genuinely held.
    fs.writeFileSync(lock, owner(process.ppid));
    const started = Date.now();
    expect(() => withFileLock(lock, () => 'stolen', { busy, timeoutMs: 200 })).toThrow('busy');
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
    expect(fs.readFileSync(lock, 'utf8')).toBe(owner(process.ppid, JSON.parse(fs.readFileSync(lock, 'utf8')).createdAt));
});

it('does not treat a fresh lock without an owner record as stale', () => {
    fs.writeFileSync(lock, '');
    expect(() => withFileLock(lock, () => 'stolen', { busy, timeoutMs: 0 })).toThrow('busy');
});

it('trusts locks from another host, whose processes it cannot check', () => {
    fs.writeFileSync(lock, owner(deadPid(), Date.now(), 'another-host'));
    expect(() => withFileLock(lock, () => 'stolen', { busy, timeoutMs: 0 })).toThrow('busy');
});
