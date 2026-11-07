import type * as vscode from 'vscode';

// The extension installs its host once. Headless consumers never load `vscode`.
let host: typeof vscode | undefined;
export function setPlatformHost(value: typeof vscode): void { host = value; }
export function getPlatformHost(): typeof vscode | undefined { return host; }

export interface PublicationReceipt {
    id: string;
    url?: string;
    uri?: string;
}
export type PublicationObserver = (receipt: PublicationReceipt) => void;
