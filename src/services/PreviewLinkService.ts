import * as vscode from 'vscode';
import { getPreviewWebUrl } from '../utils/preview-links';

export async function openArticlePreviewLink(value: unknown): Promise<boolean> {
    const url = getPreviewWebUrl(value);
    if (!url) return false;
    try {
        // Respect VS Code's result; a refusal must not trigger an alternate opener.
        return await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch {
        return false;
    }
}
