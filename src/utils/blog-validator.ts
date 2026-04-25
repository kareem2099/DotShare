/**
 * Blog Validator — Pre-publish validation for Dev.to & Medium
 *
 * Two severity levels:
 *   error   → blocks publish entirely
 *   warning → shown to the user but does NOT block publish
 */

export interface ValidationIssue {
    severity: 'error' | 'warning';
    field:    'title' | 'body' | 'tags' | 'description' | 'coverImage' | 'general';
    message:  string;
    /** Optional: auto-fixed value the caller may use instead of blocking. */
    fixedValue?: unknown;
}

export interface ValidationResult {
    valid:    boolean;           // false if any error-level issue exists
    issues:   ValidationIssue[];
    /** Ready-to-use tags after dedup / trim / slice (if auto-fixable) */
    sanitizedTags?: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEVTO = {
    MAX_TAGS:          4,
    MAX_TAG_LENGTH:    30,
    MAX_TITLE_LENGTH:  128,
    MIN_WORD_COUNT:    50,
    BOILERPLATE_BODY:  'start writing your article here',
} as const;

const MEDIUM = {
    MAX_TAGS:          5,
    MAX_TITLE_LENGTH:  100,
    MIN_WORD_COUNT:    50,
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function isBoilerplate(body: string): boolean {
    return body.trim().toLowerCase().startsWith(DEVTO.BOILERPLATE_BODY);
}

/**
 * Sanitise a tag array:
 *  - trim whitespace
 *  - lowercase
 *  - remove empty strings
 *  - remove duplicates (case-insensitive)
 *  - enforce max tag length
 *  - clamp to `maxCount`
 */
function sanitizeTags(tags: string[], maxCount: number): {
    sanitized: string[];
    hadDuplicates: boolean;
    hadTooMany: boolean;
    hadInvalidChars: boolean;
    hadTooLong: boolean;
} {
    const seen = new Set<string>();
    const sanitized: string[] = [];
    let hadDuplicates    = false;
    let hadTooMany       = false;
    let hadInvalidChars  = false;
    let hadTooLong       = false;

    for (const raw of tags) {
        let tag = raw.trim().toLowerCase().replace(/\s+/g, '-');

        // Remove characters that aren't alphanumeric or hyphens
        const cleaned = tag.replace(/[^a-z0-9-]/g, '');
        if (cleaned !== tag) { hadInvalidChars = true; tag = cleaned; }

        if (!tag) continue;

        // Enforce max tag length (Dev.to: 30 chars)
        if (tag.length > 30) {
            hadTooLong = true;
            tag = tag.substring(0, 30);
        }

        if (seen.has(tag)) { hadDuplicates = true; continue; }
        seen.add(tag);
        sanitized.push(tag);
    }

    if (sanitized.length > maxCount) {
        hadTooMany = true;
        sanitized.splice(maxCount);
    }

    return { sanitized, hadDuplicates, hadTooMany, hadInvalidChars, hadTooLong };
}

// ── Dev.to Validator ──────────────────────────────────────────────────────────

export function validateDevTo(params: {
    title?:       string;
    body?:        string;
    tags?:        string[];
    description?: string;
}): ValidationResult {
    const issues: ValidationIssue[] = [];
    const { title = '', body = '', tags = [], description = '' } = params;

    // ── Errors (block publish) ────────────────────────────────────────────────

    if (!title.trim()) {
        issues.push({
            severity: 'error',
            field:    'title',
            message:  'Title is required for Dev.to articles.',
        });
    } else if (title.trim().length > DEVTO.MAX_TITLE_LENGTH) {
        issues.push({
            severity: 'error',
            field:    'title',
            message:  `Title is too long (${title.trim().length} chars). Dev.to limit is ${DEVTO.MAX_TITLE_LENGTH} characters.`,
        });
    }

    if (!body.trim()) {
        issues.push({
            severity: 'error',
            field:    'body',
            message:  'Article body is empty. Write some content before publishing.',
        });
    } else if (isBoilerplate(body)) {
        issues.push({
            severity: 'error',
            field:    'body',
            message:  'Article body still contains the boilerplate placeholder. Replace it with real content.',
        });
    }

    // ── Warnings (non-blocking) ───────────────────────────────────────────────

    if (body.trim() && !isBoilerplate(body) && wordCount(body) < DEVTO.MIN_WORD_COUNT) {
        issues.push({
            severity: 'warning',
            field:    'body',
            message:  `Article is very short (${wordCount(body)} words). Dev.to articles perform better with at least ${DEVTO.MIN_WORD_COUNT} words.`,
        });
    }

    if (!description.trim()) {
        issues.push({
            severity: 'warning',
            field:    'description',
            message:  'No description set. A good description improves SEO and discoverability.',
        });
    }

    let sanitizedTags: string[] | undefined;

    if (tags.length === 0) {
        issues.push({
            severity: 'warning',
            field:    'tags',
            message:  'No tags provided. Adding up to 4 relevant tags improves discoverability on Dev.to.',
        });
    } else {
        const { sanitized, hadDuplicates, hadTooMany, hadInvalidChars, hadTooLong } =
            sanitizeTags(tags, DEVTO.MAX_TAGS);

        sanitizedTags = sanitized;

        if (hadDuplicates) {
            issues.push({
                severity:   'warning',
                field:      'tags',
                message:    'Duplicate tags removed automatically.',
                fixedValue: sanitized,
            });
        }

        if (hadInvalidChars) {
            issues.push({
                severity:   'warning',
                field:      'tags',
                message:    'Some tags had invalid characters — cleaned automatically (only a-z, 0-9, hyphens allowed).',
                fixedValue: sanitized,
            });
        }

        if (hadTooLong) {
            issues.push({
                severity:   'warning',
                field:      'tags',
                message:    `One or more tags exceeded ${DEVTO.MAX_TAG_LENGTH} characters and were trimmed.`,
                fixedValue: sanitized,
            });
        }

        if (hadTooMany) {
            issues.push({
                severity:   'warning',
                field:      'tags',
                message:    `Dev.to allows a maximum of ${DEVTO.MAX_TAGS} tags. Extra tags have been removed automatically.`,
                fixedValue: sanitized,
            });
        }
    }

    const valid = !issues.some(i => i.severity === 'error');
    return { valid, issues, sanitizedTags };
}

// ── Medium Validator ──────────────────────────────────────────────────────────

export function validateMedium(params: {
    title?:       string;
    body?:        string;
    tags?:        string[];
}): ValidationResult {
    const issues: ValidationIssue[] = [];
    const { title = '', body = '', tags = [] } = params;

    // ── Errors ────────────────────────────────────────────────────────────────

    if (!title.trim()) {
        issues.push({
            severity: 'error',
            field:    'title',
            message:  'Title is required for Medium articles.',
        });
    } else if (title.trim().length > MEDIUM.MAX_TITLE_LENGTH) {
        issues.push({
            severity: 'warning',
            field:    'title',
            message:  `Title is longer than ${MEDIUM.MAX_TITLE_LENGTH} characters. Medium will synthesize a title from your content automatically — your title may be ignored.`,
        });
    }

    if (!body.trim()) {
        issues.push({
            severity: 'error',
            field:    'body',
            message:  'Article body is empty. Write some content before publishing.',
        });
    } else if (isBoilerplate(body)) {
        issues.push({
            severity: 'error',
            field:    'body',
            message:  'Article body still contains the boilerplate placeholder. Replace it with real content.',
        });
    }

    // ── Warnings ──────────────────────────────────────────────────────────────

    if (body.trim() && !isBoilerplate(body) && wordCount(body) < MEDIUM.MIN_WORD_COUNT) {
        issues.push({
            severity: 'warning',
            field:    'body',
            message:  `Article is very short (${wordCount(body)} words). Medium stories generally perform better with more content.`,
        });
    }

    let sanitizedTags: string[] | undefined;

    if (tags.length > MEDIUM.MAX_TAGS) {
        const { sanitized, hadDuplicates } = sanitizeTags(tags, MEDIUM.MAX_TAGS);
        sanitizedTags = sanitized;
        issues.push({
            severity:   'warning',
            field:      'tags',
            message:    `Medium supports a maximum of ${MEDIUM.MAX_TAGS} tags. Extra tags removed automatically.`,
            fixedValue: sanitized,
        });
        if (hadDuplicates) {
            issues.push({
                severity:   'warning',
                field:      'tags',
                message:    'Duplicate tags removed automatically.',
                fixedValue: sanitized,
            });
        }
    } else if (tags.length > 0) {
        const { sanitized, hadDuplicates } = sanitizeTags(tags, MEDIUM.MAX_TAGS);
        sanitizedTags = sanitized;
        if (hadDuplicates) {
            issues.push({
                severity:   'warning',
                field:      'tags',
                message:    'Duplicate tags removed automatically.',
                fixedValue: sanitized,
            });
        }
    }

    const valid = !issues.some(i => i.severity === 'error');
    return { valid, issues, sanitizedTags };
}

// ── Format issues as a human-readable summary ─────────────────────────────────

export function formatValidationSummary(result: ValidationResult): string {
    if (result.issues.length === 0) return '';
    const errors   = result.issues.filter(i => i.severity === 'error');
    const warnings = result.issues.filter(i => i.severity === 'warning');
    const parts: string[] = [];
    if (errors.length)   parts.push(errors.map(e => `❌ ${e.message}`).join('\n'));
    if (warnings.length) parts.push(warnings.map(w => `⚠️ ${w.message}`).join('\n'));
    return parts.join('\n');
}
