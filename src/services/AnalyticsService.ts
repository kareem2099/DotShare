import { HistoricalPost, AnalyticsSummary } from '../types';

export class AnalyticsService {
    public calculate(history: HistoricalPost[]): AnalyticsSummary {
        const totalPosts = history.length;
        let successfulShares = 0;
        let failedShares = 0;

        // Initialize counters dynamically or statically as you prefer
        const platformCounts: Record<string, number> = {
            linkedin: 0, telegram: 0, x: 0, facebook: 0,
            discord: 0, reddit: 0, bluesky: 0
        };

        for (const post of history) {
            for (const share of post.shares) {
                if (platformCounts[share.platform] !== undefined) {
                    platformCounts[share.platform]++;
                }
                share.success ? successfulShares++ : failedShares++;
            }
        }

        const totalShares = successfulShares + failedShares;
        const successRate = totalShares > 0 ? Math.round((successfulShares / totalShares) * 100) : 0;

        return {
            totalPosts,
            successfulShares,
            failedShares,
            linkedinShares: platformCounts['linkedin'],
            telegramShares: platformCounts['telegram'],
            xShares: platformCounts['x'],
            facebookShares: platformCounts['facebook'],
            discordShares: platformCounts['discord'],
            redditShares: platformCounts['reddit'],
            blueskyShares: platformCounts['bluesky'],
            successRate
        };
    }
}
