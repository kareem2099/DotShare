#!/usr/bin/env node
'use strict';
// Disposable UI fixture. Every platform and publication adapter is fake; no user data or keys are used.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { buildSync } = require('esbuild');
const { stringify } = require('smol-toml');
const root = path.resolve(__dirname, '..');

async function createPreview() {
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    const temporary = fs.mkdtempSync(path.join(root, 'artifacts', 'library-preview-'));
    const home = path.join(temporary, 'home'); fs.mkdirSync(home, { mode: 0o700 });
    const bin = path.join(temporary, 'bin'); fs.mkdirSync(bin);
    const fixture = `
        import * as fs from 'fs'; import * as path from 'path';
        import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
        import { createAgentServer } from ${JSON.stringify(path.join(root, 'src/agent/server.ts'))};
        import { AgentPublisher } from ${JSON.stringify(path.join(root, 'src/agent/publisher.ts'))};
        import { AccountStore } from ${JSON.stringify(path.join(root, 'src/agent/accounts.ts'))};
        import { AgentDrafts } from ${JSON.stringify(path.join(root, 'src/agent/drafts.ts'))};
        import { OsCredentialStore } from ${JSON.stringify(path.join(root, 'src/cli/credential-store.ts'))};
        const values = new Map();
        const native = new OsCredentialStore();
        const accounts = new AccountStore(process.env.DOTSHARE_HOME, { get: key => key.startsWith('vault:') ? native.get(key) : values.get(key), set: (key, value) => key.startsWith('vault:') ? native.set(key,value) : values.set(key,value), delete: key => key.startsWith('vault:') ? native.delete(key) : values.delete(key) });
        for (const [id,platform,name] of [['demo-x','x','Personal X'],['demo-linkedin','linkedin','Work LinkedIn']]) accounts.add({id,platform,name,credentials:{accessToken:'fixture-only-no-real-platform-token'}});
        const publisher = new AgentPublisher(accounts, async (target,_credentials,_input,report) => {
            if (target.posts.some(part => part.text.includes('[fail]'))) throw new Error('Simulated platform failure; inspect existing receipts.');
            for (let i=0;i<target.posts.length;i++) { fs.appendFileSync(path.join(accounts.home,'test-deliveries.jsonl'),JSON.stringify({accountId:target.accountId,text:target.posts[i].text})+'\\n'); report({id:'fixture-'+target.accountId+'-'+i,url:'https://example.com/posts/'+target.accountId+'/'+i}); }
        }, [accounts.home]);
        const drafts = new AgentDrafts(publisher);
        if (!drafts.list({}).drafts.length) drafts.create({title:'DotShare MCP release',content:{accountIds:['demo-x','demo-linkedin'],text:'DotShare now has a shared publishing library. Prepare a draft with your agent, then review and publish the same version here.',overrides:{'demo-linkedin':{text:'Introducing a shared publishing workspace for DotShare. Drafts, templates and reviewed account versions now work together across your AI agent and VS Code.'}}}});
        const server=createAgentServer(publisher); server.connect(new StdioServerTransport()); process.on('SIGTERM',()=>server.close().then(()=>process.exit(0)));
    `;
    buildSync({ stdin: { contents: fixture, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: path.join(bin, 'dotshare-mcp.js') });
    buildSync({ entryPoints: [path.join(root, 'src/library/client.ts')], bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: path.join(temporary, 'client.cjs') });
    const config = path.join(temporary, 'config.toml');
    fs.writeFileSync(config, stringify({ mcp_servers: { dotshare: { command: process.execPath, args: [path.join(bin, 'dotshare-mcp.js')], cwd: temporary,
        env: { DOTSHARE_HOME: home, DOTSHARE_MEDIA_ROOTS: home }, env_vars: ['DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'DISPLAY', 'WAYLAND_DISPLAY'], startup_timeout_sec: 20, tool_timeout_sec: 30 } } }));
    const { LibraryClient } = require(path.join(temporary, 'client.cjs'));
    const listeners = new Set(); let changes = 0;
    const changed = () => { changes++; for (const listener of listeners) listener.write('data: changed\n\n'); };
    let client = new LibraryClient(config, changed);
    await client.connect();
    const bootstrap = `window.acquireVsCodeApi=()=>({getState:()=>JSON.parse(sessionStorage.getItem('libraryState')||'null'),setState:s=>sessionStorage.setItem('libraryState',JSON.stringify(s)),postMessage:async m=>{try{const r=await fetch('/bridge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});window.postMessage(await r.json(),location.origin)}catch(e){window.postMessage({command:'libraryResult',id:m.id,success:false,error:e.message},location.origin)}}});new EventSource('/changes').onmessage=()=>window.postMessage({command:'libraryChanged'},location.origin);`;
    const server = http.createServer(async (req, res) => {
        if (req.url === '/changes') { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' }); res.write(': ready\n\n'); listeners.add(res); req.on('close', () => listeners.delete(res)); return; }
        if (req.url === '/bridge' && req.method === 'POST') {
            let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 3 * 1024 * 1024) { res.writeHead(413); res.end(); return; } }
            let message;
            try {
                message = JSON.parse(body); let data;
                if (message.operation === 'snapshot') data = await client.snapshot();
                else if (message.operation === 'reconnect') { await client.dispose(); client = new LibraryClient(config, changed); data = await client.snapshot(); }
                else if (message.operation === 'tool') data = await client.call(message.tool, message.args);
                else data = { opened: false };
                res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ command: 'libraryResult', id: message.id, success: true, data }));
            } catch (error) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ command: 'libraryResult', id: message?.id, success: false, error: error.message })); }
            return;
        }
        if (req.url === '/' || req.url === '/index.html') {
            let html = fs.readFileSync(path.join(root, 'media/library/index.html'), 'utf8');
            const csp = `default-src 'self'; script-src 'self' 'nonce-preview'; style-src 'self'; connect-src 'self';`;
            html = html.replace('{{CSP}}', csp).replaceAll('{{NONCE}}', 'preview').replace('{{STYLE_URI}}', '/style.css').replace('{{SCRIPT_URI}}', '/app.js').replace('<script nonce=', '<script nonce="preview" src="/bootstrap.js"></script><script nonce=');
            res.setHeader('Content-Type', 'text/html'); res.end(html); return;
        }
        if (req.url === '/bootstrap.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bootstrap); return; }
        const allowed = { '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
        const asset = allowed[req.url]; if (!asset) { res.writeHead(404); res.end(); return; }
        res.setHeader('Content-Type', asset[1]); res.end(fs.readFileSync(path.join(root, 'media/library', asset[0])));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { home, config, temporary, get client() { return client; }, get changes() { return changes; }, url: `http://127.0.0.1:${server.address().port}`,
        async dispose() {
            for (const listener of listeners) listener.end(); await client.dispose(); await new Promise(resolve => server.close(resolve));
            const metadata = path.join(home, 'security.json');
            if (fs.existsSync(metadata)) { const { Entry } = require('@napi-rs/keyring'); const key = JSON.parse(fs.readFileSync(metadata,'utf8')).keyId; new Entry('DotShare CLI', `vault:${key}`, process.platform === 'linux' ? {linux:{store:'secret-service'}} : undefined).deletePassword(); }
            fs.rmSync(temporary, { recursive: true, force: true });
        } };
}
module.exports = { createPreview };
if (require.main === module) createPreview().then(preview => {
    console.log(`Disposable Publishing Library UI: ${preview.url}\nAll accounts/publications are fixtures. User data is not used.`);
    process.on('SIGTERM', () => preview.dispose().then(() => process.exit(0)));
    process.on('SIGINT', () => preview.dispose().then(() => process.exit(0)));
}).catch(error => { console.error(error.message); process.exitCode = 1; });
