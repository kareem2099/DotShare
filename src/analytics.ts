import { HistoricalPost, AnalyticsSummary } from './types';

export class Analytics {
    public calculateAnalytics(history: HistoricalPost[]): AnalyticsSummary {
        const totalPosts = history.length;
        let successfulShares = 0;
        let failedShares = 0;
        let linkedinShares = 0;
        let telegramShares = 0;
        let xShares = 0;
        let facebookShares = 0;
        let discordShares = 0;
        let redditShares = 0;
        let blueskyShares = 0;

        for (const post of history) {
            for (const share of post.shares) {
                switch (share.platform) {
                    case 'linkedin': linkedinShares++; break;
                    case 'telegram': telegramShares++; break;
                    case 'x': xShares++; break;
                    case 'facebook': facebookShares++; break;
                    case 'discord': discordShares++; break;
                    case 'reddit': redditShares++; break;
                    case 'bluesky': blueskyShares++; break;
                }

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
            linkedinShares,
            telegramShares,
            xShares,
            facebookShares,
            discordShares,
            redditShares,
            blueskyShares,
            successRate
        };
    }
}
