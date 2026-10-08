/** Article links may open ordinary web pages, never commands or local resources. */
export function getPreviewWebUrl(value: unknown): string | undefined {
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value.trim())) return undefined;
    try {
        const url = new URL(value.trim());
        return url.hostname ? value.trim() : undefined;
    } catch {
        return undefined;
    }
}
