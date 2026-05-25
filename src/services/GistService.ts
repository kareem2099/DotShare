import * as vscode from 'vscode';
import axios from 'axios';
import { Logger } from '../utils/Logger';

export class GistService {
    /**
     * Authenticates with GitHub using VS Code's built-in provider and creates a Gist.
     * @param files Record of filename to { content }
     * @param description Description of the Gist
     * @param isPublic Whether the gist is public
     * @returns The HTML URL of the created Gist, or null if failed/cancelled.
     */
    public static async createGist(
        files: Record<string, { content: string }>,
        description: string,
        isPublic: boolean,
        forceNewSession: boolean = false
    ): Promise<string | null> {
        try {
            // Get GitHub authentication session
            const session = await vscode.authentication.getSession('github', ['gist'], { createIfNone: true, forceNewSession });
            if (!session) {
                Logger.warn('[GistService] GitHub authentication was cancelled or failed.');
                return null;
            }

            const token = session.accessToken;

            const response = await axios.post(
                'https://api.github.com/gists',
                {
                    description,
                    public: isPublic,
                    files
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/vnd.github.v3+json',
                        'X-GitHub-Api-Version': '2022-11-28'
                    }
                }
            );

            if (response.data && response.data.html_url) {
                return response.data.html_url;
            }

            return null;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 401 && !forceNewSession) {
                Logger.warn('[GistService] Token expired or invalid, retrying with new session...');
                return this.createGist(files, description, isPublic, true);
            }
            
            Logger.error('[GistService] Failed to create Gist', error);
            const errorMessage = axios.isAxiosError(error) && error.response?.data?.message 
                ? error.response.data.message 
                : (error instanceof Error ? error.message : String(error));
            throw new Error(`Gist creation failed: ${errorMessage}`);
        }
    }
}
