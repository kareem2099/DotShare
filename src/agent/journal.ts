import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { LocalVault } from '../security/vault';
import { StorageSecurityError } from '../security/private-files';
import { requestIdSchema } from './schema';
import { PublicationReceipt } from '../platforms/runtime';

export interface TargetResult {
    accountId: string;
    platform: string;
    status: 'pending' | 'publishing' | 'published' | 'uncertain' | 'cancelled';
    receipts: PublicationReceipt[];
    error?: string;
}
export interface Operation {
    requestId: string;
    fingerprint: string;
    kind: 'publish' | 'schedule' | 'cancel';
    status: 'running' | 'completed' | 'needs_review';
    createdAt: string;
    updatedAt: string;
    results: TargetResult[];
    scheduledPostId?: string;
    error?: string;
    draft?: { draftId: string; revision: number; previewId: string };
}

export interface UnreadableOperation { requestId: string; unreadable: true; error: string; }

/** Code-point order: unlike localeCompare, it is the same in every process and locale. */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function hash(value: unknown, order: (a: string, b: string) => number): string {
    const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical)
        : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => order(a, b)).map(([key, child]) => [key, canonical(child)])) : item;
    return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function fingerprint(value: unknown): string {
    return hash(value, compareText);
}

/**
 * The current fingerprint plus the one records written before 3.6.1 used: those sorted
 * keys with localeCompare, so they still match when this process orders keys the same way.
 */
export interface Fingerprints { current: string; legacy: string; }
export function fingerprints(value: unknown): Fingerprints {
    return { current: fingerprint(value), legacy: hash(value, (a, b) => a.localeCompare(b)) };
}
export function matchesFingerprint(stored: string, value: unknown): boolean {
    const { current, legacy } = fingerprints(value);
    return stored === current || stored === legacy;
}

export class OperationJournal {
    private readonly directory: string;
    constructor(home: string, private readonly files = new LocalVault(home)) { this.directory = path.join(home, 'operations'); }
    private file(id: string): string { return path.join(this.directory, `${requestIdSchema.parse(id)}.json`); }
    get(id: string): Operation | undefined {
        const file = this.file(id);
        try { return this.files.read(file) as Operation; }
        catch (error) {
            if (error instanceof StorageSecurityError) throw error;
            if ((error as { code?: string }).code === 'ENOENT') return undefined;
            throw new Error('Operation journal is unreadable. Inspect the destination before publishing again.');
        }
    }
    begin(id: string, hash: string | Fingerprints, kind: Operation['kind'], results: TargetResult[] = [], draft?: Operation['draft']): { operation: Operation; replayed: boolean } {
        const accepted = typeof hash === 'string' ? [hash] : [hash.current, hash.legacy];
        const operation: Operation = { requestId: id, fingerprint: accepted[0], kind, status: 'running', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), results, ...(draft && { draft }) };
        try { this.files.write(this.file(id), operation, true); }
        catch (error) {
            if ((error as { code?: string }).code !== 'EEXIST') throw error;
            const previous = this.get(id)!;
            if (!accepted.includes(previous.fingerprint) || previous.kind !== kind) throw new Error('requestId was already used for different content. Reuse it only for the same action.');
            return { operation: previous, replayed: true };
        }
        return { operation, replayed: false };
    }
    save(operation: Operation): void {
        operation.updatedAt = new Date().toISOString();
        this.files.write(this.file(operation.requestId), operation);
    }
    /** Recent operations. A damaged record is listed as unreadable instead of hiding the rest. */
    list(limit = 20): (Operation | UnreadableOperation)[] {
        if (!fs.existsSync(this.directory)) return [];
        const names = fs.readdirSync(this.directory).filter(name => name.endsWith('.json'));
        // A missing or wrong vault key affects every record, so report it once.
        if (names.length) this.files.verifyKey();
        const readable: Operation[] = []; const unreadable: UnreadableOperation[] = [];
        for (const name of names) {
            const requestId = name.slice(0, -5);
            try { const operation = this.get(requestId); if (operation) readable.push(operation); }
            catch (error) { unreadable.push({ requestId, unreadable: true, error: error instanceof Error ? error.message : 'Unreadable record.' }); }
        }
        readable.sort((a, b) => compareText(b.createdAt, a.createdAt));
        return [...readable, ...unreadable].slice(0, limit);
    }
}
