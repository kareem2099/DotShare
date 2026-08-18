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
});
