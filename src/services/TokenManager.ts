import * as vscode from 'vscode';
import axios from 'axios';
import { Logger } from '../utils/Logger';

// Auth server URL — same server that issued the token
export const AUTH_SERVER_URL = 'https://dotshare-auth-server.vercel.app';

// Refresh 5 minutes before expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

type RefreshablePlatform = 'x' | 'reddit' | 'facebook';

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    expires_at?: number;         // Aegis 1.4.0: Unix timestamp in seconds
    should_refresh_soon?: boolean; // Aegis 1.4.0: Flag for proactive refresh
    warning?: string;             // Aegis 1.4.0: Optional warnings (e.g. rotation loss)
}

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
        expiresIn?: number,
        expiresAtSec?: number,
        shouldRefreshSoon?: boolean
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

        // AEGIS 1.4.0: Prefer absolute expires_at if provided
        let expiresAtMs: number | undefined;
        if (expiresAtSec) {
            expiresAtMs = expiresAtSec * 1000;
        } else if (expiresIn) {
            expiresAtMs = Date.now() + expiresIn * 1000;
        }

        if (expiresAtMs) {
            await this._context.secrets.store(`${platform}_expires_at`, String(expiresAtMs));
            Logger.info(`[TokenManager] stored ${platform} token, expires at ${new Date(expiresAtMs).toISOString()}`);
        }

        if (shouldRefreshSoon !== undefined) {
          await this._context.globalState.update(`${platform}_should_refresh_soon`, shouldRefreshSoon);
        }
    }

    // ── Check if token needs refresh ──────────────────────────────────────────

    static async isExpiringSoon(platform: RefreshablePlatform): Promise<boolean> {
        // Proactive flag from Aegis 1.4.0
        const serverFlag = this._context.globalState.get<boolean>(`${platform}_should_refresh_soon`);
        if (serverFlag) return true;

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
            Logger.info(`[TokenManager] ${platform} token expiring soon, refreshing...`);
            try {
                await this.refresh(platform);
            } catch (error) {
                Logger.warn(`[TokenManager] ${platform} refresh failed, using existing token`, error);
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

        const res = await this.post<TokenResponse>(
            `${AUTH_SERVER_URL}/api/auth/x/refresh`,
            { refreshToken }
        );
        
        await this.handleEnrichedResponse('x', res.data);
    }

    private static async refreshReddit(): Promise<void> {
        const refreshToken = await this._context.secrets.get('redditRefreshToken');
        if (!refreshToken) throw new Error('No Reddit refresh token stored');

        const res = await this.post<TokenResponse>(
            `${AUTH_SERVER_URL}/api/auth/reddit/refresh`,
            { refreshToken }
        );
        
        await this.handleEnrichedResponse('reddit', res.data);
    }

    private static async extendFacebook(): Promise<void> {
        const accessToken = await this._context.secrets.get('facebookToken');
        if (!accessToken) throw new Error('No Facebook token stored');

        const res = await this.post<TokenResponse>(
            `${AUTH_SERVER_URL}/api/auth/facebook/extend`,
            { accessToken }
        );
        
        await this.handleEnrichedResponse('facebook', res.data);
    }

    /** AEGIS 1.4.0: Unified handler for enriched responses */
    private static async handleEnrichedResponse(platform: RefreshablePlatform, data: TokenResponse): Promise<void> {
        const { access_token, refresh_token, expires_in, expires_at, should_refresh_soon, warning } = data;

        // 1. Store Access Token
        const secretKey = platform === 'facebook' ? 'facebookToken' : `${platform}AccessToken`;
        await this._context.secrets.store(secretKey, access_token);

        // 2. Store Refresh Token (if provided/rotated)
        if (refresh_token) {
            await this._context.secrets.store(`${platform}RefreshToken`, refresh_token);
        }

        // 3. Handle Expiry (Prefer server-provided expires_at)
        let expiresAtMs: number | undefined;
        if (expires_at) {
            expiresAtMs = expires_at * 1000;
        } else if (expires_in) {
            expiresAtMs = Date.now() + expires_in * 1000;
        }

        if (expiresAtMs) {
            await this._context.secrets.store(`${platform}_expires_at`, String(expiresAtMs));
            Logger.info(`[TokenManager] ${platform} token updated, expires at ${new Date(expiresAtMs).toISOString()} ✅`);
        }

        // 4. Proactive Flag
        if (should_refresh_soon !== undefined) {
             await this._context.globalState.update(`${platform}_should_refresh_soon`, should_refresh_soon);
        } else {
             await this._context.globalState.update(`${platform}_should_refresh_soon`, false);
        }

        // 5. Warnings (specifically X rotation failure)
        if (warning === 'refresh_token_missing_reauth_required') {
            vscode.window.showWarningMessage(
                `DotShare: ${platform.toUpperCase()} session is valid but refresh token was lost. Please reconnect soon.`,
                'Reconnect'
            );
        }
    }

    // ── Manual refresh trigger (from UI "Reconnect" button) ───────────────────

    static async forceRefresh(platform: RefreshablePlatform): Promise<boolean> {
        try {
            await this.refresh(platform);
            return true;
        } catch (error) {
            Logger.error(`[TokenManager] force refresh failed for ${platform}`, error);
            return false;
        }
    }

    // ── Clear token + expiry on disconnect ────────────────────────────────────

    static async clearToken(platform: RefreshablePlatform): Promise<void> {
        await this._context.secrets.delete(`${platform}_expires_at`);
        await this._context.globalState.update(`${platform}_should_refresh_soon`, undefined);
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
        Logger.info(`[TokenManager] ${platform} token cleared`);
    }
}