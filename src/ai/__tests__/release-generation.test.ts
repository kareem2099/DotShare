import { ReleaseGenerationRequest } from '../../types/dotshare-ai';
import { validateReleaseContent } from '../ReleaseContentValidator';
import { ReleaseGenerationService } from '../ReleaseGenerationService';
import { GenerationError } from '../GenerationError';
import { omitUnverifiedCode } from '../ReleaseCodeEvidence';

const request: ReleaseGenerationRequest = {
    context: {
        projectName: 'Example', version: '1.1.0', scope: 'release', releaseTag: 'v1.1.0',
        gitDiffSummary: '2 files changed, 10 insertions(+), 3 deletions(-)',
        relevantCodeSnippets: [{ file: 'core/vault.py', code: 'def recognize(value):\n    return digest(value) in cached_digests', language: 'python' }],
        releaseDocuments: [{ file: 'docs/releases/1.1.0.md', content: '589 passed. Manual desktop verification is still required.', kind: 'release_notes' }]
    },
    targetPlatforms: ['devto'], tone: 'full_markdown_article', language: 'en', includeCodeSnippets: true,
    ctaLinks: [{ id: 'repo', label: 'Repository', url: 'https://github.com/example/project', source: 'repository' }]
};
const article = (body = 'Stored values are recognized after auto-lock. Release verification reports 589 passing tests. Manual desktop verification is still required.') => `---\ntitle: Example 1.1.0\npublished: false\ntags: python, security\ndescription: Recognition improvements\n---\n\n${body}`;

it('accepts source-backed excerpts, selected URLs and reported verification', () => {
    const text = article('589 passing tests.\n```python\ndef recognize(value):\n    return digest(value) in cached_digests\n```\n[Repository](https://github.com/example/project)');
    expect(validateReleaseContent(text, request, 'devto').errors).toEqual([]);
});

it('rejects invented implementations, unsupported statistics and unselected URLs', () => {
    const result = validateReleaseContent(article('999 passing tests.\n```python\nclass FakeVault: pass\n```\nhttps://fake.example.com'), request, 'devto');
    expect(result.errors.some(error => error.includes('verbatim'))).toBe(true);
    expect(result.errors.some(error => error.includes('999'))).toBe(true);
    expect(result.errors.some(error => error.includes('CTA'))).toBe(true);
});

it('rejects unclosed code, disabled code and local edits in a release article', () => {
    const result = validateReleaseContent(article('The only working-tree change is documentation (uncommitted).\n```python\nreturn True'), { ...request, includeCodeSnippets: false }, 'devto');
    expect(result.errors.some(error => error.includes('Close every'))).toBe(true);
    expect(result.errors.some(error => error.includes('working-tree'))).toBe(true);
    expect(validateReleaseContent(article('```python\nreturn True\n```'), { ...request, includeCodeSnippets: false }, 'devto').errors).toContain('Code snippets are disabled; remove all fenced code blocks.');
});

it('checks tilde fences and disallows accidental publication', () => {
    expect(validateReleaseContent(article('~~~python\nreturn True'), request, 'devto').errors).toContain('Close every Markdown code fence and finish the article.');
    expect(validateReleaseContent(article().replace('published: false', 'published: true'), request, 'devto').errors).toContain('Generated articles must use published: false.');
});

it('accepts only documented or selected-repository checkout commands', () => {
    const clone = article('```bash\ngit clone https://github.com/example/project\ncd project\ngit checkout v1.1.0\n```');
    expect(validateReleaseContent(clone, request, 'devto').errors).toEqual([]);
    expect(validateReleaseContent(article('```bash\npip install fictional-package\n```'), request, 'devto').errors.some(error => error.includes('Shell commands'))).toBe(true);
});

it('repairs once using the same evidence before returning an article', async () => {
    const generate = jest.fn().mockResolvedValueOnce(article('```python\nclass FakeVault: pass\n```')).mockResolvedValueOnce(article());
    const result = await ReleaseGenerationService.generate(request, 'devto', generate);
    expect(result.text).toBe(article());
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain('REPAIR PASS');
    expect(generate.mock.calls[1][0]).toContain('docs/releases/1.1.0.md');
});

it('fails after one unsuccessful repair instead of accepting invalid content', async () => {
    const generate = jest.fn().mockResolvedValue(article('999 passing tests.'));
    await expect(ReleaseGenerationService.generate(request, 'devto', generate)).rejects.toThrow('validation failed after repair');
    expect(generate).toHaveBeenCalledTimes(2);
});

it('retries a token-truncated response once with a larger budget', async () => {
    const generate = jest.fn().mockRejectedValueOnce(new GenerationError('Incomplete', true)).mockResolvedValueOnce(article());
    await expect(ReleaseGenerationService.generate(request, 'devto', generate)).resolves.toMatchObject({ text: article() });
    expect(generate.mock.calls[1][1]).toBeGreaterThan(generate.mock.calls[0][1]);
});

it('does not spend a repair request on an API authentication or network error', async () => {
    const generate = jest.fn().mockRejectedValue(new Error('Unauthorized'));
    await expect(ReleaseGenerationService.generate(request, 'devto', generate)).rejects.toThrow('Unauthorized');
    expect(generate).toHaveBeenCalledTimes(1);
});

it('surfaces remaining heuristic security warnings after a bounded repair', async () => {
    const generate = jest.fn().mockResolvedValue(article('The implementation is completely secure.'));
    const result = await ReleaseGenerationService.generate(request, 'devto', generate);
    expect(result.warnings).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(2);
});

it('does not confuse an unrelated documented number with a Git diff statistic', () => {
    const result = validateReleaseContent(article('589 files changed.'), request, 'devto');
    expect(result.errors).toContain('Remove unsupported numeric claim: 589 files changed.');
});

it('rejects phantom source paths and allows paths supplied in evidence', () => {
    expect(validateReleaseContent(article('Updated `src/imaginary.ts`.'), request, 'devto').errors).toContain('Remove unsupported source path: src/imaginary.ts.');
    expect(validateReleaseContent(article('See `core/vault.py`.'), request, 'devto').errors).toEqual([]);
});

it('returns the article with a review notice when repair still invents code', async () => {
    const invalid = article(`${article().split('---\n\n')[1]}\n\n\`\`\`python\nclass FakeVault: pass\n\`\`\``);
    const generate = jest.fn().mockResolvedValue(invalid);
    const result = await ReleaseGenerationService.generate(request, 'devto', generate);
    expect(result.text).toContain('589 passing tests');
    expect(result.text).toContain('published: false');
    expect(result.text).not.toContain('FakeVault');
    expect(result.text).not.toContain('```');
    expect(result.warnings).toEqual([expect.stringContaining('Omitted 1 code example')]);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain('Code is optional');
    expect(validateReleaseContent(result.text, request, 'devto').errors).toEqual([]);
});

it('omits only rejected blocks, preserving verified code, prose and frontmatter', async () => {
    const supported = '```python\ndef recognize(value):\n    return digest(value) in cached_digests\n```';
    const invalid = article(`Recognition uses stored digests.\n${supported}\n\n~~~python\nclass FakeVault: pass\n~~~\n\nManual desktop verification is still required.\n\`\`\`bash\npip install fictional-package\n\`\`\``);
    const result = await ReleaseGenerationService.generate(request, 'devto', jest.fn().mockResolvedValue(invalid));
    expect(result.text).toContain(supported);
    expect(result.text).toContain('Manual desktop verification is still required.');
    expect(result.text).not.toMatch(/FakeVault|fictional-package/);
    expect(result.warnings[0]).toContain('Omitted 2 code example');
});

it.each(['999 passing tests.', 'https://fake.example.com', 'See `src/imaginary.ts`.'])('still rejects unsupported prose after dropping code: %s', async body => {
    const generate = jest.fn().mockResolvedValue(article(`${body}\n\`\`\`python\nclass FakeVault: pass\n\`\`\``));
    await expect(ReleaseGenerationService.generate(request, 'devto', generate)).rejects.toThrow('validation failed after repair');
    expect(generate).toHaveBeenCalledTimes(2);
});

it('removes code against an explicit opt-out without losing the article', async () => {
    const generate = jest.fn().mockResolvedValue(article('Recognition behavior improved.\n```python\ndef recognize(value):\n    return digest(value) in cached_digests\n```'));
    const result = await ReleaseGenerationService.generate({ ...request, includeCodeSnippets: false }, 'devto', generate);
    expect(result.text).toContain('Recognition behavior improved.');
    expect(result.text).not.toContain('```');
    expect(result.warnings[0]).toContain('code excerpts are disabled');
});

it.each(['', '# Implementation\n'])('does not return a code-only or heading-only article after omission', async body => {
    const generate = jest.fn().mockResolvedValue(article(`${body}\n\`\`\`python\nclass FakeVault: pass\n\`\`\``));
    await expect(ReleaseGenerationService.generate(request, 'devto', generate)).rejects.toThrow('Article body');
});

it('does not salvage an unclosed article by deleting its tail', async () => {
    const invalid = article('Recognition improved.\n```python\nclass FakeVault: pass\n```\n```python\nunfinished');
    expect(omitUnverifiedCode(invalid, request)).toEqual({ text: invalid, removed: 0 });
    await expect(ReleaseGenerationService.generate(request, 'devto', jest.fn().mockResolvedValue(invalid))).rejects.toThrow('Close every Markdown code fence');
});

it('accepts a contiguous excerpt with uniform display dedent and CRLF fences', () => {
    const text = article('Recognizes cached digests.\r\n```python title="excerpt"\r\nreturn digest(value) in cached_digests\r\n```\r\n');
    expect(validateReleaseContent(text, request, 'devto').errors).toEqual([]);
});

it.each(['text', 'plaintext', 'console', 'output', 'mermaid'])('does not allow a fence label to disguise unsupported content: %s', language => {
    expect(validateReleaseContent(article(`\`\`\`${language}\nclass FakeVault: pass\n\`\`\``), request, 'devto').errors.some(error => error.includes('verbatim'))).toBe(true);
});

it('preserves Python indentation and significant whitespace in string literals', () => {
    const scopedRequest = { ...request, context: { ...request.context, relevantCodeSnippets: [{ file: 'core/vault.py', code: 'def test():\n    if ready:\n        return "two  spaces"\n    return None' }] } };
    for (const code of ['def test():\n    if ready:\n    return "two  spaces"\n    return None', 'def test():\n    if ready:\n        return "two spaces"\n    return None']) {
        expect(validateReleaseContent(article(`\`\`\`python\n${code}\n\`\`\``), scopedRequest, 'devto').errors.some(error => error.includes('verbatim'))).toBe(true);
    }
});

it('accepts documented fenced examples but not prose that merely mentions a command', () => {
    const scopedRequest = { ...request, context: { ...request.context, releaseDocuments: [{ file: 'README.md', content: '```sh\npython -m project\n```\nDo not run pip install fictional-package.', kind: 'architecture' as const }] } };
    expect(validateReleaseContent(article('```bash\npython -m project\n```'), scopedRequest, 'devto').errors).toEqual([]);
    expect(validateReleaseContent(article('```bash\npip install fictional-package\n```'), scopedRequest, 'devto').errors.some(error => error.includes('Shell commands'))).toBe(true);
});

it('preserves outer fences and documented nested fence content when omitting other blocks', () => {
    const example = '````markdown\n```python\nreal_example()\n```\n````';
    const scopedRequest = { ...request, context: { ...request.context, releaseDocuments: [{ file: 'README.md', content: example, kind: 'architecture' as const }] } };
    const text = article(`Recognition improved.\n${example}\n\`\`\`python\nclass FakeVault: pass\n\`\`\``);
    const cleaned = omitUnverifiedCode(text, scopedRequest);
    expect(cleaned.removed).toBe(1);
    expect(cleaned.text).toContain(example);
    expect(cleaned.text).not.toContain('FakeVault');
});

it('removes a dangling checkout introduction with the rejected commands', async () => {
    const body = 'Recognition improved.\n\n## What to look at next\n\nTo inspect the release, clone the repository and check out the tagged snapshot:\n\n```bash\npip install fictional-package\n```\n\nBug reports are welcome.';
    const result = await ReleaseGenerationService.generate(request, 'devto', jest.fn().mockResolvedValue(article(body)));
    expect(result.text).not.toContain('To inspect the release');
    expect(result.text).not.toContain('fictional-package');
    expect(result.text).toContain('## What to look at next');
    expect(result.text).toContain('Bug reports are welcome.');
});

it.each([
    'The following code illustrates the change:',
    'أوامر تشغيل المثال:',
])('removes only the standalone lead-in to an omitted example: %s', intro => {
    const text = article(`Recognition improved.\n\n${intro}\n\n\`\`\`python\nclass FakeVault: pass\n\`\`\`\n\nManual checks remain.`);
    const result = omitUnverifiedCode(text, request);
    expect(result.text).not.toContain(intro);
    expect(result.text).toContain('Recognition improved.');
    expect(result.text).toContain('Manual checks remain.');
});

it('keeps surrounding substantive claims available for validation', async () => {
    const body = '999 passing tests.\n\nRecognition improved.\n\n```python\nclass FakeVault: pass\n```';
    expect(omitUnverifiedCode(article(body), request).text).toContain('999 passing tests.');
    await expect(ReleaseGenerationService.generate(request, 'devto', jest.fn().mockResolvedValue(article(body)))).rejects.toThrow('999 passing tests');
});

it('preserves an introduction when its code is verified', () => {
    const text = article('The following code recognizes stored values:\n\n```python\ndef recognize(value):\n    return digest(value) in cached_digests\n```');
    expect(omitUnverifiedCode(text, request)).toEqual({ text, removed: 0 });
});

it('does not consume a preceding verified block when the next introduction lacks a blank line', () => {
    const supported = '```python\ndef recognize(value):\n    return digest(value) in cached_digests\n```';
    const text = article(`Recognition improved.\n\n${supported}\nThe following code is an example:\n\`\`\`python\nclass FakeVault: pass\n\`\`\``);
    const result = omitUnverifiedCode(text, request);
    expect(result.text).toContain(supported);
    expect(result.text).not.toContain('FakeVault');
});
