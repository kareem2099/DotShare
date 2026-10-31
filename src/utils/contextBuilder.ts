import * as vscode from 'vscode';
import { HashtagContext } from '../services/HashtagService';
import { ProjectContextService } from '../services/ProjectContextService';
import { ReleasePromptBuilder } from '../ai/prompts/ReleasePromptBuilder';
import { SocialPlatform } from '../types';

export interface ContextBuilderResult {
    contextPrompt: string;
    hashtagContext: HashtagContext;
}

/** Legacy quick-post entry points share the same release evidence as the article composer. */
export async function buildProjectContext(): Promise<ContextBuilderResult | null> {
    if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return null;
    }
    const context = await ProjectContextService.buildContext(undefined, { maxSnippets: 3 });
    const configured = vscode.workspace.getConfiguration('dotshare').get<string>('defaultPlatform', 'twitter');
    const platforms: SocialPlatform[] = ['x', 'linkedin', 'telegram', 'discord', 'bluesky', 'mastodon', 'devto'];
    const platform = configured !== 'devto' && platforms.includes(configured as SocialPlatform) ? configured as SocialPlatform : 'x';
    const prompt = ReleasePromptBuilder.buildPrompt({
        context, targetPlatforms: [platform], tone: 'casual_build_in_public', language: 'en',
        includeHashtags: false, includeCodeSnippets: false
    }, platform);
    const technology = (context.techStack || []).join(' ').toLowerCase();
    const projectType = technology.includes('python') ? 'python' : technology.includes('rust') ? 'rust'
        : technology.includes('node') ? 'node' : /\bgo\b/.test(technology) ? 'go' : 'generic';
    return {
        // Quick-post APIs have a small output budget; full Dev.to articles use the release composer.
        contextPrompt: `${prompt}\nQuick-post mode: return a complete short social update under 240 characters, with no frontmatter, code, URLs or hashtags.`,
        hashtagContext: { projectType, projectName: context.projectName, keywords: context.techStack || [],
            gitChanges: context.recentCommits?.join('\n'), postContent: '' }
    };
}
