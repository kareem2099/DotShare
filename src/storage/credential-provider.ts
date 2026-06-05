export interface PlatformCredentials {
    linkedinToken?: string;
    telegramBot?: string;
    telegramChat?: string;
    xAccessToken?: string;
    xAccessSecret?: string;

    discordWebhookUrl?: string;
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



    public async getDiscordWebhookUrl(): Promise<string | undefined> {
        return (await this.resolve()).discordWebhookUrl;
    }


    public async getBlueSkyCredentials(): Promise<{ identifier?: string; password?: string }> {
        const c = await this.resolve();
        return { identifier: c.blueskyIdentifier, password: c.blueskyPassword };
    }
}