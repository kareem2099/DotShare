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
                    if (/token|secret|password|api.?key|telegramBot|accessJwt|refreshJwt|webhook/i.test(key) && typeof field === 'string' && field) knownSecrets.add(field);
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
    text = text
        .replace(/\b(?:sk-(?:ant-)?|xai-|AIza|gh[pousr]_|github_pat_|ds_prod_)[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
        .replace(/\bBearer\s+[^\s"',}]+/gi, 'Bearer [REDACTED]')
        .replace(/([?&](?:token|access_token|refresh_token|client_secret|password|api_key|key|code)=)[^\s&#"']+/gi, '$1[REDACTED]')
        .replace(/(https?:\/\/api\.telegram\.org\/bot)[^/\s"'?]+/gi, '$1[REDACTED]')
        .replace(/(https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/)[^/\s"'?#]+/gi, '$1[REDACTED]')
        .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1[REDACTED]@')
        .replace(/("(?:[^"\n]*(?:token|secret|password|api[-_]?key)|telegramBot|discordWebhook)"\s*:\s*")[^"\n]*(")/gi, '$1[REDACTED]$2');
    for (const secret of [...knownSecrets].sort((a, b) => b.length - a.length)) {
        text = text.split(secret).join('[REDACTED]');
        try { const encoded = encodeURIComponent(secret); if (encoded !== secret) text = text.split(encoded).join('[REDACTED]'); } catch { /* Malformed Unicode must never break error handling. */ }
    }
    return text;
}

export function assertNoKnownSecrets(value: unknown): void {
    const text = JSON.stringify(value);
    for (const secret of knownSecrets) if (secret.length >= 8 && text.includes(secret)) throw new Error('Publication blocked: the content contains a known credential. Remove the secret and prepare a new preview.');
}
export function safeLogValue(value: unknown): string {
    const seen = new WeakSet<object>();
    try { return redactSensitiveText(JSON.stringify(value, (key, item: unknown) => {
        if (/^(config|request|headers|credentials)$|token|secret|password|api.?key|accessJwt|refreshJwt|webhook/i.test(key)) return '[REDACTED]';
        if (item && typeof item === 'object') { if (seen.has(item)) return '[Circular]'; seen.add(item); }
        return item;
    }) ?? ''); } catch { return '[Unserializable data]'; }
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
