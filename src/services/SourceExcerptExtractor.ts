export interface SourceExcerpt {
    startLine: number;
    endLine: number;
    code: string;
    truncated: boolean;
    changedLines: number;
    changedCode: string;
}

/** Find enclosing functions around added executable lines, rather than slicing diff headers. */
export function extractSourceExcerpts(source: string, diff: string, language: string): SourceExcerpt[] {
    const lines = source.split(/\r?\n/);
    let docstring: string | undefined;
    const executable = lines.map(line => {
        if (language !== 'python') return true;
        const markers = [...line.matchAll(/"""|'''/g)].map(match => match[0]);
        const inside = !!docstring;
        for (const marker of markers) {
            if (!docstring) docstring = marker;
            else if (docstring === marker) docstring = undefined;
        }
        return !inside && markers.length === 0;
    });
    const additions: number[] = [];
    let cursor = -1;
    for (const line of diff.split('\n')) {
        const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
        if (header) { cursor = Number(header[1]) - 1; continue; }
        if (cursor < 0 || /^(diff |index |---|\+\+\+|\\)/.test(line)) continue;
        if (line.startsWith('-')) continue;
        if (line.startsWith('+')) {
            const content = line.slice(1).trim();
            if (content && executable[cursor] && !/^(?:#|\/\/|\*|["']{3}|import\b|from\b.*\bimport\b)/.test(content)) additions.push(cursor);
            cursor++;
        } else if (line.startsWith(' ')) cursor++;
    }
    const declaration = (line: string) => language === 'python'
        ? /^\s*(?:async\s+)?(?:def|class)\s+\w+/.test(line)
        : !/^\s*(?:if|for|while|switch|return|with|except|catch|assert|print)\b/.test(line) && (
            /^\s*(?:(?:export|public|private|protected|static|async|pub|unsafe)\s+)*(?:function|func|fn|class)\b/.test(line) ||
            /^\s*(?:(?:public|private|protected|static|async)\s+)*(?:[\w<>[\],?]+\s+)?\w+\s*\([^;]*\)\s*(?::[^=]+)?\s*\{/.test(line) ||
            /^\s*(?:export\s+)?(?:const|let)\s+\w+\s*=.*=>/.test(line));
    const declarations = lines.map((line, index) => declaration(line) ? index : -1).filter(index => index >= 0);
    const indent = (line: string) => line.match(/^\s*/)?.[0].replace(/\t/g, '    ').length || 0;
    const groups = new Map<number, number[]>();
    for (const added of additions) {
        if (added >= lines.length) continue;
        const candidates = declarations.filter(index => index <= added && indent(lines[index]) <= indent(lines[added]));
        const start = candidates[candidates.length - 1] ?? Math.max(0, added - 5);
        const existing = groups.get(start) || [];
        existing.push(added); groups.set(start, existing);
    }
    const result: SourceExcerpt[] = [];
    for (const [functionStart, changed] of groups) {
        let end = lines.length;
        if (language === 'python') {
            const depth = indent(lines[functionStart]);
            const next = lines.findIndex((line, index) => index > functionStart && line.trim() &&
                !/^\s*#/.test(line) && indent(line) <= depth && !/^\s*[)\]}]/.test(line));
            if (next >= 0) end = next;
        } else {
            // Keep bounded context; braces/signatures can span lines in several languages.
            const next = declarations.find(index => index > changed[changed.length - 1] && indent(lines[index]) <= indent(lines[functionStart]));
            if (next !== undefined) end = next;
        }
        end = Math.max(end, changed[changed.length - 1] + 1);
        let start = functionStart;
        let truncated = false;
        if (end - start > 90) {
            start = Math.max(functionStart, changed[0] - 10);
            end = Math.min(end, start + 90);
            truncated = true;
        }
        let code = lines.slice(start, end).join('\n').trimEnd();
        if (code.length > 5500) {
            const limited = code.slice(0, 5500);
            code = limited.slice(0, limited.lastIndexOf('\n') > 0 ? limited.lastIndexOf('\n') : limited.length);
            end = start + code.split('\n').length;
            truncated = true;
        }
        if (code.trim()) result.push({ startLine: start + 1, endLine: end, code, truncated,
            changedLines: changed.length, changedCode: changed.map(index => lines[index]).join('\n') });
    }
    return result;
}
