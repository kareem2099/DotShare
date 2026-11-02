import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveThreadMedia } from '../thread-media';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

let dir: string;
let tempPaths: string[];

beforeEach(() => {
    jest.resetAllMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-thread-media-test-'));
    tempPaths = [];
});
afterEach(() => {
    for (const p of tempPaths) fs.rmSync(p, { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
});

it('downloads uploaded media URLs to temp files the adapters can read', async () => {
    mockedAxios.get.mockResolvedValue({ data: Buffer.from('png-bytes'), headers: { 'content-type': 'image/png' } });

    const resolved = await resolveThreadMedia(['https://media.example/dotsuite/a.png'], tempPaths);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].endsWith('.png')).toBe(true);
    expect(fs.readFileSync(resolved[0], 'utf8')).toBe('png-bytes');
    expect(tempPaths).toEqual(resolved);
    expect(mockedAxios.get.mock.calls[0][1]).toMatchObject({ maxRedirects: 0, responseType: 'arraybuffer' });
});

it('passes existing local files through without copying them', async () => {
    const local = path.join(dir, 'b.jpg');
    fs.writeFileSync(local, 'jpg');

    expect(await resolveThreadMedia([local], tempPaths)).toEqual([local]);
    expect(tempPaths).toHaveLength(0);
    expect(mockedAxios.get).not.toHaveBeenCalled();
});

it('fails instead of silently dropping media it cannot resolve', async () => {
    await expect(resolveThreadMedia([path.join(dir, 'gone.png')], tempPaths)).rejects.toThrow('gone.png');
    await expect(resolveThreadMedia(['http://media.example/a.png'], tempPaths)).rejects.toThrow();
    expect(mockedAxios.get).not.toHaveBeenCalled();
});

it('rejects downloads that are not images or video', async () => {
    mockedAxios.get.mockResolvedValue({ data: Buffer.from('<html>'), headers: { 'content-type': 'text/html' } });
    await expect(resolveThreadMedia(['https://media.example/a.png'], tempPaths)).rejects.toThrow('Unsupported media type');
    expect(tempPaths).toHaveLength(0);
});
