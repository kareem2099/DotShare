export interface PlatformCredentials {
    linkedinToken?: string;
    telegramBot?: string;
    telegramChat?: string;
    xAccessToken?: string;
    xAccessSecret?: string;
    facebookToken?: string;
    facebookPageToken?: string;
    facebookPageId?: string;
    discordWebhookUrl?: string;
    redditAccessToken?: string;
    redditRefreshToken?: string;
    redditSubreddit?: string;       // ✅ added
    blueskyIdentifier?: string;
    blueskyPassword?: string;
}

export class CredentialProvider {
    private credentials?: PlatformCredentials;
    private credentialsGetter?: () => Promise<PlatformCredentials>;

    constructor(
        credentials?: PlatformCredentials,
        credentialsGetter?: () => Promise<PlatformCredentials>
    ) {
        this.credentials = credentials;
        this.credentialsGetter = credentialsGetter;
    }

    private async resolve(): Promise<PlatformCredentials> {
        if (this.credentialsGetter) {
            return await this.credentialsGetter();
        }
        return this.credentials ?? {};
    }

    public async getLinkedInToken(): Promise<string | undefined> {
        return (await this.resolve()).linkedinToken;
    }

    public async getTelegramCredentials(): Promise<{ botToken?: string; chatId?: string }> {
        const c = await this.resolve();
        return { botToken: c.telegramBot, chatId: c.telegramChat };
    }

    public async getXCredentials(): Promise<{ accessToken?: string; accessSecret?: string }> {
        const c = await this.resolve();
        return { accessToken: c.xAccessToken, accessSecret: c.xAccessSecret };
    }

    public async getFacebookCredentials(): Promise<{ token?: string; pageToken?: string; pageId?: string }> {
        const c = await this.resolve();
        return { token: c.facebookToken, pageToken: c.facebookPageToken, pageId: c.facebookPageId };
    }

    public async getDiscordWebhookUrl(): Promise<string | undefined> {
        return (await this.resolve()).discordWebhookUrl;
    }

    public async getRedditCredentials(): Promise<{ accessToken?: string; refreshToken?: string }> {
        const c = await this.resolve();
        return { accessToken: c.redditAccessToken, refreshToken: c.redditRefreshToken };
    }

    public async getRedditSubreddit(): Promise<string | undefined> {   // ✅ added
        return (await this.resolve()).redditSubreddit;
    }

    public async getBlueSkyCredentials(): Promise<{ identifier?: string; password?: string }> {
        const c = await this.resolve();
        return { identifier: c.blueskyIdentifier, password: c.blueskyPassword };
    }
}