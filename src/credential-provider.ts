

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

    public async getLinkedInToken(): Promise<string | undefined> {
        if (this.credentialsGetter) {
            const freshCredentials = await this.credentialsGetter();
            return freshCredentials.linkedinToken;
        }
        return this.credentials?.linkedinToken;
    }

    public async getTelegramCredentials(): Promise<{botToken?: string, chatId?: string}> {
        if (this.credentialsGetter) {
            const freshCredentials = await this.credentialsGetter();
            return {
                botToken: freshCredentials.telegramBot,
                chatId: freshCredentials.telegramChat
            };
        }
        return {
            botToken: this.credentials?.telegramBot,
            chatId: this.credentials?.telegramChat
        };
    }

    public async getXCredentials(): Promise<{accessToken?: string, accessSecret?: string}> {
        if (this.credentialsGetter) {
            const freshCredentials = await this.credentialsGetter();
            return {
                accessToken: freshCredentials.xAccessToken,
                accessSecret: freshCredentials.xAccessSecret
            };
        }
        return {
            accessToken: this.credentials?.xAccessToken,
            accessSecret: this.credentials?.xAccessSecret
        };
    }

    public async getFacebookCredentials(): Promise<{token?: string, pageToken?: string, pageId?: string}> {
        if (this.credentialsGetter) {
            const freshCredentials = await this.credentialsGetter();
            return {
                token: freshCredentials.facebookToken,
                pageToken: freshCredentials.facebookPageToken,
                pageId: freshCredentials.facebookPageId
            };
        }
        return {
            token: this.credentials?.facebookToken,
            pageToken: this.credentials?.facebookPageToken,
            pageId: this.credentials?.facebookPageId
        };
    }

    public async getDiscordWebhookUrl(): Promise<string | undefined> {
        if (this.credentialsGetter) {
            const freshCredentials = await this.credentialsGetter();
            return freshCredentials.discordWebhookUrl;
        }
        return this.credentials?.discordWebhookUrl;
    }

    public async getRedditCredentials(): Promise<{accessToken?: string, refreshToken?: string}> {
        if (this.credentialsGetter) {
            const freshCredentials = await this.credentialsGetter();
            return {
                accessToken: freshCredentials.redditAccessToken,
                refreshToken: freshCredentials.redditRefreshToken
            };
        }
        return {
            accessToken: this.credentials?.redditAccessToken,
            refreshToken: this.credentials?.redditRefreshToken
        };
    }

    public async getBlueSkyCredentials(): Promise<{identifier?: string, password?: string}> {
        if (this.credentialsGetter) {
            const freshCredentials = await this.credentialsGetter();
            return {
                identifier: freshCredentials.blueskyIdentifier,
                password: freshCredentials.blueskyPassword
            };
        }
        return {
            identifier: this.credentials?.blueskyIdentifier,
            password: this.credentials?.blueskyPassword
        };
    }
}
