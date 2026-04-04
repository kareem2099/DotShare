/**
 * Platform Configuration — Single Source of Truth
 * 
 * DotShare v3.0
 *
 * Used by:
 *  - Extension side (src/) → API logic, routing, posting
 *  - WebView side (media/webview/) → UI rendering, char counters, workspace switching
 *
 * ⚠️ Never import VS Code APIs here — this file is shared between both contexts.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type WorkspaceType = 'threads' | 'social' | 'blogs';
export type AuthType      = 'oauth2' | 'api_key' | 'token' | 'webhook' | 'password';
export type CharCountMethod = 'standard' | 'twitter'; // Twitter counts URLs as 23 chars

export interface PlatformConfig {
    /** Display name shown in UI */
    name: string;

    /** Emoji / unicode icon shown in sidebar and headers */
    icon: string;

    /** Default character limit */
    maxChars: number;

    /** Premium character limit (X Premium: 25,000). Undefined if not applicable. */
    premiumMaxChars?: number;

    /** Supports creating threads (multiple connected posts) */
    supportsThreads: boolean;

    /** Supports attaching media (images / videos) */
    supportsMedia: boolean;

    /** Maximum number of media attachments per post */
    maxMediaCount: number;

    /** Supports scheduling posts */
    supportsScheduling: boolean;

    /**
     * Which WebView workspace to open for this platform:
     * - 'threads' → Thread Composer (X, Bluesky)
     * - 'social'  → Single post composer (LinkedIn, Telegram, etc.)
     * - 'blogs'   → Long-form markdown editor (Dev.to, Medium)
     */
    workspaceType: WorkspaceType;

    /**
     * How to count characters:
     * - 'standard' → count every character as-is
     * - 'twitter'  → URLs always count as 23 chars regardless of length
     */
    charCountMethod: CharCountMethod;

    /**
     * Authentication method used by this platform's API.
     * Drives which credential fields to show in Settings.
     */
    authType: AuthType;
}

// ── Platform Registry ─────────────────────────────────────────────────────────

export const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {

    x: {
        name:             'X / Twitter',
        icon:             '𝕏',
        maxChars:         280,
        premiumMaxChars:  25000,
        supportsThreads:  true,
        supportsMedia:    true,
        maxMediaCount:    4,
        supportsScheduling: true,
        workspaceType:    'threads',
        charCountMethod:  'twitter',
        authType:         'oauth2',
    },

    bluesky: {
        name:             'Bluesky',
        icon:             '🦋',
        maxChars:         300,
        supportsThreads:  true,
        supportsMedia:    true,
        maxMediaCount:    4,
        supportsScheduling: true,
        workspaceType:    'threads',
        charCountMethod:  'standard',
        authType:         'password',
    },

    linkedin: {
        name:             'LinkedIn',
        icon:             '💼',
        maxChars:         3000,
        supportsThreads:  false,
        supportsMedia:    true,
        maxMediaCount:    1,
        supportsScheduling: true,
        workspaceType:    'social',
        charCountMethod:  'standard',
        authType:         'oauth2',
    },

    telegram: {
        name:             'Telegram',
        icon:             '📱',
        maxChars:         4096,
        supportsThreads:  false,
        supportsMedia:    true,
        maxMediaCount:    10,
        supportsScheduling: true,
        workspaceType:    'social',
        charCountMethod:  'standard',
        authType:         'token',
    },

    facebook: {
        name:             'Facebook',
        icon:             '📘',
        maxChars:         63206,
        supportsThreads:  false,
        supportsMedia:    true,
        maxMediaCount:    10,
        supportsScheduling: true,
        workspaceType:    'social',
        charCountMethod:  'standard',
        authType:         'oauth2',
    },

    discord: {
        name:             'Discord',
        icon:             '💬',
        maxChars:         2000,
        supportsThreads:  false,
        supportsMedia:    true,
        maxMediaCount:    10,
        supportsScheduling: false, // Discord webhooks have no native scheduling
        workspaceType:    'social',
        charCountMethod:  'standard',
        authType:         'webhook',
    },

    reddit: {
        name:             'Reddit',
        icon:             '🟠',
        maxChars:         40000,
        supportsThreads:  false,
        supportsMedia:    true,
        maxMediaCount:    20,
        supportsScheduling: false, // Reddit API has no native scheduling
        workspaceType:    'social',
        charCountMethod:  'standard',
        authType:         'oauth2',
    },

    devto: {
        name:             'Dev.to',
        icon:             '👨‍💻',
        maxChars:         100000,
        supportsThreads:  false,
        supportsMedia:    true,
        maxMediaCount:    50,
        supportsScheduling: true,
        workspaceType:    'blogs',
        charCountMethod:  'standard',
        authType:         'api_key',
    },

    medium: {
        name:             'Medium',
        icon:             'Ⓜ️',
        maxChars:         100000,
        supportsThreads:  false,
        supportsMedia:    true,
        maxMediaCount:    50,
        supportsScheduling: true,
        workspaceType:    'blogs',
        charCountMethod:  'standard',
        authType:         'token',
    },
};

// ── Helper Functions ──────────────────────────────────────────────────────────

/**
 * Get a single platform's config by key.
 * Returns null if the platform is not registered.
 *
 * @example
 * const cfg = getPlatformConfig('x');
 * if (cfg) console.log(cfg.maxChars); // 280
 */
export function getPlatformConfig(platform: string): PlatformConfig | null {
    return PLATFORM_CONFIGS[platform] ?? null;
}

/**
 * Get all registered platform keys.
 *
 * @example
 * getAllPlatforms(); // ['x', 'bluesky', 'linkedin', ...]
 */
export function getAllPlatforms(): string[] {
    return Object.keys(PLATFORM_CONFIGS);
}

/**
 * Get all platforms that belong to a given workspace type.
 * Useful for rendering sidebar groups or workspace tabs.
 *
 * @example
 * getPlatformsByWorkspaceType('threads'); // ['x', 'bluesky']
 * getPlatformsByWorkspaceType('social');  // ['linkedin', 'telegram', ...]
 * getPlatformsByWorkspaceType('blogs');   // ['devto', 'medium']
 */
export function getPlatformsByWorkspaceType(type: WorkspaceType): string[] {
    return Object.entries(PLATFORM_CONFIGS)
        .filter(([, config]) => config.workspaceType === type)
        .map(([platform]) => platform);
}

/**
 * Resolve the effective character limit for a platform,
 * taking Premium status into account.
 *
 * @example
 * getEffectiveMaxChars('x', false); // 280
 * getEffectiveMaxChars('x', true);  // 25000
 */
export function getEffectiveMaxChars(platform: string, isPremium = false): number {
    const cfg = getPlatformConfig(platform);
    if (!cfg) return 280; // safe fallback
    return (isPremium && cfg.premiumMaxChars) ? cfg.premiumMaxChars : cfg.maxChars;
}

/**
 * Count characters using the platform's charCountMethod.
 * X replaces every URL with a 23-char t.co proxy before counting.
 *
 * @example
 * countChars('Check https://example.com out!', 'twitter'); // 31 (not 38)
 */
export function countChars(text: string, method: CharCountMethod): number {
    if (method !== 'twitter') return text.length;

    // Replace every URL with a 23-char placeholder (Twitter's t.co length)
    const URL_REGEX = /https?:\/\/\S+/gi;
    const twitterLength = text.replace(URL_REGEX, (url) =>
        'x'.repeat(Math.min(url.length, 23))
    ).length;

    return twitterLength;
}

/**
 * Check whether a given text is within the character limit for a platform.
 *
 * @example
 * isWithinLimit('Hello world', 'x', false); // true
 */
export function isWithinLimit(text: string, platform: string, isPremium = false): boolean {
    const cfg = getPlatformConfig(platform);
    if (!cfg) return true;
    const used = countChars(text, cfg.charCountMethod);
    const max  = getEffectiveMaxChars(platform, isPremium);
    return used <= max;
}