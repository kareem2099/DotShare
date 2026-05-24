import * as vscode from 'vscode';
import { TierInfo } from '../types';
import { Logger } from '../utils/Logger';
import { DOTSUITE_CORE_API_URL } from '../constants';


export class DotShareAuth {
    private static readonly TOKEN_KEY = 'DOTSHARE_API_TOKEN';
    // Production Railway backend — override with DOTSUITE_API_URL env var for development
    private static API_BASE_URL = process.env.DOTSUITE_API_URL || DOTSUITE_CORE_API_URL;
    
    private static cachedTierInfo: TierInfo | null = null;

    /**
     * Configure the API base URL (useful for testing or remote backends)
     */
    public static setApiBaseUrl(url: string): void {
        this.API_BASE_URL = url;
        Logger.info(`[DotShareAuth] API base URL set to: ${url}`);
    }

    /**
     * Get the current API base URL
     */
    public static getApiBaseUrl(): string {
        return this.API_BASE_URL;
    }

    /**
     * Store the token in secure storage.
     */
    public static async storeToken(context: vscode.ExtensionContext, token: string): Promise<void> {
        // Validate token format before storing
        if (!token || typeof token !== 'string') {
            throw new Error('Invalid token: token must be a non-empty string');
        }

        // URL decode the token in case it was URL-encoded during transmission
        const decodedToken = decodeURIComponent(token);
        
        Logger.info(`[DotShareAuth] Raw token received: ${token?.substring(0, 20)}...`);
        Logger.info(`[DotShareAuth] Token length before decode: ${token?.length}`);
        Logger.info(`[DotShareAuth] Token length after decode: ${decodedToken.length}`);
        Logger.info(`[DotShareAuth] Decoded token starts with ds_prod_: ${decodedToken.startsWith('ds_prod_')}`);
        
        // Validate token format: should start with 'ds_prod_' and be 56 chars total
        if (!decodedToken.startsWith('ds_prod_') || decodedToken.length !== 56) {
            Logger.warn(`[DotShareAuth] Invalid token format: starts with "${decodedToken.substring(0, 8)}", length=${decodedToken.length}`);
            throw new Error(`Invalid token format: expected ds_prod_* with length 56, got length ${decodedToken.length}`);
        }

        await context.secrets.store(this.TOKEN_KEY, decodedToken);
        Logger.info('[DotShareAuth] Token stored successfully.');
        // Fetch and cache tier info immediately after storing
        await this.fetchTierInfo(context);
    }

    /**
     * Retrieve the stored token.
     */
    public static async getToken(context: vscode.ExtensionContext): Promise<string | undefined> {
        return await context.secrets.get(this.TOKEN_KEY);
    }

    /**
     * Verify if the token is valid by pinging the backend.
     *
     * Returns:
     *  - `{ valid: true }`                           → token accepted by backend
     *  - `{ valid: false, reason: 'unauthorized' }`  → backend rejected the token (401/403)
     *  - `{ valid: false, reason: 'server_error' }`  → backend 5xx or unreachable
     */
    public static async verifyToken(
        context: vscode.ExtensionContext
    ): Promise<{ valid: boolean; reason?: 'unauthorized' | 'server_error' }> {
        const token = await this.getToken(context);
        if (!token) {
            Logger.warn('[DotShareAuth] No token found for verification');
            return { valid: false, reason: 'unauthorized' };
        }

        try {
            const url = `${this.API_BASE_URL}/v1/ping`;
            Logger.info(`[DotShareAuth] Verifying token with backend at: ${url}`);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                // Abort after 10 s so the user isn't left waiting
                signal: AbortSignal.timeout(10_000),
            });

            if (response.ok) {
                Logger.info('[DotShareAuth] Token verification successful');
                return { valid: true };
            }

            const responseText = await response.text().catch(() => '');
            Logger.warn(
                `[DotShareAuth] Token verification failed: HTTP ${response.status} — ${responseText}`
            );

            // 401 / 403 → the token itself is invalid
            if (response.status === 401 || response.status === 403) {
                return { valid: false, reason: 'unauthorized' };
            }

            // 5xx or anything else → backend problem, not a bad token
            return { valid: false, reason: 'server_error' };

        } catch (error) {
            // Network error, DNS failure, timeout, etc.
            Logger.error('[DotShareAuth] Error verifying token (network):', error);
            return { valid: false, reason: 'server_error' };
        }
    }

    /**
     * Fetch user tier and quota information from the billing endpoint.
     */
    public static async fetchTierInfo(context: vscode.ExtensionContext): Promise<TierInfo | null> {
        const token = await this.getToken(context);
        if (!token) {
            Logger.warn('[DotShareAuth] Cannot fetch tier info: No token found.');
            return null;
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}/v1/billing/status`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json() as TierInfo;
                this.cachedTierInfo = data;
                Logger.info('[DotShareAuth] Tier info fetched successfully:', data);
                return data;
            } else {
                Logger.warn('[DotShareAuth] Failed to fetch tier info. Status:', response.status);
                return null;
            }
        } catch (error) {
            Logger.error('[DotShareAuth] Error fetching tier info:', error);
            return null;
        }
    }

    /**
     * Get the cached tier info (or fetch if not available).
     */
    public static async getTierInfo(context: vscode.ExtensionContext): Promise<TierInfo | null> {
        if (this.cachedTierInfo) {
            return this.cachedTierInfo;
        }
        return await this.fetchTierInfo(context);
    }

    /**
     * Clear the stored token.
     */
    public static async logout(context: vscode.ExtensionContext): Promise<void> {
        await context.secrets.delete(this.TOKEN_KEY);
        this.cachedTierInfo = null;
        Logger.info('[DotShareAuth] Logged out successfully.');
    }
}
