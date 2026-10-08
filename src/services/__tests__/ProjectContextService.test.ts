import { ProjectContextService } from '../ProjectContextService';

describe('ProjectContextService', () => {
    describe('extractLatestChangelogSection', () => {
        it('should correctly extract version and notes from markdown changelog', () => {
            const sampleChangelog = `
# Changelog

## 🆕 What's New — v3.4.1 "Cleanup"
- Platform Purge: Facebook, Reddit, and Medium have been fully removed.
- TypeScript Cleanup: Resolved all noUnusedLocals errors.
- Zero Dead Code: All unused variable warnings resolved.

---

## 🆕 What's New — v3.4.0 "CodeSnap"
- CodeSnap Panel: Create beautiful syntax-highlighted code snapshots.
- 9+ Professional Themes.
            `;

            const result = ProjectContextService.extractLatestChangelogSection(sampleChangelog);

            expect(result.version).toBe('3.4.1');
            expect(result.notes.length).toBe(3);
            expect(result.notes[0]).toContain('Platform Purge');
            expect(result.notes[1]).toContain('TypeScript Cleanup');
            expect(result.notes[2]).toContain('Zero Dead Code');
        });

        it('should handle standard semantic version headers', () => {
            const sample = `
# Change Log

## [3.5.0] - 2026-08-18
### Added
- Added DotShare AI Release Copilot.
- Added Multi-Tone support.

## [3.4.0] - 2026-08-10
- Old release note.
            `;

            const result = ProjectContextService.extractLatestChangelogSection(sample);

            expect(result.version).toBe('3.5.0');
            expect(result.notes).toContain('[Added]');
            expect(result.notes).toContain('Added DotShare AI Release Copilot.');
            expect(result.notes).toContain('Added Multi-Tone support.');
        });

        it('should return empty array if no version heading is found', () => {
            const sample = `Just some random markdown without version headings.`;
            const result = ProjectContextService.extractLatestChangelogSection(sample);

            expect(result.notes).toEqual([]);
            expect(result.version).toBeUndefined();
        });
    });

    describe('searchGitByTopic', () => {
        it('should return empty array if topicQuery is empty or only special characters', async () => {
            const result = await ProjectContextService.searchGitByTopic('/fake/path', '   ');
            expect(result).toEqual([]);

            const result2 = await ProjectContextService.searchGitByTopic('/fake/path', '""\'\'``');
            expect(result2).toEqual([]);
        });

        it('should return empty array gracefully if directory has no .git', async () => {
            const result = await ProjectContextService.searchGitByTopic('/non/existent/git/dir', 'caching');
            expect(result).toEqual([]);
        });
    });

    describe('searchWorkspaceDocs', () => {
        it('should return empty array for empty query', async () => {
            const result = await ProjectContextService.searchWorkspaceDocs('/fake/path', '');
            expect(result).toEqual([]);
        });
    });

    describe('extractSearchKeywords', () => {
        it('should extract meaningful keywords and strip stop words', () => {
            const query = 'Please focus on our new offline caching engine and how it improves speed';
            const keywords = ProjectContextService.extractSearchKeywords(query);

            expect(keywords).toContain('offline');
            expect(keywords).toContain('caching');
            expect(keywords).toContain('engine');
            expect(keywords).not.toContain('please');
            expect(keywords).not.toContain('focus');
            expect(keywords).not.toContain('our');
            expect(keywords).not.toContain('and');
        });

        it('should strip Arabic stop words and keep technical terms', () => {
            const query = 'ركز على تحسين أداء الـ caching وتكامل SQLite الجديد';
            const keywords = ProjectContextService.extractSearchKeywords(query);

            expect(keywords).toContain('caching');
            expect(keywords).toContain('sqlite');
            expect(keywords).not.toContain('على');
            expect(keywords).not.toContain('ركز');
        });
    });

    describe('sanitizeSnippetSecrets', () => {
        it('should redact sensitive keys and tokens', () => {
            const snippet = `
                const apiKey = "sk-1234567890abcdef1234567890abcdef";
                const githubToken = "ghp_1234567890abcdef1234567890abcdef1234";
                const googleKey = "AIzaSyD-1234567890abcdef1234567890abcdef";
                const bearer = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ91234567890";
                const safeCode = "const port = 3000;";
            `;

            const { sanitized, hasRedacted } = ProjectContextService.sanitizeSnippetSecrets(snippet);

            expect(hasRedacted).toBe(true);
            expect(sanitized).not.toContain('sk-1234567890abcdef');
            expect(sanitized).not.toContain('ghp_1234567890abcdef');
            expect(sanitized).not.toContain('AIzaSyD-1234567890');
            expect(sanitized).toContain('[REDACTED_SECRET]');
            expect(sanitized).toContain('const port = 3000;');
        });

        it('should return untouched string if no secrets are present', () => {
            const cleanCode = 'export function add(a: number, b: number): number { return a + b; }';
            const { sanitized, hasRedacted } = ProjectContextService.sanitizeSnippetSecrets(cleanCode);

            expect(hasRedacted).toBe(false);
            expect(sanitized).toBe(cleanCode);
        });

        it('should consistently redact secrets across multiple sequential calls without regex lastIndex leakage', () => {
            // First call with a secret
            const call1 = ProjectContextService.sanitizeSnippetSecrets('const key1 = "sk-1111122222333334444455555";');
            expect(call1.hasRedacted).toBe(true);
            expect(call1.sanitized).toContain('[REDACTED_SECRET]');
            expect(call1.sanitized).not.toContain('sk-11111');

            // Second consecutive call with a different secret of the same pattern
            const call2 = ProjectContextService.sanitizeSnippetSecrets('const key2 = "sk-9999988888777776666655555";');
            expect(call2.hasRedacted).toBe(true);
            expect(call2.sanitized).toContain('[REDACTED_SECRET]');
            expect(call2.sanitized).not.toContain('sk-99999');

            // Third consecutive call with a Google key
            const call3 = ProjectContextService.sanitizeSnippetSecrets('const gKey = "AIzaSyD-1234567890abcdef1234567890abcdef";');
            expect(call3.hasRedacted).toBe(true);
            expect(call3.sanitized).toContain('[REDACTED_SECRET]');
            expect(call3.sanitized).not.toContain('AIzaSyD-1234567890');

            // Fourth consecutive call on the same pattern again
            const call4 = ProjectContextService.sanitizeSnippetSecrets('const gKey2 = "AIzaSyD-9876543210fedcba9876543210fedcba";');
            expect(call4.hasRedacted).toBe(true);
            expect(call4.sanitized).toContain('[REDACTED_SECRET]');
            expect(call4.sanitized).not.toContain('AIzaSyD-9876543210');
        });
    });
});
