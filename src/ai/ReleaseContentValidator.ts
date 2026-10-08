import { SocialPlatform } from '../types';
import { ReleaseGenerationRequest } from '../types/dotshare-ai';
import { parseFrontMatter } from '../utils/frontmatter-parser';
import { validateDevTo } from '../utils/blog-validator';
import { codeBlockError, readCodeBlocks } from './ReleaseCodeEvidence';

export interface ContentQualityResult {
    errors: string[];
    warnings: string[];
}

/** Deterministic evidence checks. These do not claim to prove every natural-language assertion. */
export function validateReleaseContent(text: string, request: ReleaseGenerationRequest, platform: SocialPlatform): ContentQualityResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!text.trim()) return { errors: ['The generated post is empty.'], warnings };
    const parsed = parseFrontMatter(text);
    const body = parsed.hasFrontmatter ? parsed.body : text;
    const { blocks, unclosed } = readCodeBlocks(body);
    if (unclosed) errors.push('Close every Markdown code fence and finish the article.');
    for (const block of blocks) {
        const issue = codeBlockError(block, request);
        if (issue) errors.push(issue);
    }
    const allowedUrls = new Set((request.ctaLinks || []).map(link => link.url));
    const urls = text.match(/https?:\/\/[^\s<>"'`]+/g) || [];
    for (const raw of urls) {
        // Strip Markdown closing punctuation only when it is not part of a selected URL.
        const url = allowedUrls.has(raw) ? raw : raw.replace(/[),.;\]}]+$/, '');
        if (!allowedUrls.has(url)) errors.push('Use only the exact selected CTA URLs; remove all other URLs.');
    }
    const evidence = [request.context.gitDiffSummary, ...(request.context.changelogNotes || []),
        ...(request.context.releaseDocuments || []).filter(doc => doc.kind !== 'planned').map(doc => doc.content)].join('\n');
    const fileEvidence = [...(request.context.changedFiles || []),
        ...(request.context.relevantCodeSnippets || []).flatMap(snippet => [snippet.file, snippet.code]),
        ...(request.context.releaseDocuments || []).flatMap(doc => [doc.file, doc.content]), evidence].join('\n');
    for (const match of body.matchAll(/`((?:[\w.-]+\/)+[\w.-]+\.(?:tsx?|jsx?|py|rs|go|java|cpp|h|cs|md|json|toml))`/g)) {
        if (!fileEvidence.includes(match[1])) errors.push(`Remove unsupported source path: ${match[1]}.`);
    }
    for (const match of body.matchAll(/\b(\d[\d,]*)\s+(files? changed|insertions?|deletions?|(?:passing |passed |successful )?tests?|passed)\b/gi)) {
        const number = match[1].replace(/,/g, '');
        const metric = /files? changed/i.test(match[2]) ? 'files? changed' : /insertions?/i.test(match[2]) ? 'insertions?' : /deletions?/i.test(match[2]) ? 'deletions?' : undefined;
        const supported = metric
            ? new RegExp(`\\b${number} ${metric}\\b`, 'i').test((request.context.gitDiffSummary || '').replace(/(\d),(?=\d{3}\b)/g, '$1'))
            : new RegExp(`\\b${number}\\b`).test(evidence.replace(/(\d),(?=\d{3}\b)/g, '$1'));
        if (!supported) errors.push(`Remove unsupported numeric claim: ${match[0]}.`);
    }
    if (/ground[ -]truth|prompt builder|project context|according to (?:the )?(?:prompt|instructions)/i.test(body)) {
        errors.push('Remove internal prompt and context terminology from the article.');
    }
    if (request.context.scope === 'release' && /only working[ -]tree change|(?:current|local) (?:uncommitted|working[ -]tree) (?:changes?|diff)|\(uncommitted\)/i.test(body)) {
        errors.push('Published-release articles must not discuss uncommitted working-tree changes.');
    }
    if (/no credential material|(?:impossible|guaranteed)\s+(?:to|security)|(?:forged|malicious) action cannot|completely (?:secure|safe)/i.test(body)) {
        warnings.push('Review absolute security claims against the supplied implementation and its documented limits.');
    }
    if (platform === 'devto') {
        if (!parsed.hasFrontmatter) errors.push('Start with YAML frontmatter containing title, description, tags and published: false.');
        const validation = validateDevTo({ title: parsed.frontmatter.title, body, tags: parsed.frontmatter.tags, description: parsed.frontmatter.description });
        errors.push(...validation.issues.filter(issue => issue.severity === 'error').map(issue => issue.message));
        if (body.trim() && !body.replace(/^ {0,3}#{1,6}[\t ]+[^\r\n]*$/gm, '').trim()) {
            errors.push('Article body contains only headings; write a complete explanation.');
        }
        if (parsed.frontmatter.published === true) errors.push('Generated articles must use published: false.');
    }
    return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
