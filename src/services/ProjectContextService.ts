import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
    ProjectReleaseContext,
    ReleaseSourceType,
    RelevantCodeSnippet,
    ActiveEditorContext
} from '../types/dotshare-ai';
import { Logger } from '../utils/Logger';
import { ReleaseRepository } from './ReleaseRepository';
import { extractSourceExcerpts } from './SourceExcerptExtractor';
import { ReleaseContextScope, ReleaseDocument } from '../types/dotshare-ai';

const execFileAsync = promisify(execFile);

export interface ChangelogParseResult {
    version?: string;
    notes: string[];
    warnings?: string[];
}

export interface ReadmeParseResult {
    projectName?: string;
    description?: string;
    repoUrl?: string;
    techStack?: string[];
    manifestType?: string;
}

export interface GitParseResult {
    latestCommit?: string;
    recentCommits: string[];
    diffSummary?: string;
    baseTag?: string;
    commitCount?: number;
    isDirty?: boolean;
    repository?: ReleaseRepository;
}

export interface BuildContextOptions {
    sources?: ReleaseSourceType[];
    topicQuery?: string;
    includeActiveEditor?: boolean;
    maxSnippets?: number;
    scope?: ReleaseContextScope;
    releaseTag?: string;
}

export class ProjectContextService {
    /**
     * Checks if a file exists asynchronously
     */
    /**
     * Executes a git command safely using execFile (zero shell invocation, array arguments, Windows compatible)
     */
    public static async runGit(args: string[], cwd: string, timeout: number = 3500): Promise<string> {
        try {
            const { stdout } = await execFileAsync('git', args, {
                cwd,
                timeout,
                maxBuffer: 4 * 1024 * 1024,
                windowsHide: true
            });
            return stdout;
        } catch {
            return '';
        }
    }

    /**
     * Redacts API keys, credentials, and tokens from code snippets to protect user privacy
     */
    public static sanitizeSnippetSecrets(text: string): { sanitized: string; hasRedacted: boolean } {
        if (!text) return { sanitized: text, hasRedacted: false };

        let hasRedacted = false;
        let result = text;

        const secretPatterns: RegExp[] = [
            // OpenAI, Anthropic, generic sk- keys
            /\bsk-[a-zA-Z0-9_-]{20,}\b/g,
            // GitHub personal access tokens
            /\bgh[pousr]_[a-zA-Z0-9]{36,}\b/g,
            /\bgithub_pat_[a-zA-Z0-9_]{50,}\b/g,
            // Google API keys
            /\bAIza[0-9A-Za-z_-]{30,45}\b/g,
            // AWS Access Key ID
            /\bAKIA[0-9A-Z]{16}\b/g,
            // Slack tokens
            /\bxox[baprs]-[0-9a-zA-Z]{10,}\b/g,
            // Bearer tokens
            /\bBearer\s+[a-zA-Z0-9_.-]{25,}\b/gi,
            // Generic Private keys
            /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]+PRIVATE KEY-----|$)/g
        ];

        for (const pattern of secretPatterns) {
            const replaced = result.replace(pattern, '[REDACTED_SECRET]');
            if (replaced !== result) {
                hasRedacted = true;
                result = replaced;
            }
        }

        // Generic key/secret assignment: api_key = "secret_value_here", googleKey = "...", client_secret: "..."
        const assignmentPattern = /((?:[a-zA-Z0-9_]*(?:api[_-]?key|secret|password|token)|credentials?)\s*[:=]\s*['"])([^'"\r\n]{8,})(['"])/gi;
        const replacedAssignment = result.replace(assignmentPattern, '$1[REDACTED_SECRET]$3');
        if (replacedAssignment !== result) {
            hasRedacted = true;
            result = replacedAssignment;
        }

        return { sanitized: result, hasRedacted };
    }

    /**
     * Extracts meaningful technical keywords from conversational prompts or topics
     */
    public static extractSearchKeywords(query: string, limit = 7): string[] {
        if (!query) return [];

        const stopWords = new Set([
            // English
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'from', 'up', 'about', 'into', 'over', 'after', 'please', 'focus', 'emphasize', 'new',
            'our', 'we', 'how', 'what', 'why', 'added', 'feature', 'features', 'update', 'updates',
            'talk', 'write', 'post', 'article', 'this', 'that', 'these', 'those', 'also', 'just', 'more',
            // Arabic
            'على', 'في', 'من', 'عن', 'مع', 'و', 'أو', 'إلى', 'الى', 'هو', 'هي', 'هم', 'هن', 'تم',
            'هذا', 'هذه', 'ذلك', 'تلك', 'التي', 'الذي', 'الذين', 'كل', 'بعض', 'غير', 'حيث', 'ان', 'أن',
            'كان', 'كانت', 'يكون', 'تكون', 'ركز', 'تكلم', 'اكتب', 'عايز', 'عاوز', 'ياريت', 'ممكن',
            'الـ', 'تحسين', 'أداء'
        ]);

        const rawWords = query
            .replace(/[^\p{L}\p{N}_-]/gu, ' ')
            .split(/\s+/)
            .map(w => w.trim().toLowerCase())
            .map(w => {
                if (w.startsWith('الـ')) return w.slice(3);
                if (w.startsWith('ال') && w.length > 4) return w.slice(2);
                if (w.startsWith('و') && w.length > 4) return w.slice(1);
                return w;
            })
            .filter(w => w.length >= 3 && !stopWords.has(w));

        const techKeywords: string[] = [];
        const otherKeywords: string[] = [];

        for (const w of rawWords) {
            if (/^[a-z0-9_-]+$/i.test(w)) {
                if (!techKeywords.includes(w)) techKeywords.push(w);
            } else {
                if (!otherKeywords.includes(w)) otherKeywords.push(w);
            }
        }

        return [...techKeywords, ...otherKeywords].slice(0, limit);
    }

    /**
     * Finds and parses the most recent release section in CHANGELOG.md / HISTORY.md / WHATS_NEW.md
     */
    private static async readProjectFile(workspacePath: string, file: string, repository?: ReleaseRepository): Promise<string> {
        if (repository) return repository.readFile(file);
        try {
            const root = await fsPromises.realpath(workspacePath);
            const source = await fsPromises.realpath(path.join(root, file));
            const relative = path.relative(root, source);
            if (relative.startsWith('..') || path.isAbsolute(relative) || (await fsPromises.stat(source)).size > 512 * 1024) return '';
            return await fsPromises.readFile(source, 'utf8');
        } catch { return ''; }
    }

    public static async parseChangelog(workspacePath: string, repository?: ReleaseRepository): Promise<ChangelogParseResult> {
        const version = repository?.releaseTag?.match(/^v?(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)$/)?.[1];
        for (const file of ['CHANGELOG.md', 'changelog.md', 'WHATS_NEW.md', 'whats_new.md', 'HISTORY.md', 'history.md']) {
            if (repository?.scope === 'working_tree' && !repository.changedFiles.includes(file)) continue;
            const content = await this.readProjectFile(workspacePath, file, repository);
            if (content.trim()) {
                const parsed = this.extractLatestChangelogSection(content, version);
                if (repository && !repository.releaseTag && repository.scope === 'release' &&
                    parsed.version === repository.baseTag?.replace(/^v/, '')) {
                    return { notes: [], warnings: ['The changelog describes the preceding tag; its old release notes were excluded.'] };
                }
                return parsed;
            }
        }
        return { version, notes: [] };
    }

    /** Preserve complete multiline entries and select the exact tagged version when available. */
    public static extractLatestChangelogSection(content: string, requestedVersion?: string): ChangelogParseResult {
        let version: string | undefined;
        let capturing = false;
        let pending = '';
        const notes: string[] = [];
        const flush = () => { if (pending) notes.push(pending); pending = ''; };
        for (const raw of content.split(/\r?\n/)) {
            const line = raw.trim();
            const heading = /^##\s+.*?\bv?(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)/i.exec(line);
            if (heading) {
                if (capturing) { flush(); break; }
                if (requestedVersion && heading[1] !== requestedVersion) continue;
                capturing = true;
                version = heading[1];
                continue;
            }
            if (!capturing) continue;
            if (line === '---') { flush(); break; }
            if (!line) { flush(); continue; }
            if (/^#{3,4}\s/.test(line)) {
                flush(); notes.push(`[${line.replace(/^#+\s+/, '')}]`); continue;
            }
            if (/^[-*•]\s/.test(line)) {
                flush(); pending = line.replace(/^[-*•]\s+/, '');
            } else if (!line.startsWith('#') && !line.startsWith('<') && !line.startsWith('![')) {
                pending += `${pending ? ' ' : ''}${line.replace(/^>\s?/, '')}`;
            }
        }
        flush();
        const warnings: string[] = [];
        if (requestedVersion && !version) warnings.push(`No changelog section found for ${requestedVersion}; other versions were excluded.`);
        const bounded: string[] = [];
        let characters = 0;
        for (const note of notes) {
            if (bounded.length >= 80 || characters + note.length > 14000) {
                warnings.push(`Changelog budget reached: ${notes.length - bounded.length} entries omitted.`); break;
            }
            bounded.push(this.sanitizeSnippetSecrets(note).sanitized); characters += note.length;
        }
        return { version: version || requestedVersion, notes: bounded, warnings };
    }

    /**
     * Reads README.md to extract project name, description, tech stack, and repository URL
     */
    public static async parseReadme(workspacePath: string, repository?: ReleaseRepository): Promise<ReadmeParseResult> {
        const content = await this.readProjectFile(workspacePath, 'README.md', repository);

        let pkgName = '';
        let pkgDesc = '';
        let pkgRepo = '';
        let manifestType = '';
        const techStack: string[] = [];

        // 1. Check package.json (Node.js ecosystem)
        const pkgPath = await this.readProjectFile(workspacePath, 'package.json', repository);
        if (pkgPath) {
            try {
                const pkgJson = JSON.parse(pkgPath);
                pkgName = pkgJson.displayName || pkgJson.name || '';
                pkgDesc = pkgJson.description || '';
                manifestType = 'node';
                if (!techStack.includes('Node.js')) techStack.push('Node.js');
                if (pkgJson.devDependencies?.typescript || pkgJson.dependencies?.typescript) {
                    if (!techStack.includes('TypeScript')) techStack.push('TypeScript');
                }
                const dependencies = { ...pkgJson.dependencies, ...pkgJson.devDependencies } as Record<string, string>;
                for (const [dependency, technology] of Object.entries({ react: 'React', vue: 'Vue', next: 'Next.js', svelte: 'Svelte', tailwindcss: 'TailwindCSS' })) {
                    if (dependencies[dependency]) techStack.push(technology);
                }
                if (pkgJson.engines?.vscode) techStack.push('VS Code');
                if (typeof pkgJson.repository === 'string') {
                    pkgRepo = pkgJson.repository;
                } else if (pkgJson.repository?.url) {
                    pkgRepo = pkgJson.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
                }
            } catch {
                // Ignore json parse failure
            }
        }

        // 2. Check Cargo.toml (Rust ecosystem)
        const cargoPath = await this.readProjectFile(workspacePath, 'Cargo.toml', repository);
        if (cargoPath) {
            try {
                const cargoContent = cargoPath;
                manifestType = manifestType ? `${manifestType}, rust` : 'rust';
                if (!techStack.includes('Rust')) techStack.push('Rust');

                const nameMatch = cargoContent.match(/\[package\][\s\S]*?name\s*=\s*["']([^"']+)["']/);
                const descMatch = cargoContent.match(/\[package\][\s\S]*?description\s*=\s*["']([^"']+)["']/);
                const repoMatch = cargoContent.match(/\[package\][\s\S]*?repository\s*=\s*["']([^"']+)["']/);

                if (!pkgName && nameMatch) pkgName = nameMatch[1];
                if (!pkgDesc && descMatch) pkgDesc = descMatch[1];
                if (!pkgRepo && repoMatch) pkgRepo = repoMatch[1];
            } catch {
                // Ignore parse failure
            }
        }

        // 3. Check pyproject.toml (Python ecosystem)
        const pyprojectPath = await this.readProjectFile(workspacePath, 'pyproject.toml', repository);
        if (pyprojectPath) {
            try {
                const pyContent = pyprojectPath;
                manifestType = manifestType ? `${manifestType}, python` : 'python';
                if (!techStack.includes('Python')) techStack.push('Python');

                const nameMatch = pyContent.match(/name\s*=\s*["']([^"']+)["']/);
                const descMatch = pyContent.match(/description\s*=\s*["']([^"']+)["']/);
                if (!pkgName && nameMatch) pkgName = nameMatch[1];
                if (!pkgDesc && descMatch) pkgDesc = descMatch[1];
            } catch {
                // Ignore
            }
        }

        // 4. Check go.mod (Go ecosystem)
        const goModPath = await this.readProjectFile(workspacePath, 'go.mod', repository);
        if (goModPath) {
            try {
                const goContent = goModPath;
                manifestType = manifestType ? `${manifestType}, go` : 'go';
                if (!techStack.includes('Go')) techStack.push('Go');

                const modMatch = goContent.match(/^module\s+([^\s]+)/m);
                if (!pkgName && modMatch) pkgName = path.basename(modMatch[1]);
            } catch {
                // Ignore
            }
        }

        const requirements = await this.readProjectFile(workspacePath, 'requirements.txt', repository);
        if (requirements && !techStack.includes('Python')) techStack.push('Python');
        for (const binding of ['PyQt6', 'PyQt5', 'PySide6', 'PySide2']) {
            if (new RegExp(`\\b${binding}\\b`, 'i').test(`${pyprojectPath}\n${requirements}`)) techStack.push(binding);
        }

        let projectName = pkgName;
        let description = pkgDesc;
        let repoUrl = pkgRepo;

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


        }

        return {
            projectName: projectName || path.basename(workspacePath),
            description: description || undefined,
            repoUrl: repoUrl || undefined,
            techStack: techStack.length > 0 ? techStack : undefined,
            manifestType: manifestType || undefined
        };
    }

    /**
     * Extracts Git commit history and changes from the workspace
     */
    public static async getGitContext(workspacePath: string, options: BuildContextOptions = {}): Promise<GitParseResult> {
        const repository = await ReleaseRepository.open(workspacePath, options.scope, options.releaseTag);
        if (!repository) return { recentCommits: [] };
        const range = repository.commitRange;
        const [latest, commits, count, stat] = await Promise.all([
            repository.git(['log', '-1', '--format=%s%n%b', repository.targetRef]),
            repository.scope === 'release' ? repository.git(['log', range, '--format=• %s', '-n', '20']) : Promise.resolve(''),
            repository.scope === 'release'
                ? repository.git(['rev-list', '--count', range])
                : Promise.resolve('0'),
            repository.diff(['--stat', '--stat-width=160'])
        ]);
        const lines = stat.trim().split('\n').filter(Boolean);
        const files = lines.slice(0, -1);
        const summary = [...files.slice(0, 30), ...(files.length > 30 ? [`... and ${files.length - 30} more files`] : []), ...lines.slice(-1)].join('\n');
        return {
            latestCommit: this.sanitizeSnippetSecrets(latest.trim()).sanitized,
            recentCommits: this.sanitizeSnippetSecrets(commits.trim()).sanitized.split('\n').filter(Boolean),
            diffSummary: summary || undefined, baseTag: repository.baseTag,
            commitCount: Number(count.trim()) || 0, isDirty: repository.dirty, repository
        };
    }

    /** Dependency diffs use exactly the same snapshot boundary as the implementation evidence. */
    public static async getDependencyChanges(workspacePath: string, baseTag?: string, isDirty?: boolean, snapshot?: ReleaseRepository): Promise<string[]> {
        const repository = snapshot || await ReleaseRepository.open(workspacePath, isDirty ? 'working_tree' : 'release');
        if (!repository) return [];
        const changes: string[] = [];
        for (const file of ['package.json', 'Cargo.toml', 'pyproject.toml', 'requirements.txt', 'go.mod']) {
            if (!repository.changedFiles.includes(file)) continue;
            const diff = await repository.diff(['-U3'], [file]);
            const lines = diff.split('\n').filter(line => /^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line));
            if (lines.length) changes.push(`[${file}] Dependency manifest changes (verify exact names and versions):\n${this.sanitizeSnippetSecrets(lines.join('\n')).sanitized.slice(0, 1800)}`);
        }
        return changes;
    }

    /**
     * Searches Git commits and history by extracted keywords (keyword-driven topic search)
     */
    public static async searchGitByTopic(
        workspacePath: string,
        topicQuery: string,
        baseTag?: string,
        limit: number = 5,
        snapshot?: ReleaseRepository
    ): Promise<string[]> {
        const repository = snapshot || await ReleaseRepository.open(workspacePath);
        if (!repository || repository.scope === 'working_tree') return [];
        const keywords = this.extractSearchKeywords(topicQuery);
        if (keywords.length === 0) return [];

        const range = repository.commitRange;
        const rangeArgs = [range];
        const matchedCommits: string[] = [];

        // 1. Search commit messages using grep with array arguments
        try {
            let stdout = '';
            // If multiple keywords are present, first attempt high-precision --all-match
            if (keywords.length > 1) {
                const strictArgs = ['log', ...rangeArgs, '-i', '--all-match'];
                keywords.forEach(kw => {
                    strictArgs.push('--grep', kw);
                });
                strictArgs.push('--pretty=format:• %s (%cr)', '-n', String(limit));
                stdout = await repository.git(strictArgs);
            }

            // Fallback to OR matching if strict yielded no matches or query has only 1 keyword
            if (!stdout.trim()) {
                const grepArgs = ['log', ...rangeArgs, '-i'];
                keywords.forEach(kw => {
                    grepArgs.push('--grep', kw);
                });
                grepArgs.push('--pretty=format:• %s (%cr)', '-n', String(limit));
                stdout = await repository.git(grepArgs);
            }

            if (stdout.trim()) {
                matchedCommits.push(...stdout.trim().split('\n').filter(Boolean));
            }
        } catch {
            // Ignore grep failure
        }

        // 2. Pickaxe search (-S) for top keywords if fewer results found
        if (matchedCommits.length < limit) {
            for (const kw of keywords.slice(0, 2)) {
                if (matchedCommits.length >= limit) break;
                try {
                    const pickaxeLimit = limit - matchedCommits.length;
                    const stdout = await repository.git(['log', range, `-S${kw}`, '--format=• %s', '-n', String(pickaxeLimit)]);
                    if (stdout.trim()) {
                        for (const c of stdout.trim().split('\n').filter(Boolean)) {
                            if (!matchedCommits.includes(c)) {
                                matchedCommits.push(c);
                            }
                        }
                    }
                } catch {
                    // Ignore pickaxe failure
                }
            }
        }

        return matchedCommits.slice(0, limit).map(c => this.sanitizeSnippetSecrets(c).sanitized);
    }

    /**
     * Extracts relevant source code diff hunks matching a topic or sorted by change weight (most significant changes first).
     * Includes automated secret redaction for safety.
     */
    public static async extractRelevantCodeSnippets(
        workspacePath: string, query?: string, baseTag?: string, isDirty = false, maxSnippets = 6,
        snapshot?: ReleaseRepository
    ): Promise<RelevantCodeSnippet[]> {
        const repository = snapshot || await ReleaseRepository.open(workspacePath, isDirty ? 'working_tree' : 'release');
        if (!repository) return [];
        const keywords = this.extractSearchKeywords(query || '', 160);
        const candidates: Array<RelevantCodeSnippet & { changedLines: number; changedCode: string; score: number }> = [];
        const files = repository.changedFiles.filter(file =>
            /\.(tsx?|jsx?|rs|py|go|java|c|h|cpp|hpp|cs|php|rb|swift|kt|sh)$/i.test(file) &&
            !/(^|\/)(tests?|__tests__|fixtures|vendor|node_modules|dist|out|generated)(\/|$)/i.test(file) &&
            !/(^|\/)(test_|conftest\.)|[._](test|spec)\.|_test\.go$|\.min\.js$/i.test(file));
        files.sort((a, b) => keywords.filter(k => b.toLowerCase().includes(k)).length - keywords.filter(k => a.toLowerCase().includes(k)).length);
        if (files.length > 80) repository.warnings.push(`Code search budget reached: ${files.length - 80} changed implementation files not inspected.`);
        for (let batch = 0; batch < Math.min(files.length, 80); batch += 8) {
            await Promise.all(files.slice(batch, batch + 8).map(async file => {
                const [diff, source] = await Promise.all([repository.diff(['-U3'], [file]), repository.readFile(file)]);
                if (!source || source.includes('\0')) return;
                const language = this.codeLanguage(file);
                for (const excerpt of extractSourceExcerpts(source, diff, language)) {
                    candidates.push({
                        file, code: this.sanitizeSnippetSecrets(excerpt.code).sanitized,
                        startLine: excerpt.startLine, endLine: excerpt.endLine, language, truncated: excerpt.truncated,
                        reason: `Verified implementation at ${repository.targetLabel}`,
                        changedLines: excerpt.changedLines, changedCode: excerpt.changedCode, score: 0
                    });
                }
            }));
        }
        // Normalize identifiers and plural forms so keyed_digests matches the release term "digests".
        const tokenize = (text: string) => new Set(text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
            .split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(word => word.length > 4 && /[^s]s$/.test(word) ? word.slice(0, -1) : word));
        const terms = candidates.map(candidate => tokenize(`${candidate.file} ${candidate.changedCode}`));
        for (const keyword of keywords) {
            const keys = [...tokenize(keyword)];
            const matches = candidates.filter((_candidate, index) => keys.some(key => terms[index].has(key)));
            const weight = Math.log2(1 + candidates.length / Math.max(matches.length, 1));
            for (const candidate of matches) candidate.score += weight;
        }
        for (const candidate of candidates) {
            candidate.score += 3 * Math.log2(1 + candidate.changedLines) + (/^(core|src|lib|internal)\//.test(candidate.file) ? 10 : 0);
            if (candidate.truncated) candidate.score *= 0.8;
        }
        candidates.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || (a.startLine || 0) - (b.startLine || 0));
        const result: RelevantCodeSnippet[] = [];
        const perFile = new Map<string, number>();
        let remaining = 18000;
        const excerptBudget = Math.floor(remaining / Math.max(1, Math.min(maxSnippets, 10)));
        // First pass covers different files; second pass can add another important function.
        for (const pass of [1, 2]) {
            for (const candidate of candidates) {
                if (result.length >= Math.min(Math.max(maxSnippets, 0), 10)) break;
                const count = perFile.get(candidate.file) || 0;
                if (count >= pass || result.some(s => s.file === candidate.file && s.startLine === candidate.startLine)) continue;
                const { score, changedLines, changedCode, ...snippet } = candidate;
                void score; void changedLines; void changedCode;
                if (snippet.code.length > excerptBudget) {
                    const cropped = snippet.code.slice(0, excerptBudget);
                    snippet.code = cropped.slice(0, cropped.lastIndexOf('\n') > 0 ? cropped.lastIndexOf('\n') : cropped.length);
                    snippet.endLine = (snippet.startLine || 1) + snippet.code.split('\n').length - 1;
                    snippet.truncated = true;
                }
                result.push(snippet); remaining -= snippet.code.length; perFile.set(candidate.file, count + 1);
            }
        }
        // Add small lifecycle/helper methods referenced by core excerpts. They often establish
        // key ownership or GUI-thread affinity that a single changed method cannot demonstrate.
        let supportBudget = 4000;
        for (const primary of [...result].filter(snippet => /^(core|src|lib|internal)\//.test(snippet.file)).slice(0, 4)) {
            const references = new Set([...primary.code.matchAll(/(?:self\.|this\.)(\w+)/g)].map(match => match[1]));
            const supporting = candidates.filter(candidate => candidate.file === primary.file &&
                !result.some(snippet => snippet.file === candidate.file && snippet.startLine === candidate.startLine) &&
                (/(?:def __init__|constructor\s*\()/.test(candidate.code.split('\n')[0]) ||
                    [...references].some(name => candidate.code.split('\n')[0].includes(`${name}(`))))
                .sort((a, b) => Number(/def __init__|constructor\s*\(/.test(b.code.split('\n')[0])) -
                    Number(/def __init__|constructor\s*\(/.test(a.code.split('\n')[0])));
            for (const candidate of supporting.slice(0, 3)) {
                if (candidate.code.length > Math.min(supportBudget, 1800)) continue;
                const { score, changedLines, changedCode, ...snippet } = candidate;
                void score; void changedLines; void changedCode;
                snippet.reason = `Supporting lifecycle/helper implementation at ${repository.targetLabel}`;
                result.push(snippet); supportBudget -= snippet.code.length;
            }
        }
        if (remaining < 5500 && result.length < Math.min(maxSnippets, candidates.length)) repository.warnings.push('Code excerpt budget reached; additional excerpts omitted.');
        return result;
    }

    private static codeLanguage(file: string): string {
        const extension = path.extname(file).slice(1);
        return ({ py: 'python', ts: 'typescript', tsx: 'tsx', js: 'javascript', rs: 'rust', sh: 'bash', kt: 'kotlin' } as Record<string, string>)[extension] || extension;
    }

    public static async collectReleaseDocuments(workspacePath: string, version?: string, query?: string, snapshot?: ReleaseRepository): Promise<ReleaseDocument[]> {
        const repository = snapshot || await ReleaseRepository.open(workspacePath);
        if (!repository) return [];
        const files = (await repository.listFiles()).filter(file => /\.md$/i.test(file));
        const releaseFiles = version ? files.filter(file =>
            /(^|\/)(releases?|release[-_]notes)(\/|[-_])/i.test(file) &&
            new RegExp(`(^|[^0-9])v?${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^0-9]|$)`).test(file)) : [];
        const keywords = this.extractSearchKeywords(query || '');
        const otherFiles = files.filter(file => !releaseFiles.includes(file) &&
            !/(^|\/)(releases?|release[-_]notes)(\/|[-_])/i.test(file) &&
            !/roadmap|plans?/i.test(file) && (/^docs\//i.test(file) || /architecture|design|security|readme/i.test(file)));
        otherFiles.sort((a, b) => keywords.filter(k => b.toLowerCase().includes(k)).length - keywords.filter(k => a.toLowerCase().includes(k)).length ||
            Number(/architecture|design|security/i.test(b)) - Number(/architecture|design|security/i.test(a)) || a.localeCompare(b));
        if (otherFiles.length + releaseFiles.length > 12) repository.warnings.push('Documentation search is limited to the 12 highest-priority candidate files.');
        const documents: ReleaseDocument[] = [];
        let budget = 14000;
        for (const file of [...releaseFiles, ...otherFiles].slice(0, 12)) {
            const content = await repository.readFile(file);
            if (!content) continue;
            const isRelease = releaseFiles.includes(file);
            if (!isRelease && (!keywords.length || !keywords.some(k => content.toLowerCase().includes(k)))) continue;
            const clean = this.sanitizeSnippetSecrets(content).sanitized;
            const maximum = Math.min(isRelease ? 7000 : 3500, budget);
            if (maximum <= 0 || documents.length >= 4) { repository.warnings.push('Documentation budget reached; additional documents omitted.'); break; }
            const truncated = clean.length > maximum;
            documents.push({ file, content: clean.slice(0, maximum), kind: isRelease ? 'release_notes' : 'architecture', truncated });
            budget -= Math.min(clean.length, maximum);
            if (truncated) repository.warnings.push(`Documentation excerpt truncated: ${file}.`);
        }
        return documents;
    }

    public static async searchWorkspaceDocs(workspacePath: string, query: string, maxSections = 3, snapshot?: ReleaseRepository): Promise<string[]> {
        if (!query.trim()) return [];
        const docs = await this.collectReleaseDocuments(workspacePath, undefined, query, snapshot);
        return docs.slice(0, maxSections).map(doc => `[${doc.file}] Background architecture, not proof of a new feature:\n${doc.content}`);
    }

    /**
     * Captures context from the currently active editor in VS Code with secret redaction
     */
    public static getActiveEditorContext(): ActiveEditorContext | undefined {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor || !editor.document) return undefined;

            const doc = editor.document;
            if (doc.uri.scheme !== 'file') return undefined;

            const wsFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
            const relPath = wsFolder ? path.relative(wsFolder.uri.fsPath, doc.uri.fsPath) : path.basename(doc.fileName);

            const selection = editor.selection;
            let selectedText: string | undefined;

            if (!selection.isEmpty) {
                const { sanitized, hasRedacted } = this.sanitizeSnippetSecrets(doc.getText(selection).trim());
                selectedText = sanitized.length > 1200 ? `${sanitized.slice(0, 1200)}\n// ... [truncated]` : sanitized;
                if (hasRedacted) {
                    Logger.warn('[ProjectContextService] Redacted detected secrets from active editor selection');
                }
            }

            return {
                fileName: relPath,
                languageId: doc.languageId,
                selectedText: selectedText || undefined,
                cursorLine: selection.active.line + 1
            };
        } catch {
            return undefined;
        }
    }

    /**
     * Enriches an existing ProjectReleaseContext on-the-fly with search-driven insights
     */
    public static async enrichContextWithTopicSearch(existingContext: ProjectReleaseContext, topicQuery: string, workspacePath?: string): Promise<ProjectReleaseContext> {
        return this.buildContext(workspacePath, {
            topicQuery, scope: existingContext.scope, releaseTag: existingContext.releaseTag,
            includeActiveEditor: !!existingContext.activeEditorContext
        });
    }

    /** Refresh evidence once per generation; every source shares the same release snapshot. */
    public static async buildContext(workspacePath?: string, sourcesOrOptions?: ReleaseSourceType[] | BuildContextOptions): Promise<ProjectReleaseContext> {
        const wsPath = workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!wsPath) return { projectName: 'My Project', changelogNotes: [], recentCommits: [], contextWarnings: ['No project workspace is open.'] };
        const options: BuildContextOptions = Array.isArray(sourcesOrOptions) ? { sources: sourcesOrOptions } : sourcesOrOptions || {};
        const enabled = (source: ReleaseSourceType) => !options.sources || options.sources.includes(source);
        const gitData = await this.getGitContext(wsPath, options);
        const repo = gitData.repository;
        const includeGit = enabled('git_commits') || enabled('git_diff');
        const [changelog, readme] = await Promise.all([
            enabled('changelog') ? this.parseChangelog(wsPath, repo) : Promise.resolve({ notes: [] } as ChangelogParseResult),
            enabled('readme') ? this.parseReadme(wsPath, repo) : Promise.resolve({} as ReadmeParseResult)
        ]);
        const version = repo?.releaseTag?.match(/^v?(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)$/)?.[1] || changelog.version;
        const [dependencies, snippets, commits, documents] = await Promise.all([
            enabled('dependencies') ? this.getDependencyChanges(wsPath, gitData.baseTag, options.scope === 'working_tree', repo) : Promise.resolve([]),
            includeGit ? this.extractRelevantCodeSnippets(wsPath, options.topicQuery || changelog.notes.join(' '), gitData.baseTag, options.scope === 'working_tree', options.maxSnippets ?? 6, repo) : Promise.resolve([]),
            enabled('git_commits') && options.topicQuery ? this.searchGitByTopic(wsPath, options.topicQuery, gitData.baseTag, 8, repo) : Promise.resolve([]),
            enabled('docs_search') ? this.collectReleaseDocuments(wsPath, version, options.topicQuery || changelog.notes.join(' '), repo) : Promise.resolve([])
        ]);
        const activeEditor = options.includeActiveEditor || enabled('active_editor') && !!options.sources ? this.getActiveEditorContext() : undefined;
        let workingTreeSummary: string | undefined;
        if (repo?.dirty && repo.scope === 'release') {
            workingTreeSummary = 'Local modifications exist and were excluded from release evidence.';
        }
        return {
            projectName: this.sanitizeSnippetSecrets(readme.projectName || path.basename(wsPath)).sanitized,
            projectDescription: readme.description ? this.sanitizeSnippetSecrets(readme.description).sanitized : undefined,
            repoUrl: readme.repoUrl, techStack: readme.techStack, version,
            changelogNotes: changelog.notes,
            latestCommit: enabled('git_commits') ? gitData.latestCommit : undefined,
            recentCommits: enabled('git_commits') ? gitData.recentCommits : [],
            gitDiffSummary: enabled('git_diff') ? gitData.diffSummary : undefined,
            gitBaseTag: gitData.baseTag, gitCommitCount: gitData.commitCount, gitDirty: gitData.isDirty,
            scope: options.scope || 'release', releaseTag: repo?.releaseTag,
            targetRef: repo?.targetRef, targetLabel: repo?.targetLabel, baseRef: repo?.baseRef,
            availableTags: repo?.availableTags, changedFiles: includeGit ? repo?.changedFiles : [], workingTreeSummary,
            dependencyChanges: dependencies, relevantCodeSnippets: snippets, relevantCommits: commits,
            releaseDocuments: documents, activeEditorContext: activeEditor, topicQuery: options.topicQuery,
            contextWarnings: [...(changelog.warnings || []), ...(repo?.warnings || []),
                ...(!repo ? ['No Git snapshot available; documentation is from the current workspace.'] : []),
                ...(includeGit && !snippets.length ? ['No changed implementation excerpts available; avoid code-level claims.'] : [])]
        };
    }
}
