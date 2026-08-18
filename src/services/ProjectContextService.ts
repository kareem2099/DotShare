import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ProjectReleaseContext, ReleaseSourceType } from '../types/dotshare-ai';
import { Logger } from '../utils/Logger';

const execAsync = promisify(exec);

export interface ChangelogParseResult {
    version?: string;
    notes: string[];
}

export interface ReadmeParseResult {
    projectName?: string;
    description?: string;
    repoUrl?: string;
    techStack?: string[];
}

export interface GitParseResult {
    latestCommit?: string;
    recentCommits: string[];
    diffSummary?: string;
}

export class ProjectContextService {
    /**
     * Checks if a file exists asynchronously
     */
    private static async fileExists(filePath: string): Promise<boolean> {
        try {
            await fsPromises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Finds and parses the most recent release section in CHANGELOG.md / HISTORY.md / WHATS_NEW.md
     */
    public static async parseChangelog(workspacePath: string): Promise<ChangelogParseResult> {
        const candidateFiles = ['CHANGELOG.md', 'changelog.md', 'WHATS_NEW.md', 'whats_new.md', 'HISTORY.md', 'history.md'];
        let changelogContent = '';

        for (const file of candidateFiles) {
            const fullPath = path.join(workspacePath, file);
            if (await this.fileExists(fullPath)) {
                try {
                    changelogContent = await fsPromises.readFile(fullPath, 'utf8');
                    if (changelogContent.trim()) break;
                } catch (e) {
                    Logger.warn(`Failed to read ${file}`, e);
                }
            }
        }

        if (!changelogContent) {
            return { notes: [] };
        }

        return this.extractLatestChangelogSection(changelogContent);
    }

    /**
     * Extracts the latest release notes from markdown changelog text
     */
    public static extractLatestChangelogSection(content: string): ChangelogParseResult {
        const lines = content.split('\n');
        let version: string | undefined;
        const notes: string[] = [];
        let capturing = false;
        let headingCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Match ONLY top-level version release headings (e.g. "## [3.4.1]", "## v3.4.0", "## 🆕 What's New — v3.4.1", "## Release 3.3.0")
            const isVersionHeading = /^##\s+(?:\[?v?\d+\.\d+|.*?(?:What's New|Release)\s*[-—:]?\s*v?\d+\.\d+|\[\d+\.\d+)/i.test(line);

            if (isVersionHeading) {
                headingCount++;
                if (headingCount === 1) {
                    capturing = true;
                    const verMatch = line.match(/v?(\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.]+)?)/i);
                    if (verMatch) {
                        version = verMatch[1];
                    }
                    continue;
                } else if (headingCount > 1) {
                    // Reached the next release section boundary
                    break;
                }
            }

            if (capturing) {
                // Break on horizontal rule separator between full release sections
                if (line === '---' && notes.length > 0) {
                    break;
                }

                // If it's a sub-category heading (e.g. "### Added", "### Fixed", "### Features"), we can include it as a category marker
                if (/^#{3,4}\s+(.+)$/.test(line)) {
                    const category = line.replace(/^#{3,4}\s+/, '').trim();
                    notes.push(`[${category}]`);
                    continue;
                }

                // Extract bullet items (- ..., * ..., • ...)
                if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
                    const cleanNote = line.replace(/^[-*•]\s+/, '').trim();
                    if (cleanNote) {
                        notes.push(cleanNote);
                    }
                } else if (line.length > 0 && !line.startsWith('#') && !line.startsWith('<') && !line.startsWith('![')) {
                    // Include descriptive paragraphs under the current version if short
                    if (notes.length === 0 || !notes[notes.length - 1].endsWith(':')) {
                        notes.push(line);
                    }
                }
            }
        }

        return { version, notes: notes.slice(0, 15) };
    }

    /**
     * Reads README.md to extract project name, description, tech stack, and repository URL
     */
    public static async parseReadme(workspacePath: string): Promise<ReadmeParseResult> {
        const readmePath = path.join(workspacePath, 'README.md');
        let content = '';

        if (await this.fileExists(readmePath)) {
            try {
                content = await fsPromises.readFile(readmePath, 'utf8');
            } catch (e) {
                Logger.warn('Failed to read README.md', e);
            }
        }

        let pkgName = '';
        let pkgDesc = '';
        let pkgRepo = '';
        const pkgPath = path.join(workspacePath, 'package.json');
        if (await this.fileExists(pkgPath)) {
            try {
                const pkgJson = JSON.parse(await fsPromises.readFile(pkgPath, 'utf8'));
                pkgName = pkgJson.displayName || pkgJson.name || '';
                pkgDesc = pkgJson.description || '';
                if (typeof pkgJson.repository === 'string') {
                    pkgRepo = pkgJson.repository;
                } else if (pkgJson.repository?.url) {
                    pkgRepo = pkgJson.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
                }
            } catch {
                // Ignore json parse failure
            }
        }

        let projectName = pkgName;
        let description = pkgDesc;
        let repoUrl = pkgRepo;
        const techStack: string[] = [];

        if (content) {
            if (!projectName) {
                const titleMatch = content.match(/^#\s+(.+)$/m);
                if (titleMatch) {
                    projectName = titleMatch[1].replace(/^[^\w\s]+/, '').trim();
                }
            }

            if (!description) {
                const descMatch = content.match(/(?:\*{1,2}|_{1,2})(?:[\w\s,!.—-]+)(?:\*{1,2}|_{1,2})/);
                if (descMatch) {
                    description = descMatch[0].replace(/[*_]/g, '').trim();
                }
            }

            if (!repoUrl) {
                const urlMatch = content.match(/https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/);
                if (urlMatch) {
                    repoUrl = urlMatch[0];
                }
            }

            const techKeywords = ['TypeScript', 'JavaScript', 'Node.js', 'VS Code', 'React', 'Vue', 'Next.js', 'Rust', 'Python', 'Go', 'Docker', 'AI', 'TailwindCSS'];
            for (const tech of techKeywords) {
                const regex = new RegExp(`\\b${tech.replace('.', '\\.')}\\b`, 'i');
                if (regex.test(content) && !techStack.includes(tech)) {
                    techStack.push(tech);
                }
            }
        }

        return {
            projectName: projectName || path.basename(workspacePath),
            description: description || undefined,
            repoUrl: repoUrl || undefined,
            techStack: techStack.length > 0 ? techStack : undefined
        };
    }

    /**
     * Extracts Git commit history and changes from the workspace
     */
    public static async getGitContext(workspacePath: string): Promise<GitParseResult> {
        const gitDir = path.join(workspacePath, '.git');
        if (!(await this.fileExists(gitDir))) {
            return { recentCommits: [] };
        }

        let latestCommit: string | undefined;
        const recentCommits: string[] = [];
        let diffSummary: string | undefined;

        const results = await Promise.allSettled([
            // 1. Latest commit subject + body
            execAsync('git log -1 --pretty=format:"%s%n%b"', { cwd: workspacePath, timeout: 3000 }),
            // 2. Recent 5 commits oneline
            execAsync('git log -n 5 --pretty=format:"• %s (%cr)"', { cwd: workspacePath, timeout: 3000 }),
            // 3. Diff stat specifically for the latest commit against its parent
            execAsync('git diff --stat HEAD~1 HEAD', { cwd: workspacePath, timeout: 3000 })
        ]);

        if (results[0].status === 'fulfilled' && results[0].value.stdout.trim()) {
            latestCommit = results[0].value.stdout.trim();
        }

        if (results[1].status === 'fulfilled' && results[1].value.stdout.trim()) {
            recentCommits.push(...results[1].value.stdout.trim().split('\n').filter(Boolean));
        }

        if (results[2].status === 'fulfilled' && results[2].value.stdout.trim()) {
            diffSummary = results[2].value.stdout.trim().split('\n').slice(-3).join('\n');
        }

        return {
            latestCommit,
            recentCommits,
            diffSummary
        };
    }

    /**
     * Builds the complete aggregated ProjectReleaseContext
     */
    public static async buildContext(
        workspacePath?: string,
        sources?: ReleaseSourceType[]
    ): Promise<ProjectReleaseContext> {
        const wsPath = workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!wsPath) {
            return {
                projectName: 'My Project',
                changelogNotes: [],
                recentCommits: []
            };
        }

        const includeChangelog = !sources || sources.includes('changelog');
        const includeReadme = !sources || sources.includes('readme');
        const includeGit = !sources || sources.includes('git_commits') || sources.includes('git_diff');

        const changelogPromise: Promise<ChangelogParseResult> = includeChangelog 
            ? this.parseChangelog(wsPath) 
            : Promise.resolve({ notes: [] });

        const readmePromise: Promise<ReadmeParseResult> = includeReadme 
            ? this.parseReadme(wsPath) 
            : Promise.resolve({});

        const gitPromise: Promise<GitParseResult> = includeGit 
            ? this.getGitContext(wsPath) 
            : Promise.resolve({ recentCommits: [] });

        const [changelogData, readmeData, gitData] = await Promise.all([
            changelogPromise,
            readmePromise,
            gitPromise
        ]);

        return {
            projectName: readmeData.projectName || path.basename(wsPath),
            projectDescription: readmeData.description,
            version: changelogData.version,
            changelogNotes: changelogData.notes,
            latestCommit: gitData.latestCommit,
            recentCommits: gitData.recentCommits,
            gitDiffSummary: gitData.diffSummary,
            repoUrl: readmeData.repoUrl,
            techStack: readmeData.techStack
        };
    }
}
