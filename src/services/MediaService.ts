import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

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
}
