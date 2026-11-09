import axios from 'axios';
import { shareToLinkedIn } from '../linkedin';

jest.mock('axios');
jest.mock('../../utils/Logger');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const POST_URN = 'urn:li:share:7300000000000000000';
const comments = () => mockedAxios.post.mock.calls.filter(([url]) => String(url).includes('/socialActions/'));

beforeEach(() => {
    jest.resetAllMocks();
    mockedAxios.isAxiosError.mockImplementation((error: unknown) => Boolean(error && typeof error === 'object' && 'isAxiosError' in error));
    mockedAxios.get.mockResolvedValue({ data: { sub: 'member123' } });
    mockedAxios.post.mockImplementation(async url => String(url).endsWith('/ugcPosts')
        ? { headers: { 'x-restli-id': POST_URN }, data: {} }
        : { headers: { 'x-restli-id': 'urn:li:comment:(urn:li:activity:1,99)' }, data: {} });
});

it('posts the first comment on the new post as the same member', async () => {
    const receipts: { id: string; url?: string }[] = [];
    await shareToLinkedIn({ text: 'New article out' }, 'token', { onSuccess: jest.fn() }, receipt => receipts.push(receipt), { firstComment: 'Read it: https://dev.to/example' });

    expect(comments()).toHaveLength(1);
    const [url, body] = comments()[0];
    expect(url).toBe(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(POST_URN)}/comments`);
    expect(body).toEqual({ actor: 'urn:li:person:member123', object: POST_URN, message: { text: 'Read it: https://dev.to/example' } });
    expect(receipts.map(receipt => receipt.id)).toEqual([POST_URN, 'urn:li:comment:(urn:li:activity:1,99)']);
});

it('posts no comment when none is given', async () => {
    await shareToLinkedIn({ text: 'Just a post' }, 'token', { onSuccess: jest.fn() });
    expect(comments()).toHaveLength(0);
});

it('says the post is already public when only the comment fails, so it is not republished', async () => {
    mockedAxios.post.mockImplementation(async url => {
        if (String(url).endsWith('/ugcPosts')) return { headers: { 'x-restli-id': POST_URN }, data: {} };
        throw { isAxiosError: true, response: { status: 403, data: { message: 'Not enough permissions' } } };
    });
    const receipts: { id: string }[] = [];
    await expect(shareToLinkedIn({ text: 'Post' }, 'token', { onError: jest.fn() }, receipt => receipts.push(receipt), { firstComment: 'Link' }))
        .rejects.toThrow('The LinkedIn post was published, but its first comment failed: the token may lack permission to comment');
    expect(receipts.map(receipt => receipt.id)).toEqual([POST_URN]);
});

it('still reports a failed post as not published', async () => {
    mockedAxios.post.mockRejectedValue({ isAxiosError: true, response: { status: 401, data: { message: 'Invalid token' } } });
    await expect(shareToLinkedIn({ text: 'Post' }, 'token', { onError: jest.fn() }, undefined, { firstComment: 'Link' }))
        .rejects.toThrow('Failed to post to LinkedIn: Invalid token');
    expect(comments()).toHaveLength(0);
});
