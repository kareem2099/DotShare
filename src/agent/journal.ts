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

export function fingerprint(value: unknown): string {
    const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical)
        : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : item;
    return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
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
    begin(id: string, hash: string, kind: Operation['kind'], results: TargetResult[] = [], draft?: Operation['draft']): { operation: Operation; replayed: boolean } {
        const operation: Operation = { requestId: id, fingerprint: hash, kind, status: 'running', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), results, ...(draft && { draft }) };
        try { this.files.write(this.file(id), operation, true); }
        catch (error) {
            if ((error as { code?: string }).code !== 'EEXIST') throw error;
            const previous = this.get(id)!;
            if (previous.fingerprint !== hash || previous.kind !== kind) throw new Error('requestId was already used for different content. Reuse it only for the same action.');
            return { operation: previous, replayed: true };
        }
        return { operation, replayed: false };
    }
    save(operation: Operation): void {
        operation.updatedAt = new Date().toISOString();
        this.files.write(this.file(operation.requestId), operation);
    }
    list(limit = 20): Operation[] {
        if (!fs.existsSync(this.directory)) return [];
        return fs.readdirSync(this.directory).filter(name => name.endsWith('.json'))
            .map(name => this.get(name.slice(0, -5))!).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    }
}
