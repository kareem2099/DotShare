import { ReleaseGenerationRequest } from '../types/dotshare-ai';

interface CodeBlock {
    start: number;
    end: number;
    language: string;
    code: string;
}

export const UNVERIFIED_CODE = 'Code examples must be verbatim excerpts from supplied implementation evidence. Remove invented or illustrative code.';
const DISABLED_CODE = 'Code snippets are disabled; remove all fenced code blocks.';
const UNVERIFIED_COMMAND = 'Shell commands must come from supplied documentation; omit unverified setup instructions.';

/** Shared fence parser keeps validation and removal on exactly the same block boundaries. */
export function readCodeBlocks(text: string): { blocks: CodeBlock[]; unclosed: boolean } {
    const fences = text.matchAll(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?$/gm);
    let open: RegExpMatchArray | undefined;
    const blocks: CodeBlock[] = [];
    for (const fence of fences) {
        if (!open) {
            // Backtick fence info strings cannot themselves contain backticks.
            if (fence[1][0] !== '`' || !fence[2].includes('`')) open = fence;
            continue;
        }
        if (fence[1][0] === open[1][0] && fence[1].length >= open[1].length && !fence[2].trim()) {
            blocks.push({ start: open.index!, end: fence.index! + fence[0].length,
                language: open[2].trim().split(/\s+/)[0].toLowerCase(),
                code: text.slice(open.index! + open[0].length, fence.index) });
            open = undefined;
        }
    }
    return { blocks, unclosed: !!open };
}

function lines(value: string): string[] {
    const result = value.replace(/\r\n?/g, '\n').split('\n');
    while (result.length && !result[0].trim()) result.shift();
    while (result.length && !result[result.length - 1].trim()) result.pop();
    return result;
}

/** Allow a uniform dedent for display, preserving internal indentation and string literals. */
function dedent(value: string[]): string {
    const indentation = value.filter(line => line.trim()).map(line => line.match(/^[\t ]*/)?.[0] || '');
    let prefix = indentation[0] || '';
    for (const indent of indentation) {
        while (!indent.startsWith(prefix)) prefix = prefix.slice(0, -1);
    }
    return value.map(line => line.startsWith(prefix) ? line.slice(prefix.length) : line).join('\n');
}

function isExcerpt(code: string, evidence: string): boolean {
    const candidate = lines(code);
    if (!candidate.length) return false;
    const expected = dedent(candidate);
    const source = lines(evidence);
    for (let start = 0; start <= source.length - candidate.length; start++) {
        if (dedent(source.slice(start, start + candidate.length)) === expected) return true;
    }
    return false;
}

export function codeBlockError(block: CodeBlock, request: ReleaseGenerationRequest): string | undefined {
    if (request.includeCodeSnippets === false) return DISABLED_CODE;
    const documentedBlocks = (request.context.releaseDocuments || []).filter(doc => doc.kind !== 'planned')
        .flatMap(doc => readCodeBlocks(doc.content).blocks);
    if (documentedBlocks.some(example => isExcerpt(block.code, example.code))) return undefined;
    if (['bash', 'sh', 'shell', 'zsh'].includes(block.language)) {
        const repo = request.ctaLinks?.find(link => link.source === 'repository')?.url;
        const commands = lines(block.code).filter(line => line.trim() && !line.trim().startsWith('#'));
        const safeCheckout = commands.length > 0 && commands.every(line =>
            (!!repo && line.trim() === `git clone ${repo}`) ||
            (!!request.context.releaseTag && line.trim() === `git checkout ${request.context.releaseTag}`) ||
            (!!repo && line.trim() === `cd ${repo.split('/').pop()?.replace(/\.git$/, '')}`));
        return safeCheckout ? undefined : UNVERIFIED_COMMAND;
    }
    // Plaintext/output/diagram labels must not bypass provenance checks either.
    return (request.context.relevantCodeSnippets || []).some(snippet => isExcerpt(block.code, snippet.code))
        ? undefined : UNVERIFIED_CODE;
}

/** Omit closed, unverifiable blocks only. An unfinished article still requires repair. */
export function omitUnverifiedCode(text: string, request: ReleaseGenerationRequest): { text: string; removed: number } {
    const { blocks, unclosed } = readCodeBlocks(text);
    if (unclosed) return { text, removed: 0 };
    const rejected = blocks.filter(block => codeBlockError(block, request));
    let cleaned = text;
    for (const block of rejected.reverse()) {
        const before = cleaned.slice(0, block.start);
        const paragraphEnd = before.trimEnd().length;
        let paragraphStart = 0;
        for (const boundary of before.slice(0, paragraphEnd).matchAll(/\r?\n[\t ]*\r?\n/g)) {
            paragraphStart = boundary.index! + boundary[0].length;
        }
        const paragraph = before.slice(paragraphStart, paragraphEnd).trim();
        // Remove only a short, standalone introduction to the omitted example.
        // Keep other prose for revalidation and the author's review notice.
        const leadIn = paragraph.length <= 400 && /[:：]$/.test(paragraph) &&
            !/^ {0,3}(?:#{1,6}\s|`{3,}|~{3,}|---[\t ]*$)/m.test(paragraph) &&
            /\b(?:code|snippet|example|commands?|clone|check out|checkout)\b|(?:الكود|المقتطف|المثال|الأوامر|الاوامر)/i.test(paragraph);
        cleaned = cleaned.slice(0, leadIn ? paragraphStart : block.start) + cleaned.slice(block.end);
    }
    return { text: cleaned, removed: rejected.length };
}
