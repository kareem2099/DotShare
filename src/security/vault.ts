import * as fs from 'fs';
import * as path from 'path';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { CliCredentialStore, OsCredentialStore } from '../cli/credential-store';
import { privateDirectory, privateRead, privateWriteJson, checkPrivateFile, StorageSecurityError } from './private-files';

const manifestSchema = z.object({ format: z.literal('dotshare-vault'), version: z.literal(1), keyId: z.uuid(), keyCheck: z.string() }).strict();
const envelopeSchema = z.object({ format: z.literal('dotshare-encrypted'), version: z.literal(1), algorithm: z.literal('aes-256-gcm'), keyId: z.uuid(),
    nonce: z.string(), tag: z.string(), ciphertext: z.string() }).strict();
const CATEGORIES = ['drafts', 'templates', 'operations'] as const;
const MAX_PLAIN = 8 * 1024 * 1024;
function binary(value: string, size?: number): Buffer {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value || (size !== undefined && decoded.length !== size)) throw new Error('Invalid encoding');
    return decoded;
}
function json(text: string): unknown {
    try { return JSON.parse(text) as unknown; }
    catch { throw new StorageSecurityError('Local storage JSON is unreadable. Its contents were not displayed.'); }
}
export interface VaultStatus { encrypted: number; plaintext: number; unreadable: number; initialized: boolean; keyAccess: 'not-checked'; }

/** Authenticated local records; the random master key exists only in the required OS credential store. */
export class LocalVault {
    readonly home: string;
    private writing = false;
    constructor(home: string, private readonly secrets: CliCredentialStore = new OsCredentialStore()) { this.home = path.resolve(home); }
    directory(category: typeof CATEGORIES[number]): void { privateDirectory(this.home); privateDirectory(path.join(this.home, category)); }
    private location(file: string): string {
        const relative = path.relative(this.home, path.resolve(file)).split(path.sep).join('/');
        if (!/^(drafts|templates|operations)\/[a-zA-Z0-9_.-]+\.json$/.test(relative)) throw new StorageSecurityError('This record is outside the local encrypted store.');
        privateDirectory(this.home); privateDirectory(path.dirname(path.resolve(file)));
        return relative;
    }
    private manifest(create = false): z.infer<typeof manifestSchema> {
        privateDirectory(this.home);
        const file = path.join(this.home, 'security.json');
        if (fs.existsSync(file)) {
            try { return manifestSchema.parse(JSON.parse(privateRead(file, 4096))); }
            catch { throw new StorageSecurityError('Vault metadata is unreadable. Restore the matching vault metadata and OS key; do not reset the key.'); }
        }
        if (!create) throw new StorageSecurityError('The encrypted store has no vault metadata. Restore security.json and its OS key.');
        const lock = path.join(this.home, 'security.init.lock');
        let fd: number;
        try { fd = fs.openSync(lock, 'wx', 0o600); } catch { throw new StorageSecurityError('Vault initialization is busy or locked. Inspect a stale lock before removing it.'); }
        try {
            if (fs.existsSync(file)) return this.manifest();
            const files = this.records();
            if (files.some(file => this.encrypted(json(privateRead(file))))) throw new StorageSecurityError('Encrypted records exist without vault metadata. Restore the original security.json; a replacement key cannot recover them.');
            const key = randomBytes(32); const keyId = randomUUID();
            const manifest = { format: 'dotshare-vault' as const, version: 1 as const, keyId, keyCheck: createHmac('sha256', key).update(`dotshare-key-check|1|${keyId}`).digest('base64') };
            const entry = `vault:${manifest.keyId}`;
            try {
                this.secrets.set(entry, key.toString('base64'));
                const stored = this.secrets.get(entry);
                if (!stored || !timingSafeEqual(binary(stored, 32), key)) throw new Error();
                privateWriteJson(file, manifest, true);
            } catch {
                // Leave no data encrypted under an uncommitted key. Do not delete any existing vault key.
                try { this.secrets.delete(entry); } catch { /* Unreferenced random entry; no content has been committed. */ }
                throw new StorageSecurityError('Could not initialize the encrypted store in the OS keyring. No plaintext fallback or file key was created.');
            } finally { key.fill(0); }
            return manifest;
        } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
    }
    private key(manifest: z.infer<typeof manifestSchema>): Buffer {
        let key: Buffer | undefined;
        try {
            const value = this.secrets.get(`vault:${manifest.keyId}`); if (!value) throw new Error(); key = binary(value, 32);
            const check = createHmac('sha256', key).update(`dotshare-key-check|1|${manifest.keyId}`).digest();
            if (!timingSafeEqual(check, binary(manifest.keyCheck, 32))) throw new Error();
            return key;
        }
        catch { key?.fill(0); throw new StorageSecurityError('The vault key is unavailable or does not match. Unlock the OS credential store or restore the original key. Existing ciphertext is never replaced with a new key.'); }
    }
    private encrypted(value: unknown): boolean { return value !== null && typeof value === 'object' && (value as Record<string, unknown>).format === 'dotshare-encrypted'; }
    private seal(file: string, value: unknown): z.infer<typeof envelopeSchema> {
        const relative = this.location(file); const plaintext = Buffer.from(JSON.stringify(value));
        if (plaintext.length > MAX_PLAIN) throw new StorageSecurityError('Local record exceeds 8 MiB.');
        const manifest = this.manifest(true); const key = this.key(manifest); const nonce = randomBytes(12);
        try {
            const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
            cipher.setAAD(Buffer.from(`dotshare|1|${manifest.keyId}|${relative}`));
            const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
            return { format: 'dotshare-encrypted', version: 1, algorithm: 'aes-256-gcm', keyId: manifest.keyId, nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
        } finally { key.fill(0); plaintext.fill(0); }
    }
    read(file: string): unknown {
        const relative = this.location(file); const value = json(privateRead(file, 12 * 1024 * 1024));
        if (!this.encrypted(value)) throw new StorageSecurityError('Legacy plaintext records are blocked. Run dotshare-agent security protect to encrypt the existing library.');
        const manifest = this.manifest(); const key = this.key(manifest);
        let plaintext: Buffer | undefined;
        try {
            const envelope = envelopeSchema.parse(value);
            if (envelope.keyId !== manifest.keyId) throw new Error();
            const nonce = binary(envelope.nonce, 12); const tag = binary(envelope.tag, 16); const ciphertext = binary(envelope.ciphertext);
            if (ciphertext.length > MAX_PLAIN) throw new Error();
            const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
            decipher.setAAD(Buffer.from(`dotshare|1|${manifest.keyId}|${relative}`)); decipher.setAuthTag(tag);
            plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            return JSON.parse(plaintext.toString('utf8')) as unknown;
        } catch { throw new StorageSecurityError('Encrypted record authentication failed. The file, record identity or vault key does not match. Restore a trusted encrypted copy; do not republish uncertain operations.'); }
        finally { key.fill(0); plaintext?.fill(0); }
    }
    private writeLock<T>(action: () => T): T {
        if (this.writing) return action();
        privateDirectory(this.home);
        const file = path.join(this.home, 'security.write.lock');
        let fd: number;
        try { fd = fs.openSync(file, 'wx', 0o600); } catch { throw new StorageSecurityError('Encrypted storage is busy or locked. Retry the same action after the other writer finishes; inspect stale locks before removing them.'); }
        this.writing = true;
        try { return action(); } finally { this.writing = false; fs.closeSync(fd); fs.unlinkSync(file); }
    }
    write(file: string, value: unknown, exclusive = false): void { this.writeLock(() => privateWriteJson(file, this.seal(file, value), exclusive)); }
    records(): string[] {
        const files: string[] = [];
        if (!fs.existsSync(this.home)) return files;
        for (const category of CATEGORIES) {
            const directory = path.join(this.home, category); if (!fs.existsSync(directory)) continue;
            if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) throw new StorageSecurityError('Local record directories must not be symlinks.');
            for (const name of fs.readdirSync(directory)) if (name.endsWith('.json')) {
                if (!/^[a-zA-Z0-9_.-]+\.json$/.test(name)) throw new StorageSecurityError('Unexpected filename in the local store.');
                files.push(path.join(directory, name));
            }
        }
        return files;
    }
    status(): VaultStatus {
        const status: VaultStatus = { encrypted: 0, plaintext: 0, unreadable: 0, initialized: fs.existsSync(path.join(this.home, 'security.json')), keyAccess: 'not-checked' };
        for (const file of this.records()) {
            try { const value: unknown = JSON.parse(privateRead(file, 12 * 1024 * 1024)); if (this.encrypted(value)) status.encrypted++; else status.plaintext++; }
            catch { status.unreadable++; }
        }
        return status;
    }
    verifyKey(): void { this.key(this.manifest()).fill(0); }
    protect(): { encrypted: number; alreadyEncrypted: number } {
        privateDirectory(this.home, true);
        return this.writeLock(() => this.migrate());
    }
    private migrate(): { encrypted: number; alreadyEncrypted: number } {
        const files = this.records();
        // Validate all files before committing a key or replacing any plaintext record.
        const records = files.map(file => {
            privateDirectory(path.dirname(file), true); checkPrivateFile(file, true);
            const value = json(privateRead(file, 12 * 1024 * 1024));
            if (!this.encrypted(value) && Buffer.byteLength(JSON.stringify(value)) > MAX_PLAIN) throw new StorageSecurityError('A legacy record exceeds the encrypted store size limit. No records were replaced.');
            return { file, encrypted: this.encrypted(value) };
        });
        if (fs.existsSync(path.join(this.home, 'security.json'))) checkPrivateFile(path.join(this.home, 'security.json'), true);
        this.key(this.manifest(true)).fill(0);
        for (const record of records) if (record.encrypted) this.read(record.file);
        let encrypted = 0; let alreadyEncrypted = 0;
        for (const record of records) {
            if (record.encrypted) alreadyEncrypted++;
            else {
                const original = json(privateRead(record.file)); this.write(record.file, original);
                if (JSON.stringify(this.read(record.file)) !== JSON.stringify(original)) throw new StorageSecurityError('Encrypted migration verification failed. Stop all clients and inspect the record.');
                encrypted++;
            }
        }
        return { encrypted, alreadyEncrypted };
    }
}
