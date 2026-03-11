import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { detectProjectType, fileExists } from '../utils/projectDetector';

const execAsync = promisify(exec);

export interface HashtagContext {
    projectType: string;
    projectName?: string;  // Real name from package.json/Cargo.toml or workspace folder
    keywords: string[];
    activeFile?: string;
    gitChanges?: string;
    postContent: string;
}

export interface HashtagSuggestion {
    hashtag: string;
    relevance: number; // 0-1 scale
    reason: string;
}

export class HashtagService {
    private static readonly LANGUAGE_HASHTAGS: { [key: string]: string[] } = {
        'node': ['#JavaScript', '#NodeJS', '#TypeScript', '#NPM', '#Express', '#React', '#Vue', '#Angular'],
        'rust': ['#Rust', '#SystemsProgramming', '#MemorySafety', '#WebAssembly', '#Cargo'],
        'python': ['#Python', '#Django', '#Flask', '#Pandas', '#NumPy', '#MachineLearning', '#DataScience'],
        'go': ['#GoLang', '#Golang', '#Microservices', '#Docker', '#Kubernetes', '#CloudNative'],
        'java': ['#Java', '#Spring', '#SpringBoot', '#Maven', '#Gradle', '#Hibernate'],
        'dotnet': ['#CSharp', '#DotNet', '#ASPNET', '#EntityFramework', '#Xamarin', '#MAUI'],
        'web': ['#WebDev', '#Frontend', '#Backend', '#FullStack', '#CSS', '#HTML', '#JavaScript'],
        'docker': ['#Docker', '#Containerization', '#DevOps', '#Kubernetes', '#Microservices', '#Cloud'],
        'generic': ['#Programming', '#Code', '#Developer', '#SoftwareEngineering', '#Tech']
    };

    private static readonly TRENDING_HASHTAGS: string[] = [
        '#AI', '#MachineLearning', '#OpenSource', '#GitHub', '#DevCommunity',
        '#100DaysOfCode', '#CodeNewbie', '#WebDevelopment', '#MobileDev', '#CloudComputing'
    ];

    private static readonly PLATFORM_SPECIFIC: { [key: string]: string[] } = {
        'linkedin': ['#Tech', '#Innovation', '#Professional', '#Career', '#Industry'],
        'twitter': ['#TechTwitter', '#DevTwitter', '#Code', '#Programming', '#Startup'],
        'telegram': ['#Tech', '#Crypto', '#Blockchain', '#Programming', '#OpenSource'],
        'facebook': ['#Tech', '#Programming', '#Developer', '#Code', '#Innovation'],
        'discord': ['#Gaming', '#Tech', '#Programming', '#Community', '#Code'],
        'reddit': ['#Programming', '#Technology', '#Dev', '#Code', '#Tech'],
        'bluesky': ['#Tech', '#Programming', '#OpenSource', '#Web3', '#Decentralized']
    };

    /** Platforms where hashtags have no functional effect and should NOT be appended */
    private static readonly HASHTAG_UNSUPPORTED_PLATFORMS = new Set(['reddit', 'discord']);

    /**
     * Returns true if the given platform supports/benefits from hashtags.
     * Use this before appending hashtags to a post.
     */
    public static supportsHashtags(platform: string): boolean {
        return !this.HASHTAG_UNSUPPORTED_PLATFORMS.has(platform.toLowerCase());
    }

    /**
     * 1. Get Custom Hashtags from VS Code Settings
     */
    private static getCustomHashtags(): HashtagSuggestion[] {
        try {
            const config = vscode.workspace.getConfiguration('dotshare');
            const customTags: string[] = config.get('customHashtags', []);

            return customTags.map(tag => ({
                hashtag: tag.startsWith('#') ? tag : `#${tag}`,
                relevance: 1.0,
                reason: 'User custom settings'
            }));
        } catch {
            return [];
        }
    }

    /**
     * Generate smart hashtags with limit and Error Boundary
     */
    public static async generateHashtags(
        context: HashtagContext,
        platform = 'twitter',
        limit = 5
    ): Promise<HashtagSuggestion[]> {
        try {
            const suggestions: HashtagSuggestion[] = [];

            suggestions.push(...this.getCustomHashtags());
            suggestions.push(...this.getTechnologyHashtags(context.projectType, context.keywords));
            suggestions.push(...this.getContentBasedHashtags(context.postContent));
            suggestions.push(...this.getPlatformHashtags(platform));
            suggestions.push(...this.getTrendingHashtags(context.postContent));
            suggestions.push(...this.getProjectHashtags(context));
            suggestions.push(...this.getGitBasedHashtags(context.gitChanges));

            const uniqueSuggestions = this.removeDuplicates(suggestions);
            return uniqueSuggestions.sort((a, b) => b.relevance - a.relevance).slice(0, limit);

        } catch (error) {
            console.error('[DotShare] Error generating hashtags:', error);
            return [
                { hashtag: '#Programming', relevance: 0.5, reason: 'Fallback' },
                { hashtag: '#Code', relevance: 0.5, reason: 'Fallback' }
            ].slice(0, limit);
        }
    }

    private static getTechnologyHashtags(projectType: string, keywords: string[]): HashtagSuggestion[] {
        const suggestions: HashtagSuggestion[] = [];
        const baseHashtags = this.LANGUAGE_HASHTAGS[projectType] || this.LANGUAGE_HASHTAGS['generic'];

        baseHashtags.forEach(hashtag => {
            suggestions.push({ hashtag, relevance: 0.8, reason: `Project type: ${projectType}` });
        });

        keywords.forEach(keyword => {
            const cleanKeyword = keyword.replace(/\s+/g, '');
            if (cleanKeyword.length > 2) {
                suggestions.push({ hashtag: `#${cleanKeyword}`, relevance: 0.9, reason: `Project keyword: ${keyword}` });
            }
        });

        return suggestions;
    }

    private static getContentBasedHashtags(content: string): HashtagSuggestion[] {
        if (!content) return [];

        const suggestions: HashtagSuggestion[] = [];
        const words = content.toLowerCase().split(/[^a-zA-Z0-9]/).filter(w => w.length > 2);

        const techTerms = [
            'api', 'backend', 'frontend', 'mobile', 'web', 'desktop', 'cli', 'ui', 'ux',
            'performance', 'security', 'testing', 'debugging', 'refactoring', 'architecture',
            'design', 'database', 'cache', 'authentication', 'authorization', 'deployment',
            'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'cicd', 'devops', 'monitoring', 'nodejs'
        ];

        const foundTerms = new Set<string>();

        words.forEach(word => {
            if (techTerms.includes(word)) foundTerms.add(word);
        });

        foundTerms.forEach(term => {
            suggestions.push({
                hashtag: `#${term.charAt(0).toUpperCase() + term.slice(1)}`,
                relevance: 0.7,
                reason: `Content mentions: ${term}`
            });
        });

        return suggestions;
    }

    private static getPlatformHashtags(platform: string): HashtagSuggestion[] {
        const platformHashtags = this.PLATFORM_SPECIFIC[platform.toLowerCase()] || this.PLATFORM_SPECIFIC['twitter'];
        return platformHashtags.map(hashtag => ({ hashtag, relevance: 0.6, reason: `Platform: ${platform}` }));
    }

    private static getTrendingHashtags(content: string): HashtagSuggestion[] {
        if (!content) return [];

        const suggestions: HashtagSuggestion[] = [];
        const lowerContent = content.toLowerCase();

        const trendingRelevance = {
            'ai': ['ai', 'machine learning', 'artificial intelligence', 'ml', 'deep learning'],
            'opensource': ['open source', 'github', 'git', 'contribution'],
            'devcommunity': ['developer', 'programming', 'coding', 'dev'],
            'webdevelopment': ['web', 'frontend', 'backend', 'fullstack'],
            'cloudcomputing': ['cloud', 'aws', 'azure', 'gcp', 'kubernetes']
        };

        Object.entries(trendingRelevance).forEach(([trend, keywords]) => {
            if (keywords.some(keyword => lowerContent.includes(keyword))) {
                const trendHashtag = this.TRENDING_HASHTAGS.find(h => h.toLowerCase().includes(trend));
                if (trendHashtag) {
                    suggestions.push({ hashtag: trendHashtag, relevance: 0.5, reason: `Trending topic: ${trend}` });
                }
            }
        });

        return suggestions;
    }

    private static getProjectHashtags(context: HashtagContext): HashtagSuggestion[] {
        const suggestions: HashtagSuggestion[] = [];

        // Prefer the explicit projectName; fall back to first plausible keyword
        const projectName = context.projectName
            || context.keywords.find(k => k.length > 3 && k.length < 20);

        if (projectName) {
            const cleanName = projectName.replace(/[^a-zA-Z0-9]/g, '');
            if (cleanName.length > 2) {
                suggestions.push({
                    hashtag: `#${cleanName}`,
                    relevance: 1.0,
                    reason: `Project name: ${projectName}`
                });
            }
        }

        if (context.postContent) {
            const frameworks = ['react', 'vue', 'angular', 'django', 'flask', 'spring', 'express', 'fastapi'];
            const lowerContent = context.postContent.toLowerCase();

            frameworks.forEach(framework => {
                if (lowerContent.includes(framework)) {
                    suggestions.push({
                        hashtag: `#${framework.charAt(0).toUpperCase() + framework.slice(1)}`,
                        relevance: 0.8,
                        reason: `Framework mentioned: ${framework}`
                    });
                }
            });
        }

        return suggestions;
    }

    private static getGitBasedHashtags(gitChanges?: string): HashtagSuggestion[] {
        if (!gitChanges) return [];

        const suggestions: HashtagSuggestion[] = [];
        const lowerChanges = gitChanges.toLowerCase();

        const gitKeywords = {
            'Fix': ['fix', 'bug', 'issue', 'hotfix', 'resolve'],
            'Feature': ['feat', 'feature', 'add', 'new', 'implement'],
            'Refactor': ['refactor', 'clean', 'optimize', 'update'],
            'Docs': ['doc', 'readme', 'comment'],
            'Testing': ['test', 'coverage', 'mock']
        };

        Object.entries(gitKeywords).forEach(([tag, keywords]) => {
            if (keywords.some(keyword => lowerChanges.includes(keyword))) {
                suggestions.push({
                    hashtag: `#${tag}`,
                    relevance: 0.85,
                    reason: `Git commit mentions: ${tag}`
                });
            }
        });

        return suggestions;
    }

    private static removeDuplicates(suggestions: HashtagSuggestion[]): HashtagSuggestion[] {
        const map = new Map<string, HashtagSuggestion>();

        suggestions.forEach(suggestion => {
            const key = suggestion.hashtag.toLowerCase();
            const existing = map.get(key);

            if (existing) {
                existing.relevance = Math.max(existing.relevance, suggestion.relevance);
                if (!existing.reason.includes(suggestion.reason)) {
                    existing.reason = `${existing.reason} | ${suggestion.reason}`;
                }
            } else {
                map.set(key, { ...suggestion });
            }
        });
        return Array.from(map.values());
    }

    public static formatHashtags(hashtags: HashtagSuggestion[]): string {
        return hashtags.map(h => h.hashtag).join(' ');
    }

    public static async getContextForWorkspace(): Promise<HashtagContext> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return { projectType: 'generic', keywords: [], postContent: '' };
            }

            const workspacePath = workspaceFolder.uri.fsPath;

            // Modification here: Removed 'this.' to call from external file
            const projectType = await detectProjectType(workspacePath);
            const { keywords, projectName } = await this.extractKeywords(workspacePath, projectType);
            const activeFile = vscode.window.activeTextEditor?.document.fileName;
            const gitChanges = await this.getRecentChanges(workspacePath);

            return {
                projectType,
                projectName,
                keywords,
                activeFile,
                gitChanges,
                postContent: ''
            };
        } catch (error) {
            console.error('[DotShare] Error fetching workspace context:', error);
            return { projectType: 'generic', keywords: [], postContent: '' };
        }
    }

    private static async extractKeywords(
        workspacePath: string,
        projectType: string
    ): Promise<{ keywords: string[]; projectName: string }> {
        const relevantFiles: { [key: string]: string[] } = {
            node: ['package.json'],
            rust: ['Cargo.toml'],
            python: ['setup.py', 'pyproject.toml'],
            go: ['go.mod'],
            java: ['pom.xml', 'build.gradle'],
            dotnet: ['.csproj'],
            web: ['package.json'],
            docker: ['Dockerfile'],
            generic: []
        };

        const keywords: string[] = [];
        // Reliable fallback: the workspace folder name itself
        let projectName: string = path.basename(workspacePath);
        const filesToCheck = relevantFiles[projectType] || [];

        for (const file of filesToCheck) {
            const filePath = path.join(workspacePath, file);
            // Modification here: Removed 'this.'
            if (await fileExists(filePath)) {
                try {
                    const fileContent = await fsPromises.readFile(filePath, 'utf8');

                    if (file.toLowerCase().includes('package.json')) {
                        const packageJson = JSON.parse(fileContent);
                        keywords.push(...(packageJson.keywords || []));
                        // package.json name is the canonical project name
                        if (packageJson.name) projectName = packageJson.name;
                    } else if (file.toLowerCase().includes('cargo.toml')) {
                        const lines = fileContent.split('\n');
                        for (const line of lines) {
                            if (line.startsWith('name = ')) {
                                projectName = line.split('=')[1].trim().replace(/"/g, '');
                                keywords.push(projectName);
                            }
                        }
                    }
                } catch {
                    // Skip silently
                }
            }
        }

        return { keywords: [...new Set(keywords)], projectName };
    }

    private static async getRecentChanges(workspacePath: string): Promise<string> {
        try {
            await execAsync('git rev-parse --git-dir', { cwd: workspacePath, timeout: 3000 });
            const { stdout } = await execAsync(
                'git log --max-count=3 --oneline --pretty=format:"%s"',
                { cwd: workspacePath, timeout: 3000 }
            );
            return stdout.trim();
        } catch {
            return '';
        }
    }
}