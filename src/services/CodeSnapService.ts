import * as vscode from 'vscode';
import * as path from 'path';

export interface CodeSnapData {
    code: string;
    language: string;
    fileName: string;
    lineStart: number;
    lineEnd: number;
    hasSelection: boolean;
}

/**
 * CodeSnapService
 *
 * Reads the active editor state and returns everything the
 * CodeSnap WebView needs to render a code image.
 *
 * Precedence:
 *   1. Active selection  (user highlighted text)
 *   2. Full file content (fallback when nothing is selected)
 */
export class CodeSnapService {

    /**
     * Capture the current editor state.
     * Returns null when no editor is open.
     */
    public static capture(): CodeSnapData | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return null;

        const doc       = editor.document;
        const selection = editor.selection;
        const hasSelection = !selection.isEmpty;

        let code: string;
        let lineStart: number;
        let lineEnd: number;

        if (hasSelection) {
            code      = doc.getText(selection);
            lineStart = selection.start.line + 1;   // 1-indexed for display
            lineEnd   = selection.end.line   + 1;
        } else {
            code      = doc.getText();
            lineStart = 1;
            lineEnd   = doc.lineCount;
        }

        // Convert tabs to 4 spaces since HTML Canvas struggles with \t rendering
        code = code.replace(/\t/g, '    ');

        // Normalise indentation — strip the common leading whitespace so
        // the snapshot doesn't waste space on deep nesting.
        code = CodeSnapService._stripCommonIndent(code);

        return {
            code,
            language:     CodeSnapService._resolveLanguage(doc.languageId, doc.fileName),
            fileName:     path.basename(doc.fileName),
            lineStart,
            lineEnd,
            hasSelection,
        };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Map VS Code languageId → Highlight.js language alias.
     * Falls back to 'plaintext' for unknown languages.
     */
    private static _resolveLanguage(languageId: string, fileName: string): string {
        const MAP: Record<string, string> = {
            typescript:         'typescript',
            typescriptreact:    'typescript',
            javascript:         'javascript',
            javascriptreact:    'javascript',
            python:             'python',
            rust:               'rust',
            go:                 'go',
            java:               'java',
            cpp:                'cpp',
            c:                  'c',
            csharp:             'csharp',
            html:               'html',
            css:                'css',
            scss:               'scss',
            json:               'json',
            jsonc:              'json',
            yaml:               'yaml',
            markdown:           'markdown',
            shellscript:        'bash',
            bash:               'bash',
            powershell:         'powershell',
            sql:                'sql',
            xml:                'xml',
            php:                'php',
            ruby:               'ruby',
            swift:              'swift',
            kotlin:             'kotlin',
            dart:               'dart',
            dockerfile:         'dockerfile',
            toml:               'toml',
            ini:                'ini',
            plaintext:          'plaintext',
        };

        if (MAP[languageId]) return MAP[languageId];

        // Fallback: try to guess from extension
        const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
        const EXT_MAP: Record<string, string> = {
            ts: 'typescript', tsx: 'typescript',
            js: 'javascript', jsx: 'javascript',
            py: 'python', rs: 'rust', go: 'go',
            java: 'java', cpp: 'cpp', c: 'c',
            cs: 'csharp', html: 'html', css: 'css',
            json: 'json', yaml: 'yaml', yml: 'yaml',
            sh: 'bash', sql: 'sql', php: 'php',
            rb: 'ruby', swift: 'swift', kt: 'kotlin',
        };

        return EXT_MAP[ext] ?? 'plaintext';
    }

    /**
     * Remove the common leading whitespace from every non-empty line.
     * Preserves relative indentation between lines.
     */
    private static _stripCommonIndent(code: string): string {
        const lines = code.split('\n');

        const indents = lines
            .filter(l => l.trim().length > 0)
            .map(l => l.match(/^(\s*)/)?.[1].length ?? 0);

        if (indents.length === 0) return code;

        const minIndent = Math.min(...indents);
        if (minIndent === 0) return code;

        return lines
            .map(l => l.slice(minIndent))
            .join('\n')
            .trimEnd();
    }
}
