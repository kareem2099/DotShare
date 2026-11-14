import * as fs from 'fs';
import * as path from 'path';
import { PLATFORM_CONFIGS } from '../../platforms/platform-config';
import { GIF_LIMITS, VIDEO_LIMITS } from '../preview';
import { FIRST_COMMENT_MAX, Platform } from '../schema';
import { AGENT_TOOL_NAMES } from '../tool-names';

// The agent skill states DotShare's limits in prose and tables. These tests keep it
// honest: when the code changes a limit, the skill must change with it.
const skill = path.resolve(__dirname, '../../../skills/dotshare');
const read = (file: string): string => fs.readFileSync(path.join(skill, file), 'utf8');
const NAMES: Record<string, Platform> = { X: 'x', Bluesky: 'bluesky', Mastodon: 'mastodon', LinkedIn: 'linkedin', Telegram: 'telegram', Discord: 'discord', 'Dev.to': 'devto' };
const MB = 1024 * 1024;

/** Rows of the first Markdown table after a heading, as cell arrays. */
function table(markdown: string, heading: string): string[][] {
    const start = markdown.indexOf(`\n## ${heading}\n`);
    expect(start).toBeGreaterThanOrEqual(0);
    const lines = markdown.slice(start).split('\n');
    const first = lines.findIndex(line => line.startsWith('|'));
    const rows: string[][] = [];
    for (const line of lines.slice(first + 2)) {
        if (!line.startsWith('|')) break;
        rows.push(line.split('|').slice(1, -1).map(cell => cell.trim()));
    }
    return rows;
}
/** "8 MB" → bytes, "1,000,000 bytes" → bytes, "no" → undefined. */
function size(cell: string): number | undefined {
    if (cell === 'no') return undefined;
    const mb = /^(\d+) MB$/.exec(cell);
    if (mb) return Number(mb[1]) * MB;
    const bytes = /^([\d,]+) bytes$/.exec(cell);
    if (bytes) return Number(bytes[1].replace(/,/g, ''));
    throw new Error(`Unreadable size: ${cell}`);
}

it('states each platform\'s text limit, threads and media count as the code does', () => {
    const rows = table(read('references/platforms.md'), 'Text and threads');
    expect(rows.map(row => NAMES[row[0]])).toEqual(Object.values(NAMES));
    for (const [name, limit, threads, media] of rows) {
        const config = PLATFORM_CONFIGS[NAMES[name]];
        expect({ name, limit: Number(limit), threads: threads === 'yes', media: Number(media) })
            .toEqual({ name, limit: config.maxChars, threads: config.supportsThreads, media: config.maxMediaCount });
    }
    const platforms = read('references/platforms.md');
    expect(platforms).toContain(`\`firstComment\` up to ${FIRST_COMMENT_MAX} characters`);
    expect(read('references/tools.md')).toContain(`LinkedIn only, ≤${FIRST_COMMENT_MAX}`);
});

it('states media sizes and formats as the code does', () => {
    const rows = table(read('references/platforms.md'), 'Media sizes');
    expect(rows.map(row => NAMES[row[0]])).toEqual(['x', 'bluesky', 'mastodon', 'linkedin', 'telegram', 'discord']);
    for (const [name, image, webp, gif, video, webm] of rows) {
        const platform = NAMES[name];
        expect({ name, image: size(image), webp: webp === 'yes', gif: size(gif), video: size(video), webm: webm === 'yes' }).toEqual({
            name, image: platform === 'bluesky' ? 1000000 : 8 * MB, webp: ['bluesky', 'mastodon', 'discord'].includes(platform),
            gif: GIF_LIMITS[platform], video: VIDEO_LIMITS[platform], webm: ['mastodon', 'discord'].includes(platform),
        });
    }
});

it('covers every DotShare tool and only real ones', () => {
    const all = ['SKILL.md', ...fs.readdirSync(path.join(skill, 'references')).map(file => `references/${file}`)].map(read).join('\n');
    for (const tool of AGENT_TOOL_NAMES) expect(all).toContain(`\`${tool}`);
    const mentioned = new Set([...all.matchAll(/`([a-z]+(?:_[a-z]+)+)\b/g)].map(match => match[1]));
    const known = new Set<string>([...AGENT_TOOL_NAMES, 'needs_review', 'via_dotsuite']);
    expect([...mentioned].filter(name => !known.has(name) && /^(list|get|create|update|preview|publish|schedule|cancel|set|save|delete|render)_/.test(name))).toEqual([]);
});

it('is a valid, lean skill whose links all resolve', () => {
    const main = read('SKILL.md');
    const front = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(main);
    expect(front?.[1]).toBe('dotshare');
    expect(front![2].length).toBeLessThanOrEqual(1024);
    expect(main.split('\n').length).toBeLessThan(200);
    for (const file of ['SKILL.md', ...fs.readdirSync(path.join(skill, 'references')).map(name => `references/${name}`)]) {
        for (const [, target] of read(file).matchAll(/\]\(((?!https?:)[^)#]+)\)/g)) {
            expect(fs.existsSync(path.resolve(path.dirname(path.join(skill, file)), target))).toBe(true);
        }
    }
    // Every reference is reachable from SKILL.md, one level deep.
    for (const name of fs.readdirSync(path.join(skill, 'references'))) expect(main).toContain(`(references/${name})`);
});
