import { ReleasePromptBuilder } from '../ReleasePromptBuilder';
import { ReleaseGenerationRequest } from '../../../types/dotshare-ai';

describe('ReleasePromptBuilder', () => {
    const mockRequest: ReleaseGenerationRequest = {
        context: {
            projectName: 'DotShare',
            version: '3.5.0',
            projectDescription: 'Share your code journey across platforms',
            changelogNotes: [
                'Added DotShare AI Release Copilot',
                'Added 5 writing tones'
            ],
            techStack: ['TypeScript', 'VS Code', 'Node.js']
        },
        targetPlatforms: ['devto'],
        tone: 'full_markdown_article',
        language: 'en',
        includeHashtags: true,
        includeCodeSnippets: true
    };

    it('should build strict Markdown prompt for Dev.to', () => {
        const prompt = ReleasePromptBuilder.buildPrompt(mockRequest, 'devto');

        expect(prompt).toContain('Target Platform: DEVTO');
        expect(prompt).toContain('STRICT PURE MARKDOWN OUTPUT ONLY');
        expect(prompt).toContain('YAML Frontmatter');
        expect(prompt).toContain('DotShare');
        expect(prompt).toContain('3.5.0');
    });

    it('should enforce 270-char safety budget for X posts and thread instructions', () => {
        const singleTweetReq: ReleaseGenerationRequest = {
            ...mockRequest,
            targetPlatforms: ['x'],
            tone: 'casual_build_in_public',
            threadMode: false
        };

        const singlePrompt = ReleasePromptBuilder.buildPrompt(singleTweetReq, 'x');
        expect(singlePrompt).toContain('Strictly under 270 characters');

        const threadReq: ReleaseGenerationRequest = {
            ...mockRequest,
            targetPlatforms: ['x'],
            tone: 'casual_build_in_public',
            threadMode: true
        };

        const threadPrompt = ReleasePromptBuilder.buildPrompt(threadReq, 'x');
        expect(threadPrompt).toContain('Format as a multi-tweet Thread');
        expect(threadPrompt).toContain('---TWEET---');
    });

    it('should configure Arabic instructions when language is ar', () => {
        const arabicReq: ReleaseGenerationRequest = {
            ...mockRequest,
            targetPlatforms: ['linkedin'],
            tone: 'professional',
            language: 'ar'
        };

        const prompt = ReleasePromptBuilder.buildPrompt(arabicReq, 'linkedin');
        expect(prompt).toContain('Arabic');
        expect(prompt).toContain('العربية الفصحى التقنية');
        expect(prompt).toContain('أسلوب رسمي واحترافي');
    });

    it('should include custom user focus angle when customPrompt is provided', () => {
        const customReq: ReleaseGenerationRequest = {
            ...mockRequest,
            customPrompt: 'Focus specifically on the memory optimization and 50% speedup in esbuild bundling'
        };

        const prompt = ReleasePromptBuilder.buildPrompt(customReq, 'linkedin');
        expect(prompt).toContain('USER FOCUS / SPECIFIC TOPIC TO EMPHASIZE:');
        expect(prompt).toContain('Focus specifically on the memory optimization and 50% speedup in esbuild bundling');
    });

    it('should inject CTA links and enforce strict URL fidelity rules', () => {
        const ctaReq: ReleaseGenerationRequest = {
            ...mockRequest,
            ctaLinks: [
                { id: 'repo', label: 'Repository', url: 'https://github.com/kareem2099/DotShare', emoji: '⭐', source: 'repository' },
                { id: 'demo', label: 'Live Demo', url: 'https://dotshare.dev', emoji: '🚀', source: 'saved' }
            ]
        };

        const prompt = ReleasePromptBuilder.buildPrompt(ctaReq, 'linkedin');
        expect(prompt).toContain('CALL TO ACTION (CTA) & LINKS:');
        expect(prompt).toContain('⭐ Repository: https://github.com/kareem2099/DotShare');
        expect(prompt).toContain('🚀 Live Demo: https://dotshare.dev');
        expect(prompt).toContain('URL FIDELITY & STRICT ACCURACY (HARD RULE):');
        expect(prompt).toContain('Copy every CTA URL verbatim');
        expect(prompt).toContain('NEVER invent, guess, autocomplete, rewrite, normalize, shorten, replace, or modify a URL');
    });

    it('should inject each exact CTA URL only once', () => {
        const req: ReleaseGenerationRequest = {
            ...mockRequest,
            ctaLinks: [
                {
                    id: 'repo',
                    label: 'Repository',
                    url: 'https://github.com/kareem2099/DotShare',
                    emoji: '⭐',
                    source: 'repository'
                },
                {
                    id: 'saved-repo',
                    label: 'GitHub',
                    url: 'https://github.com/kareem2099/DotShare',
                    emoji: '🔗',
                    source: 'saved'
                }
            ]
        };

        const prompt = ReleasePromptBuilder.buildPrompt(req, 'linkedin');

        const matches =
            prompt.match(/https:\/\/github\.com\/kareem2099\/DotShare/g) ?? [];

        expect(matches).toHaveLength(1);
    });

    it('should include repository URL in project context as metadata and strictly rule against publishing unselected URLs', () => {
        const reqWithRepoContext: ReleaseGenerationRequest = {
            ...mockRequest,
            context: {
                ...mockRequest.context,
                repoUrl: 'https://github.com/kareem2099/DotShare'
            },
            ctaLinks: [
                { id: 'demo', label: 'Live Demo', url: 'https://dotshare.dev', emoji: '🚀', source: 'saved' }
            ]
        };

        const prompt = ReleasePromptBuilder.buildPrompt(reqWithRepoContext, 'linkedin');
        
        // Metadata in PROJECT CONTEXT
        expect(prompt).toContain('Repository URL: https://github.com/kareem2099/DotShare');
        // CTA in CTA section
        expect(prompt).toContain('🚀 Live Demo: https://dotshare.dev');
        // Explicit instruction that URLs in PROJECT CONTEXT are metadata only
        expect(prompt).toContain('URLs present in the PROJECT CONTEXT (such as Repository URL) are strictly background metadata');
    });

    it('should include platform-specific URL budgeting notes for X and BlueSky', () => {
        const xPrompt = ReleasePromptBuilder.buildPrompt(mockRequest, 'x');
        expect(xPrompt).toContain('URLs count as exactly 23 characters toward the post limit because X wraps URLs with t.co');

        const bsPrompt = ReleasePromptBuilder.buildPrompt(mockRequest, 'bluesky');
        expect(bsPrompt).toContain('URLs consume their actual textual length');
    });
});
