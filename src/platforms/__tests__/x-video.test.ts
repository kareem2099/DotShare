import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { shareToX } from '../x';

jest.mock('axios');
jest.mock('../../utils/Logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const http = jest.mocked(axios);

let directory: string;
beforeEach(() => {
    jest.resetAllMocks(); jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-x-video-'));
});
afterEach(() => { jest.useRealTimers(); fs.rmSync(directory, { recursive: true, force: true }); });

const video = (bytes: number) => { const file = path.join(directory, 'demo.mp4'); fs.writeFileSync(file, Buffer.alloc(bytes, 1)); return file; };
const run = async (promise: Promise<unknown>) => {
    // Observe the outcome right away so an early rejection isn't reported as unhandled.
    const outcome = promise.then(value => ({ value }), (error: unknown) => ({ error }));
    for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(30_000);
    const result = await outcome;
    if ('error' in result) throw result.error;
    return result.value;
};

it('uploads videos in chunks, waits for processing, then attaches the media', async () => {
    http.post.mockImplementation(async (url: string) => {
        if (url.endsWith('/initialize')) return { data: { data: { id: 'm1' } } };
        if (url.endsWith('/append')) return { data: {} };
        if (url.endsWith('/finalize')) return { data: { data: { id: 'm1', processing_info: { state: 'pending', check_after_secs: 1 } } } };
        return { data: { data: { id: 'tweet-1' } } };
    });
    http.get.mockResolvedValueOnce({ data: { data: { processing_info: { state: 'in_progress', check_after_secs: 2 } } } })
        .mockResolvedValueOnce({ data: { data: { processing_info: { state: 'succeeded' } } } });
    const id = await run(shareToX('', '', { text: 'Demo', media: [video(9 * 1024 * 1024)] }, { tokenProvider: async () => 'token' }));
    expect(id).toBe('tweet-1');
    const urls = http.post.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
        'https://api.x.com/2/media/upload/initialize',
        'https://api.x.com/2/media/upload/m1/append', 'https://api.x.com/2/media/upload/m1/append', 'https://api.x.com/2/media/upload/m1/append',
        'https://api.x.com/2/media/upload/m1/finalize', 'https://api.twitter.com/2/tweets']);
    expect(http.post.mock.calls[0][1]).toEqual({ media_type: 'video/mp4', total_bytes: 9 * 1024 * 1024, media_category: 'tweet_video' });
    expect(http.get).toHaveBeenCalledWith('https://api.x.com/2/media/upload', expect.objectContaining({ params: { command: 'STATUS', media_id: 'm1' } }));
    expect(http.post.mock.calls[5][1]).toMatchObject({ text: 'Demo', media: { media_ids: ['m1'] } });
});

it('stops before posting when X fails to process the video', async () => {
    http.post.mockImplementation(async (url: string) => url.endsWith('/initialize') ? { data: { data: { id: 'm2' } } }
        : url.endsWith('/finalize') ? { data: { data: { processing_info: { state: 'failed' } } } } : { data: {} });
    await expect(run(shareToX('', '', { text: 'Demo', media: [video(1024)] }, { tokenProvider: async () => 'token' }))).rejects.toThrow('media upload failed');
    expect(http.post.mock.calls.some(([url]) => String(url).includes('/2/tweets'))).toBe(false);
});
