import axios from 'axios';
import { hardenHttp, secureFetch, linkedinUploadUrl } from '../http';
import type { Command } from 'commander';
import { setupDefaultCommand } from '../../cli/commands';
import { AgentPublisher } from '../../agent/publisher';
import { AccountStore } from '../../agent/accounts';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

it('forces zero redirects and bounded timeouts for API requests, including an explicit redirect override', async () => {
    const use = jest.spyOn(axios.interceptors.request, 'use'); hardenHttp();
    expect(axios.defaults.maxRedirects).toBe(0); expect(axios.defaults.timeout).toBe(30000);
    const intercept = use.mock.calls[0][0]!;
    const config = await intercept({ headers: {}, maxRedirects: 5, timeout: 0 } as never);
    expect(config).toMatchObject({ maxRedirects: 0, timeout: 30000 }); use.mockRestore();
});
it('makes fetch reject redirects even when the caller supplies follow', async () => {
    const original = global.fetch; const request = jest.fn().mockResolvedValue({ ok: true }); global.fetch = request;
    try { await secureFetch('https://example.com/api', { redirect: 'follow', headers: { Authorization: 'Bearer private' } }); expect(request).toHaveBeenCalledWith('https://example.com/api', expect.objectContaining({ redirect: 'error' })); }
    finally { global.fetch = original; }
});
it('accepts official LinkedIn upload hosts and rejects credential-exfiltration destinations', () => {
    expect(linkedinUploadUrl('https://www.linkedin.com/dms-uploads/image')).toBe('https://www.linkedin.com/dms-uploads/image');
    for (const value of ['http://www.linkedin.com/upload', 'https://linkedin.com.evil.example/upload', 'https://evil.example/upload', 'https://secret@www.linkedin.com/upload', 'file:///etc/passwd']) expect(() => linkedinUploadUrl(value)).toThrow('untrusted');
});
it('does not forward any credential or content through the legacy relay command', async () => {
    const post = jest.spyOn(axios, 'post'); const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    let action!: () => void;
    const program = { arguments() { return this; }, option() { return this; }, description() { return this; }, action(callback: () => void) { action = callback; return this; } };
    setupDefaultCommand(program as unknown as Command);
    const before = process.exitCode;
    try { action(); expect(post).not.toHaveBeenCalled(); expect(process.exitCode).toBe(1); }
    finally { process.exitCode = before; log.mockRestore(); post.mockRestore(); }
});
it('blocks known platform credentials in actual publication plans before any adapter or journal claim', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-leak-guard-')); const values = new Map<string, string>();
    try {
        const accounts = new AccountStore(home, { get: key => values.get(key), set: (key, value) => { values.set(key, value); }, delete: key => { values.delete(key); } });
        accounts.add({ id: 'personal', name: 'Personal', platform: 'x', credentials: { accessToken: 'sensitive-access-token-guard' } });
        const adapter = jest.fn(); const publisher = new AgentPublisher(accounts, adapter);
        await expect(publisher.publish({ requestId: 'must-block', accountIds: ['personal'], text: 'My token is sensitive-access-token-guard' })).rejects.toThrow('Publication blocked');
        expect(adapter).not.toHaveBeenCalled(); expect(publisher.journal.list()).toEqual([]);
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
it('lets the extension activate with TLS verification disabled but refuses each request', async () => {
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    const use = jest.spyOn(axios.interceptors.request, 'use');
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
        expect(() => hardenHttp()).not.toThrow();
        const intercept = (axios.interceptors.request as unknown as { handlers: { fulfilled: (config: unknown) => unknown }[] }).handlers.at(-1)!.fulfilled;
        await expect(async () => intercept({ headers: {} })).rejects.toThrow('TLS certificate verification must remain enabled');
        expect(() => secureFetch('https://example.com/api')).toThrow('TLS certificate verification');
    } finally {
        if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
        use.mockRestore();
    }
});
