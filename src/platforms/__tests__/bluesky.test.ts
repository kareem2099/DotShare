import { detectFacets } from '../bluesky';

const slice = (text: string, start: number, end: number): string => Buffer.from(text, 'utf8').subarray(start, end).toString('utf8');

it('marks links and hashtags with UTF-8 byte offsets', () => {
    const text = 'New post https://dev.to/freerave/part-1\n\n#BuildInPublic #VSCode';
    const facets = detectFacets(text);
    expect(facets.map(facet => facet.features[0])).toEqual([
        { $type: 'app.bsky.richtext.facet#link', uri: 'https://dev.to/freerave/part-1' },
        { $type: 'app.bsky.richtext.facet#tag', tag: 'BuildInPublic' },
        { $type: 'app.bsky.richtext.facet#tag', tag: 'VSCode' },
    ]);
    expect(facets.map(facet => slice(text, facet.index.byteStart, facet.index.byteEnd))).toEqual(['https://dev.to/freerave/part-1', '#BuildInPublic', '#VSCode']);
});

it('counts bytes, not characters, after emoji and Arabic text', () => {
    const text = 'مرحبا 🚀 https://example.com #تجربة';
    const facets = detectFacets(text);
    expect(facets.map(facet => slice(text, facet.index.byteStart, facet.index.byteEnd))).toEqual(['https://example.com', '#تجربة']);
    expect(facets[0].index.byteStart).toBeGreaterThan(text.indexOf('https'));
});

it('leaves sentence punctuation out of links and tags', () => {
    const text = 'Read https://example.com/post. Then #ship!';
    expect(detectFacets(text).map(facet => slice(text, facet.index.byteStart, facet.index.byteEnd))).toEqual(['https://example.com/post', '#ship']);
});

it('ignores numbers, mid-word hashes and URL fragments as tags', () => {
    expect(detectFacets('Issue #123 and C# and a#b')).toEqual([]);
    const text = 'Docs https://example.com/page#section';
    expect(detectFacets(text).map(facet => facet.features[0].$type)).toEqual(['app.bsky.richtext.facet#link']);
});

it('returns no facets for plain text', () => {
    expect(detectFacets('Just words here.')).toEqual([]);
});
