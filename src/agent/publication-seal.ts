import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { PlannedTarget } from './preview';
import { AccountStore } from './accounts';
import { fingerprint, matchesFingerprint } from './journal';
import { ROTATING_CREDENTIAL_FIELDS } from './schema';

export interface AssetSeal { path: string; sha256: string; }
export interface AccountSeal { accountId: string; fingerprint: string; }
export interface PublicationSeal {
    source: { draftId: string; revision: number; previewId: string };
    targets: PlannedTarget[];
    assets: AssetSeal[];
    accounts: AccountSeal[];
}

function imageBytes(file: string): Buffer {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
        const stat = fs.fstatSync(fd);
        // Videos can be up to 512 MB (X); the planner enforces each platform's own limit.
        if (!stat.isFile() || stat.size < 1 || stat.size > 512 * 1024 * 1024) throw new Error('Preview media is missing, invalid or oversized.');
        const bytes = Buffer.alloc(stat.size + 1);
        let length = 0;
        while (length < bytes.length) {
            const read = fs.readSync(fd, bytes, length, bytes.length - length, length);
            if (!read) break;
            length += read;
        }
        if (length !== stat.size) throw new Error('Image changed while being read. Preview the draft again.');
        return bytes.subarray(0, length);
    } finally { fs.closeSync(fd); }
}
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
export function sealAssets(targets: PlannedTarget[]): AssetSeal[] {
    const files = [...new Set(targets.filter(target => target.platform !== 'devto').flatMap(target => target.posts.flatMap(post => post.media)))];
    return files.map(file => ({ path: file, sha256: digest(imageBytes(file)) }));
}
/** A browser-connected account is identified by its sign-in, not its rotating tokens. */
function identity(credentials: Record<string, string>): Record<string, string> {
    if (!credentials.connectionId) return credentials;
    return Object.fromEntries(Object.entries(credentials).filter(([key]) => !ROTATING_CREDENTIAL_FIELDS.includes(key)));
}
export function accountFingerprint(store: AccountStore, id: string, credentials: Record<string, string>): string {
    return fingerprint({ accountId: id, platform: store.get(id).platform, credentials: identity(credentials) });
}
export function accountMatches(store: AccountStore, id: string, credentials: Record<string, string>, expected: string): boolean {
    return matchesFingerprint(expected, { accountId: id, platform: store.get(id).platform, credentials: identity(credentials) });
}
export function sealAccounts(store: AccountStore, targets: Pick<PlannedTarget, 'accountId'>[]): AccountSeal[] {
    return targets.map(target => ({ accountId: target.accountId, fingerprint: accountFingerprint(store, target.accountId, store.credentials(target.accountId)) }));
}

/** Pin the bytes that were previewed so a later edit cannot change an upload. */
export function stageAssets(seal: PublicationSeal): { targets: PlannedTarget[]; dispose: () => void } {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-draft-media-'));
    const dispose = (): void => { fs.rmSync(directory, { recursive: true, force: true }); };
    try {
        const files = new Map<string, string>();
        for (const [index, asset] of seal.assets.entries()) {
            const bytes = imageBytes(asset.path);
            if (digest(bytes) !== asset.sha256) throw new Error('An image changed after preview. Preview the draft again before publishing.');
            const folder = path.join(directory, String(index));
            fs.mkdirSync(folder, { mode: 0o700 });
            const file = path.join(folder, path.basename(asset.path));
            fs.writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
            files.set(asset.path, file);
        }
        const targets = seal.targets.map(target => ({ ...target, posts: target.posts.map(post => ({ ...post, media: post.media.map(ref => {
            if (target.platform === 'devto') return ref;
            const staged = files.get(ref);
            if (!staged) throw new Error('Preview image snapshot is incomplete. Preview the draft again.');
            return staged;
        }) })) }));
        return { targets, dispose };
    } catch (error) { dispose(); throw error; }
}
