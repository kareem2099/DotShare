import { HistoricalPost, AnalyticsSummary, SocialPlatform } from '../types';

export class AnalyticsService {
    public calculate(history: HistoricalPost[]): AnalyticsSummary {
        const totalPosts = history.length;
        let successfulShares = 0;
        let failedShares = 0;

        // Build counters dynamically — no manual sync needed when SocialPlatform grows
        const platformCounts: Partial<Record<SocialPlatform, number>> = {};

        for (const post of history) {
            for (const share of post.shares) {
                platformCounts[share.platform] = (platformCounts[share.platform] ?? 0) + 1;
                if (share.success) {
                    successfulShares++;
                } else {
                    failedShares++;
                }
            }
        }

        const totalShares = successfulShares + failedShares;
        const successRate = totalShares > 0 ? Math.round((successfulShares / totalShares) * 100) : 0;

        return {
            totalPosts,
            successfulShares,
            failedShares,
            linkedinShares: platformCounts['linkedin'] ?? 0,
            telegramShares: platformCounts['telegram'] ?? 0,
            xShares:        platformCounts['x']        ?? 0,

            discordShares:  platformCounts['discord']  ?? 0,

            blueskyShares:  platformCounts['bluesky']  ?? 0,
            devtoShares:    platformCounts['devto']    ?? 0,

            successRate
        };
    }
}
