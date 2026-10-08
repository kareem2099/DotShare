import * as vscode from 'vscode';
import { openArticlePreviewLink } from '../PreviewLinkService';

beforeEach(() => jest.clearAllMocks());

it('opens a web URL through VS Code', async () => {
    jest.mocked(vscode.env.openExternal).mockResolvedValueOnce(true);
    expect(await openArticlePreviewLink('https://github.com/kareem2099/DotGhostBoard')).toBe(true);
    expect(vscode.Uri.parse).toHaveBeenCalledWith('https://github.com/kareem2099/DotGhostBoard');
    expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
});

it.each(['command:workbench.action.reloadWindow', 'javascript:alert(1)', 'file:///tmp/example', '/relative', 'https://', 123, undefined])('does not pass unsupported links to VS Code: %s', async value => {
    expect(await openArticlePreviewLink(value)).toBe(false);
    expect(vscode.env.openExternal).not.toHaveBeenCalled();
});

it('stops when VS Code declines to open the link', async () => {
    jest.mocked(vscode.env.openExternal).mockResolvedValueOnce(false);
    expect(await openArticlePreviewLink('https://example.com')).toBe(false);
    expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
});

it('stops when the VS Code opener fails', async () => {
    jest.mocked(vscode.env.openExternal).mockRejectedValueOnce(new Error('Rejected'));
    expect(await openArticlePreviewLink('https://example.com')).toBe(false);
    expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
});
