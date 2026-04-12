import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import sharp from 'sharp';
import { Logger } from '../utils/Logger';

export class MediaService {
    constructor(private context: vscode.ExtensionContext) {}

    public async saveUploadedFile(file: { name: string; base64Data: string; size: number }): Promise<string> {
        const storageUri = this.context.globalStorageUri || vscode.Uri.file(path.join(os.tmpdir(), 'dotshare-media'));
        const mediaDir = vscode.Uri.joinPath(storageUri, 'media');

        await vscode.workspace.fs.createDirectory(mediaDir);

        const binaryString = atob(file.base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const fileName = `${Date.now()}-${file.name}`;
        const fileUri = vscode.Uri.joinPath(mediaDir, fileName);
        await vscode.workspace.fs.writeFile(fileUri, bytes);

        return fileUri.fsPath;
    }

    /**
     * Compresses and resizes an image if it exceeds the specified size limit.
     * @param filePath Path to the original image
     * @param maxSizeInBytes Size limit in bytes (default 1.9MB to be safe for Bluesky's 2MB)
     * @returns Path to the processed image (either original or a new temp file)
     */
    public async compressImageIfNecessary(filePath: string, maxSizeInBytes: number = 1.9 * 1024 * 1024): Promise<string> {
        try {
            if (!fs.existsSync(filePath)) return filePath;

            const stats = fs.statSync(filePath);
            if (stats.size <= maxSizeInBytes) {
                return filePath;
            }

            Logger.info(`[MediaService] Compressing large image: ${path.basename(filePath)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

            const ext = path.extname(filePath).toLowerCase();
            const fileName = `compressed_${Date.now()}${ext === '.png' ? '.png' : '.jpg'}`;
            const outputPath = path.join(os.tmpdir(), fileName);

            // Resizing to max 2000px width/height and compressing
            let sharpInstance = sharp(filePath)
                .resize(2000, 2000, {
                    fit: 'inside',
                    withoutEnlargement: true
                });

            if (ext === '.png') {
                sharpInstance = sharpInstance.png({ compressionLevel: 9, palette: true });
            } else {
                sharpInstance = sharpInstance.jpeg({ quality: 80, mozjpeg: true });
            }

            await sharpInstance.toFile(outputPath);

            const newStats = fs.statSync(outputPath);
            Logger.info(`[MediaService] Compression complete: ${path.basename(outputPath)} (${(newStats.size / 1024 / 1024).toFixed(2)} MB)`);

            return outputPath;
        } catch (error) {
            Logger.error('[MediaService] Error during image compression:', error);
            return filePath; // Fallback to original if compression fails
        }
    }
}
