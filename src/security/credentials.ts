import type * as vscode from 'vscode';
import type { SocialPlatform, SavedApiConfiguration } from '../types';

export const AI_PROVIDERS = ['gemini', 'openai', 'claude', 'xai', 'deepseek'] as const;
export const PLATFORM_SECRET_KEYS: Record<SocialPlatform, readonly string[]> = {
    linkedin: ['linkedinToken'],
    telegram: ['telegramBot', 'telegramChat'],
    x: ['xAccessToken', 'xAccessSecret'],
    discord: ['discordWebhook'],
    bluesky: ['blueskyIdentifier', 'blueskyPassword'],
    mastodon: ['mastodonInstance', 'mastodonToken'],
    devto: ['devtoApiKey'],
};
export const ALL_SECRET_KEYS = [
    ...Object.values(PLATFORM_SECRET_KEYS).flat(),
    ...AI_PROVIDERS.map(provider => `${provider}ApiKey`),
    'discordWebhookUrl', // Previous storage name; also removed during migration.
    'xRefreshToken', 'x_expires_at', 'linkedin_expires_at', 'githubToken',
    'DOTSHARE_API_TOKEN',
];

export function isPlatform(value: unknown): value is SocialPlatform {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PLATFORM_SECRET_KEYS, value);
}

/** Never copy arbitrary properties or credential values into a webview response. */
export function publicApiConfiguration(config: SavedApiConfiguration) {
    return {
        id: config.id, name: config.name, platform: config.platform,
        created: config.created, lastUsed: config.lastUsed, isDefault: config.isDefault,
        hasCredentials: PLATFORM_SECRET_KEYS[config.platform].every(key =>
            !!(config.credentials as unknown as Record<string, string>)[key]),
    };
}

export async function credentialStatus(secrets: vscode.SecretStorage): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};
    for (const key of ALL_SECRET_KEYS) status[key] = !!await secrets.get(key);
    return status;
}
