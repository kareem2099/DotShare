import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
};

/**
 * Turn the media references a thread post carries into local files the platform
 * adapters can read. The composer uploads thread media to cloud storage first, so
 * references are usually HTTPS URLs; those are downloaded to temp files, which are
 * appended to `tempPaths` for the caller to delete.
 *
 * A reference that can't be resolved throws, so a post is never published without
 * the media the user attached.
 */
export async function resolveThreadMedia(references: string[], tempPaths: string[]): Promise<string[]> {
    const resolved: string[] = [];

    for (const reference of references) {
        if (/^https:\/\//i.test(reference)) {
            const response = await axios.get<ArrayBuffer>(reference, {
                responseType: 'arraybuffer',
                maxRedirects: 0,
                maxContentLength: MAX_MEDIA_BYTES,
            });
            const mime = String(response.headers['content-type'] || '').split(';')[0].trim();
            const ext = EXTENSIONS[mime];
            if (!ext) throw new Error(`Unsupported media type "${mime}" for ${path.basename(new URL(reference).pathname)}`);

            const tempPath = path.join(os.tmpdir(), `thread_media_${Date.now()}_${tempPaths.length}.${ext}`);
            fs.writeFileSync(tempPath, Buffer.from(response.data));
            tempPaths.push(tempPath);
            resolved.push(tempPath);
        } else if (fs.existsSync(reference)) {
            resolved.push(reference);
        } else {
            throw new Error(`Attached media could not be found: ${path.basename(reference)}`);
        }
    }

    return resolved;
}
