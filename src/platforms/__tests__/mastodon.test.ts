import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mastodonLength, normalizeMastodonInstance, shareToMastodon } from '../mastodon';

jest.mock('axios');
jest.mock('../../utils/Logger');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const INSTANCE = 'https://mastodon.example';
const TOKEN = 'test-token';

function mockInstance(maxChars = 500, maxMedia = 4): void {
    mockedAxios.get.mockResolvedValue({
        status: 200,
        data: { configuration: { statuses: { max_characters: maxChars, max_media_attachments: maxMedia } } },
    });
}

function statusCalls() {
    return mockedAxios.post.mock.calls.filter(([url]) => String(url).endsWith('/api/v1/statuses'));
}

function mediaCalls() {
    return mockedAxios.post.mock.calls.filter(([url]) => String(url).endsWith('/api/v2/media'));
}

beforeEach(() => {
    jest.resetAllMocks();
    let nextId = 100;
    mockedAxios.post.mockImplementation(async url => String(url).endsWith('/api/v2/media')
        ? { status: 200, data: { id: `media-${nextId++}` } }
        : { status: 200, data: { id: String(nextId++), url: `${INSTANCE}/@me/${nextId}` } });
});

describe('normalizeMastodonInstance', () => {
    it('reduces an address to its HTTPS origin', () => {
        expect(normalizeMastodonInstance(' mastodon.social ')).toBe('https://mastodon.social');
        expect(normalizeMastodonInstance('https://mastodon.social/@me/?x=1')).toBe('https://mastodon.social');
    });

    it('refuses anything that could leak the token', () => {
        expect(() => normalizeMastodonInstance('http://mastodon.social')).toThrow('HTTPS');
        expect(() => normalizeMastodonInstance('ftp://mastodon.social')).toThrow('HTTPS');
        expect(() => normalizeMastodonInstance('https://user:pw@mastodon.social')).toThrow('credentials');
        expect(() => normalizeMastodonInstance('   ')).toThrow('required');
    });
});

describe('mastodonLength', () => {
    it('counts every URL as 23 characters', () => {
        expect(mastodonLength(`a https://example.com/${'x'.repeat(100)}`)).toBe(2 + 23);
        expect(mastodonLength('a https://t.co')).toBe(2 + 23);
    });
});

describe('shareToMastodon', () => {
    it('posts a single status with a bearer token and refuses redirects', async () => {
        mockInstance();
        await shareToMastodon(INSTANCE, TOKEN, { text: 'hello' });

        expect(statusCalls()).toHaveLength(1);
        const [url, body, config] = statusCalls()[0];
        expect(url).toBe(`${INSTANCE}/api/v1/statuses`);
        expect(body).toEqual({ status: 'hello' });
        expect(config?.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
        expect(config?.maxRedirects).toBe(0);
    });

    it('never sends the token to a non-HTTPS instance', async () => {
        await expect(shareToMastodon('http://mastodon.example', TOKEN, { text: 'hello' })).rejects.toThrow('HTTPS');
        expect(mockedAxios.get).not.toHaveBeenCalled();
        expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('chains structured thread posts as replies', async () => {
        mockInstance();
        const url = await shareToMastodon(INSTANCE, TOKEN, { text: '', posts: [{ text: 'one' }, { text: 'two' }, { text: 'three' }] });

        const bodies = statusCalls().map(call => call[1] as Record<string, unknown>);
        expect(bodies.map(b => b.status)).toEqual(['one', 'two', 'three']);
        expect(bodies[0].in_reply_to_id).toBeUndefined();
        expect(bodies[1].in_reply_to_id).toBeDefined();
        expect(bodies[2].in_reply_to_id).not.toBe(bodies[1].in_reply_to_id);
        expect(url).toContain(INSTANCE);
    });

    it('splits long text using the limit reported by the instance', async () => {
        mockInstance(100);
        await shareToMastodon(INSTANCE, TOKEN, { text: 'word '.repeat(50).trim() });

        const texts = statusCalls().map(call => (call[1] as { status: string }).status);
        expect(texts.length).toBeGreaterThan(1);
        texts.forEach(text => expect(mastodonLength(text)).toBeLessThanOrEqual(100));
        expect(texts[0]).toMatch(/\(1\/\d+\)$/);
    });

    it('keeps a long URL intact when splitting', async () => {
        mockInstance(100);
        const link = `https://example.com/${'x'.repeat(200)}`;
        await shareToMastodon(INSTANCE, TOKEN, { text: `${'word '.repeat(30)}${link}` });

        const texts = statusCalls().map(call => (call[1] as { status: string }).status);
        expect(texts.some(text => text.includes(link))).toBe(true);
    });

    it('falls back to default limits when the instance lookup fails', async () => {
        mockedAxios.get.mockRejectedValue(new Error('network'));
        await shareToMastodon(INSTANCE, TOKEN, { text: 'x'.repeat(500) });
        expect(statusCalls()).toHaveLength(1);
    });

    describe('media', () => {
        let dir: string;
        let image: string;

        beforeEach(() => {
            dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-mastodon-test-'));
            image = path.join(dir, 'a.png');
            fs.writeFileSync(image, 'png');
        });
        afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

        it('attaches uploaded media, capped at the instance limit', async () => {
            mockInstance(500, 2);
            await shareToMastodon(INSTANCE, TOKEN, { text: 'pics', media: [image, image, image] });

            expect(mediaCalls()).toHaveLength(2);
            expect((statusCalls()[0][1] as { media_ids: string[] }).media_ids).toHaveLength(2);
        });

        it('does not publish the post when a file is missing', async () => {
            mockInstance();
            await expect(shareToMastodon(INSTANCE, TOKEN, { text: 'pics', media: [path.join(dir, 'gone.png')] })).rejects.toThrow();
            expect(statusCalls()).toHaveLength(0);
        });

        it('waits for 202 uploads to finish processing before posting', async () => {
            jest.useFakeTimers();
            try {
                mockedAxios.get.mockImplementation(async url => String(url).endsWith('/api/v2/instance')
                    ? { status: 200, data: {} }
                    : { status: mockedAxios.get.mock.calls.length > 2 ? 200 : 206, data: {} });
                mockedAxios.post.mockImplementation(async url => String(url).endsWith('/api/v2/media')
                    ? { status: 202, data: { id: 'slow' } }
                    : { status: 200, data: { id: '1', url: 'u' } });

                const sharing = shareToMastodon(INSTANCE, TOKEN, { text: 'video', media: [image] });
                await jest.advanceTimersByTimeAsync(2000);
                await sharing;

                const polls = mockedAxios.get.mock.calls.filter(([url]) => String(url).includes('/api/v1/media/slow'));
                expect(polls).toHaveLength(2);
                expect(statusCalls()).toHaveLength(1);
            } finally {
                jest.useRealTimers();
            }
        });
    });

    it('surfaces the server error and reports posts already published', async () => {
        mockInstance();
        mockedAxios.post
            .mockResolvedValueOnce({ status: 200, data: { id: '1', url: 'u' } })
            .mockRejectedValueOnce({ response: { data: { error: 'Validation failed: Text too long' } } });

        await expect(shareToMastodon(INSTANCE, TOKEN, { text: '', posts: [{ text: 'one' }, { text: 'two' }] }))
            .rejects.toThrow('Validation failed: Text too long (1 post(s) of the thread were already published)');
    });
});
