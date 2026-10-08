import { extractSourceExcerpts } from '../SourceExcerptExtractor';

it('selects the actual Python function after a long module header', () => {
    const header = '# Header comment\n'.repeat(40);
    const source = header + 'def recognize(value):\n    """Check cached values."""\n    tag = keyed_digest(value)\n    return tag in known\n';
    const diff = '@@ -41,3 +41,4 @@\n def recognize(value):\n     """Check cached values."""\n+    tag = keyed_digest(value)\n-    return False\n+    return tag in known\n';
    const excerpts = extractSourceExcerpts(source, diff, 'python');
    expect(excerpts).toHaveLength(1);
    expect(excerpts[0].startLine).toBe(41);
    expect(excerpts[0].code).toContain('def recognize(value):');
    expect(excerpts[0].code).not.toContain('Header comment');
    expect(excerpts[0].changedCode).toContain('keyed_digest');
});

it('ignores Python docstring text and does not treat calls as method declarations', () => {
    const source = '"""\nDocumentation text\n"""\n\ndef dispatch():\n    callback()\n    deliver()\n';
    const diff = '@@ -0,0 +1,7 @@\n' + source.split('\n').map(line => '+' + line).join('\n');
    const excerpts = extractSourceExcerpts(source, diff, 'python');
    expect(excerpts.some(excerpt => excerpt.code.startsWith('Documentation'))).toBe(false);
    expect(excerpts.find(excerpt => excerpt.startLine === 5)?.code).toContain('callback()');
});

it('extracts a TypeScript method with its actual signature', () => {
    const source = 'export class Dispatcher {\n    public send(): void {\n        queueAction();\n    }\n}\n';
    const diff = '@@ -1,5 +1,5 @@\n export class Dispatcher {\n     public send(): void {\n-        directAction();\n+        queueAction();\n     }\n }';
    expect(extractSourceExcerpts(source, diff, 'typescript')[0].code).toContain('public send(): void');
});
