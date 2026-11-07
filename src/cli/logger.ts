import { redactSensitiveText, safeLogValue } from '../security/redaction';

function format(message: string, data?: unknown): string {
    let detail = '';
    if (data !== undefined) {
        try { detail = data instanceof Error ? data.message : safeLogValue(data); }
        catch { detail = '[Unserializable diagnostic data]'; }
    }
    return redactSensitiveText(`${message}${detail ? `: ${detail}` : ''}`);
}

/** CLI logging cannot depend on the VS Code extension host. */
export const Logger = {
    info(message: string, data?: unknown): void { console.log(format(message, data)); },
    warn(message: string, error?: unknown): void {
        console.warn(format(message, error));
    },
    error(message: string, error?: unknown): void {
        console.error(format(message, error));
    },
};
