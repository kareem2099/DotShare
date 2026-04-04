/**
 * YAML Frontmatter Parser for Markdown files
 * 
 * Parses YAML frontmatter from markdown files and returns
 * structured metadata + body content.
 * 
 * Example:
 * ---
 * title: My Article
 * tags: [javascript, webdev]
 * description: A short description
 * ---
 * 
 * # Article content...
 */

export interface FrontMatter {
    title?: string;
    tags?: string[];
    description?: string;
    cover_image?: string;
    published?: boolean;
    date?: string;
    canonical_url?: string;
    series?: string;
}

export interface ParsedMarkdown {
    frontmatter: FrontMatter;
    body: string;
    hasFrontmatter: boolean;
}

/**
 * Parse YAML frontmatter from markdown content
 * 
 * @param content - Full markdown file content
 * @returns Parsed frontmatter and body
 */
export function parseFrontMatter(content: string): ParsedMarkdown {
    const result: ParsedMarkdown = {
        frontmatter: {},
        body: content,
        hasFrontmatter: false
    };

    // Check if content starts with frontmatter delimiter
    const trimmed = content.trim();
    if (!trimmed.startsWith('---')) {
        return result;
    }

    // Find the closing ---
    const endOfFirstLine = trimmed.indexOf('\n');
    if (endOfFirstLine === -1) {
        return result;
    }

    const afterFirstLine = trimmed.substring(endOfFirstLine + 1);
    const closingIndex = afterFirstLine.indexOf('\n---');
    
    if (closingIndex === -1) {
        // Try with --- at start of line
        const closingIndexAlt = afterFirstLine.search(/^---$/m);
        if (closingIndexAlt === -1) {
            return result;
        }
        // Found closing ---
        const yamlContent = afterFirstLine.substring(0, closingIndexAlt).trim();
        const bodyStart = closingIndexAlt + 3; // length of '---'
        const body = afterFirstLine.substring(bodyStart).trim();
        
        result.frontmatter = parseYaml(yamlContent);
        result.body = body;
        result.hasFrontmatter = true;
        return result;
    }

    // Found closing ---
    const yamlContent = afterFirstLine.substring(0, closingIndex).trim();
    const bodyStart = closingIndex + 4; // length of '\n---'
    const body = afterFirstLine.substring(bodyStart).trim();

    result.frontmatter = parseYaml(yamlContent);
    result.body = body;
    result.hasFrontmatter = true;
    return result;
}

/**
 * Simple YAML parser for frontmatter
 * Handles basic YAML syntax used in markdown frontmatter
 */
function parseYaml(yaml: string): FrontMatter {
    const result: FrontMatter = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const colonIndex = trimmed.indexOf(':');
        if (colonIndex === -1) continue;

        const key = trimmed.substring(0, colonIndex).trim();
        let value = trimmed.substring(colonIndex + 1).trim();

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        // Parse based on key
        switch (key) {
            case 'title':
                result.title = value;
                break;
            case 'description':
                result.description = value;
                break;
            case 'cover_image':
                result.cover_image = value;
                break;
            case 'canonical_url':
                result.canonical_url = value;
                break;
            case 'series':
                result.series = value;
                break;
            case 'date':
                result.date = value;
                break;
            case 'published':
                result.published = value.toLowerCase() === 'true' || value === 'yes';
                break;
            case 'tags':
                result.tags = parseTags(value);
                break;
        }
    }

    return result;
}

/**
 * Parse tags from YAML value
 * Supports multiple formats:
 * - [tag1, tag2, tag3]
 * - tag1, tag2, tag3
 * - "tag1", "tag2"
 */
function parseTags(value: string): string[] {
    const tags: string[] = [];

    // Remove outer brackets if present
    let cleaned = value.trim();
    if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
        cleaned = cleaned.slice(1, -1);
    }

    // Split by comma and clean each tag
    const parts = cleaned.split(',');
    for (const part of parts) {
        let tag = part.trim();
        // Remove quotes
        if ((tag.startsWith('"') && tag.endsWith('"')) ||
            (tag.startsWith("'") && tag.endsWith("'"))) {
            tag = tag.slice(1, -1);
        }
        if (tag) {
            tags.push(tag);
        }
    }

    return tags;
}

/**
 * Convert frontmatter back to YAML string
 * Useful for generating markdown with frontmatter
 */
export function stringifyFrontMatter(frontmatter: FrontMatter): string {
    const lines: string[] = ['---'];

    if (frontmatter.title) {
        lines.push(`title: "${frontmatter.title}"`);
    }
    if (frontmatter.description) {
        lines.push(`description: "${frontmatter.description}"`);
    }
    if (frontmatter.tags && frontmatter.tags.length > 0) {
        lines.push(`tags: [${frontmatter.tags.join(', ')}]`);
    }
    if (frontmatter.cover_image) {
        lines.push(`cover_image: "${frontmatter.cover_image}"`);
    }
    if (frontmatter.canonical_url) {
        lines.push(`canonical_url: "${frontmatter.canonical_url}"`);
    }
    if (frontmatter.series) {
        lines.push(`series: "${frontmatter.series}"`);
    }
    if (frontmatter.date) {
        lines.push(`date: "${frontmatter.date}"`);
    }
    if (frontmatter.published !== undefined) {
        lines.push(`published: ${frontmatter.published}`);
    }

    lines.push('---');
    return lines.join('\n');
}