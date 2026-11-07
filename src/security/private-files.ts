import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

export class StorageSecurityError extends Error {}
function owned(info: fs.Stats): void {
    if (process.platform !== 'win32' && typeof process.getuid === 'function' && info.uid !== process.getuid()) throw new StorageSecurityError('Local storage is owned by another user. Refusing access.');
}
export function privateDirectory(directory: string, repair = false): void {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const info = fs.lstatSync(directory); owned(info);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new StorageSecurityError('Local storage directories must not be symlinks.');
    if (process.platform !== 'win32' && (info.mode & 0o077)) {
        if (!repair) throw new StorageSecurityError('Local storage permissions are too broad. Run dotshare-agent security protect.');
        fs.chmodSync(directory, 0o700);
    }
}
export function checkPrivateFile(file: string, repair = false): fs.Stats {
    const info = fs.lstatSync(file); owned(info);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new StorageSecurityError('Local storage files must be regular, unlinked private files; symlinks and hardlinks are refused.');
    if (process.platform !== 'win32' && (info.mode & 0o077)) {
        if (!repair) throw new StorageSecurityError('Local storage permissions are too broad. Run dotshare-agent security protect.');
        fs.chmodSync(file, 0o600);
    }
    return info;
}
export function privateRead(file: string, maximum = 16 * 1024 * 1024): string {
    const before = checkPrivateFile(file);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
        const info = fs.fstatSync(fd); owned(info);
        if (!info.isFile() || info.nlink !== 1 || info.ino !== before.ino || info.dev !== before.dev || info.size > maximum) throw new StorageSecurityError('Local storage changed or exceeds its size limit.');
        const bytes = Buffer.alloc(info.size + 1);
        let read = 0;
        while (read < bytes.length) { const count = fs.readSync(fd, bytes, read, bytes.length - read, null); if (!count) break; read += count; }
        if (read > maximum || read !== info.size || fs.fstatSync(fd).size !== info.size) throw new StorageSecurityError('Local storage changed during reading.');
        return bytes.subarray(0, read).toString('utf8');
    } finally { fs.closeSync(fd); }
}
export function privateWriteJson(file: string, value: unknown, exclusive = false): void {
    privateDirectory(path.dirname(file));
    if (fs.existsSync(file)) checkPrivateFile(file);
    const data = JSON.stringify(value);
    const temporary = exclusive ? file : `${file}.${process.pid}.${randomBytes(12).toString('hex')}.tmp`;
    let fd: number | undefined;
    try {
        fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
        fs.writeFileSync(fd, data); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
        if (!exclusive) fs.renameSync(temporary, file);
        if (process.platform !== 'win32') { const directory = fs.openSync(path.dirname(file), 'r'); try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); } }
    } catch (error) {
        if (fd !== undefined) fs.closeSync(fd);
        // An exclusive journal claim survives failed writes, so uncertainty can never trigger a resend.
        if (!exclusive && fs.existsSync(temporary)) fs.unlinkSync(temporary);
        throw error;
    }
}
