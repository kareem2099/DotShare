import * as vscode from 'vscode';
import axios from 'axios';
import { Logger } from '../utils/Logger';

// Auth server URL — same server that issued the token
export const AUTH_SERVER_URL = 'https://dotshare-auth-server.vercel.app';

// Refresh 5 minutes before expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

type RefreshablePlatform = 'x' | 'reddit' | 'facebook';

export class TokenManager {
    private static _context: vscode.ExtensionContext;

    static init(context: vscode.ExtensionContext): void {
        this._context = context;
    }

    // ── Store token + expiry after OAuth callback ─────────────────────────────

    static async storeToken(
        platform: RefreshablePlatform,
        accessToken: string,
        refreshToken?: string,
        expiresIn?: number
    ): Promise<void> {
        switch (platform) {
            case 'x':
                await this._context.secrets.store('xAccessToken', accessToken);
                if (refreshToken) await this._context.secrets.store('xRefreshToken', refreshToken);
                break;
            case 'reddit':
                await this._context.secrets.store('redditAccessToken', accessToken);
                if (refreshToken) await this._context.secrets.store('redditRefreshToken', refreshToken);
                break;
            case 'facebook':
                await this._context.secrets.store('facebookToken', accessToken);
                break;
        }

        // Store expires_at as timestamp
        if (expiresIn) {
            const expiresAt = Date.now() + expiresIn * 1000;
            await this._context.secrets.store(
                `${platform}_expires_at`,
                String(expiresAt)
            );
            Logger.info(`TokenManager: stored ${platform} token, expires at ${new Date(expiresAt).toISOString()}`);
        }
    }

    // ── Check if token needs refresh ──────────────────────────────────────────

    static async isExpiringSoon(platform: RefreshablePlatform): Promise<boolean> {
        const expiresAtStr = await this._context.secrets.get(`${platform}_expires_at`);
        if (!expiresAtStr) return false; // No expiry info → assume valid

        const expiresAt = Number(expiresAtStr);
        return Date.now() + REFRESH_BUFFER_MS >= expiresAt;
    }

    // ── Get a valid token — refresh if needed ─────────────────────────────────

    static async getValidToken(platform: 'x'): Promise<string>;
    static async getValidToken(platform: 'reddit'): Promise<string>;
    static async getValidToken(platform: 'facebook'): Promise<string>;
    static async getValidToken(platform: RefreshablePlatform): Promise<string> {
        const expiring = await this.isExpiringSoon(platform);

        if (expiring) {
            Logger.info(`TokenManager: ${platform} token expiring soon, refreshing...`);
            try {
                await this.refresh(platform);
            } catch (error) {
                Logger.warn(`TokenManager: ${platform} refresh failed, using existing token`, error);
            }
        }

        switch (platform) {
            case 'x':
                return await this._context.secrets.get('xAccessToken') || '';
            case 'reddit':
                return await this._context.secrets.get('redditAccessToken') || '';
            case 'facebook':
                return await this._context.secrets.get('facebookToken') || '';
        }
    }

    // ── Refresh logic per platform ────────────────────────────────────────────

    /** Wraps axios.post, turning a 429 into a friendly error with retry info. */
    private static async post<T>(url: string, data: unknown): Promise<{ data: T }> {
        try {
            return await axios.post<T>(url, data);
        } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 429) {
                const retryAfter = err.response.headers['retry-after'] ?? '60';
                throw new Error(`Rate limited by auth server. Retry after ${retryAfter}s`);
            }
            throw err;
        }
    }

    private static async refresh(platform: RefreshablePlatform): Promise<void> {
        switch (platform) {
            case 'x':       return this.refreshX();
            case 'reddit':  return this.refreshReddit();
            case 'facebook': return this.extendFacebook();
        }
    }

    private static async refreshX(): Promise<void> {
        const refreshToken = await this._context.secrets.get('xRefreshToken');
        if (!refreshToken) throw new Error('No X refresh token stored');

        const res = await this.post<{ access_token: string; refresh_token?: string; expires_in?: number }>(
            `${AUTH_SERVER_URL}/api/auth/x/refresh`,
            { refreshToken }
        );
        const { access_token, refresh_token, expires_in } = res.data;

        await this._context.secrets.store('xAccessToken', access_token);

        // X rotates refresh token on every use
        if (refresh_token) {
            await this._context.secrets.store('xRefreshToken', refresh_token);
        }

        if (expires_in) {
            await this._context.secrets.store(
                'x_expires_at',
                String(Date.now() + expires_in * 1000)
            );
        }

        Logger.info('TokenManager: X token refreshed ✅');
    }

    private static async refreshReddit(): Promise<void> {
        const refreshToken = await this._context.secrets.get('redditRefreshToken');
        if (!refreshToken) throw new Error('No Reddit refresh token stored');

        const res = await this.post<{ access_token: string; refresh_token?: string; expires_in?: number }>(
            `${AUTH_SERVER_URL}/api/auth/reddit/refresh`,
            { refreshToken }
        );
        const { access_token, refresh_token, expires_in } = res.data;

        await this._context.secrets.store('redditAccessToken', access_token);
        
        // Reddit may rotate refresh tokens
        if (refresh_token) {
            await this._context.secrets.store('redditRefreshToken', refresh_token);
        }

        if (expires_in) {
            const expiresAt = Date.now() + expires_in * 1000;
            await this._context.secrets.store(
                'reddit_expires_at',
                String(expiresAt)
            );
            Logger.info(`TokenManager: Reddit token refreshed, expires at ${new Date(expiresAt).toISOString()} ✅`);
        } else {
            Logger.info('TokenManager: Reddit token refreshed ✅');
        }
    }

    private static async extendFacebook(): Promise<void> {
        const accessToken = await this._context.secrets.get('facebookToken');
        if (!accessToken) throw new Error('No Facebook token stored');

        const res = await this.post<{ access_token: string; expires_in?: number }>(
            `${AUTH_SERVER_URL}/api/auth/facebook/extend`,
            { accessToken }
        );
        const { access_token, expires_in } = res.data;

        await this._context.secrets.store('facebookToken', access_token);

        if (expires_in) {
            await this._context.secrets.store(
                'facebook_expires_at',
                String(Date.now() + expires_in * 1000)
            );
        }

        Logger.info('TokenManager: Facebook token extended ✅ (60 days)');
    }

    // ── Manual refresh trigger (from UI "Reconnect" button) ───────────────────

    static async forceRefresh(platform: RefreshablePlatform): Promise<boolean> {
        try {
            await this.refresh(platform);
            return true;
        } catch (error) {
            Logger.error(`TokenManager: force refresh failed for ${platform}`, error);
            return false;
        }
    }

    // ── Clear token + expiry on disconnect ────────────────────────────────────

    static async clearToken(platform: RefreshablePlatform): Promise<void> {
        await this._context.secrets.delete(`${platform}_expires_at`);
        switch (platform) {
            case 'x':
                await this._context.secrets.delete('xAccessToken');
                await this._context.secrets.delete('xRefreshToken');
                break;
            case 'reddit':
                await this._context.secrets.delete('redditAccessToken');
                await this._context.secrets.delete('redditRefreshToken');
                break;
            case 'facebook':
                await this._context.secrets.delete('facebookToken');
                break;
        }
        Logger.info(`TokenManager: ${platform} token cleared`);
    }
}