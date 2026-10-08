import type * as vscode from 'vscode';

const knownSecrets = new Set<string>();

export function rememberSecret(value: string): void {
    if (!value) return;
    try {
        const parsed = JSON.parse(value);
        const visit = (item: unknown): void => {
            if (Array.isArray(item)) item.forEach(visit);
            else if (item && typeof item === 'object') {
                for (const [key, field] of Object.entries(item)) {
                    if (/token|secret|password|api.?key|telegramBot|telegramChat|blueskyIdentifier|discordWebhook/i.test(key) && typeof field === 'string' && field) knownSecrets.add(field);
                    else if (field && typeof field === 'object') visit(field);
                }
            }
        };
        if (parsed && typeof parsed === 'object') visit(parsed);
        else knownSecrets.add(value);
    } catch {
        knownSecrets.add(value);
    }
}

export function redactSensitiveText(text: string): string {
    for (const secret of [...knownSecrets].sort((a, b) => b.length - a.length)) {
        text = text.split(secret).join('[REDACTED]');
        const encoded = encodeURIComponent(secret);
        if (encoded !== secret) text = text.split(encoded).join('[REDACTED]');
    }
    return text
        .replace(/\b(?:sk-(?:ant-)?|xai-|AIza|gh[pousr]_|github_pat_|ds_prod_)[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
        .replace(/\bBearer\s+[^\s"',}]+/gi, 'Bearer [REDACTED]')
        .replace(/([?&](?:token|access_token|refresh_token|api_key|key|code)=)[^\s&#"']+/gi, '$1[REDACTED]')
        .replace(/("(?:[^"\n]*(?:token|secret|password|api[-_]?key)|telegramBot|discordWebhook)"\s*:\s*")[^"\n]*(")/gi, '$1[REDACTED]$2');
}

/** Register secrets before use so downstream errors cannot log their values. */
export function protectSecretStorage(context: vscode.ExtensionContext): vscode.ExtensionContext {
    const original = context.secrets;
    const secrets: vscode.SecretStorage = {
        onDidChange: original.onDidChange.bind(original),
        async get(key) {
            const value = await original.get(key);
            if (value) rememberSecret(value);
            return value;
        },
        async store(key, value) {
            rememberSecret(value);
            await original.store(key, value);
        },
        delete: original.delete.bind(original),
    };
    const guarded = Object.create(context) as vscode.ExtensionContext;
    Object.defineProperty(guarded, 'secrets', { value: secrets });
    return guarded;
}
