#!/usr/bin/env node
'use strict';
// Real OS-keyring and loopback-network verification. No user/platform credentials or publications.
const fs = require('node:fs'); const path = require('node:path'); const http = require('node:http');
const { execFileSync } = require('node:child_process'); const assert = require('node:assert/strict'); const { randomBytes, randomUUID } = require('node:crypto');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..'); fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
const temporary = fs.mkdtempSync(path.join(root, 'artifacts', 'security-check-'));
const home = path.join(temporary, 'home'); fs.mkdirSync(home, {mode: 0o700});
const cleanupKeys = new Set(); let source; let destination;
(async () => {
    try {
        buildSync({ stdin: { contents: `export {LocalVault} from ${JSON.stringify(path.join(root,'src/security/vault.ts'))}; export {OsCredentialStore} from ${JSON.stringify(path.join(root,'src/cli/credential-store.ts'))}; export {hardenHttp,secureFetch} from ${JSON.stringify(path.join(root,'src/security/http.ts'))};`, resolveDir:root }, bundle:true, platform:'node',format:'cjs',packages:'external',outfile:path.join(temporary,'runtime.cjs') });
        const { LocalVault, OsCredentialStore, hardenHttp, secureFetch } = require(path.join(temporary,'runtime.cjs')); const secrets = new OsCredentialStore();
        const vault = new LocalVault(home, secrets); const file = path.join(home,'drafts','one.json');
        vault.write(file,{text:'private fixture content'}); const metadata = JSON.parse(fs.readFileSync(path.join(home,'security.json'),'utf8')); cleanupKeys.add(metadata.keyId);
        const originalKey = secrets.get(`vault:${metadata.keyId}`); assert(originalKey);
        assert(!fs.readFileSync(file,'utf8').includes('private fixture content')); assert.deepEqual(new LocalVault(home,secrets).read(file),{text:'private fixture content'});
        secrets.delete(`vault:${metadata.keyId}`); assert.throws(()=>vault.read(file),/unavailable/); assert.throws(()=>vault.write(file,{}),/unavailable/);
        secrets.set(`vault:${metadata.keyId}`,originalKey); assert.deepEqual(vault.read(file),{text:'private fixture content'});
        const envelope=JSON.parse(fs.readFileSync(file,'utf8')); envelope.tag=Buffer.alloc(16).toString('base64'); fs.writeFileSync(file,JSON.stringify(envelope)); assert.throws(()=>vault.read(file),/authentication/);

        const legacyHome=path.join(temporary,'legacy'); fs.mkdirSync(path.join(legacyHome,'drafts'),{recursive:true,mode:0o700}); const id=randomUUID(); const date=new Date().toISOString();
        const old={schemaVersion:1,id,title:'Legacy fixture',revision:1,status:'Draft',content:{accountIds:[],text:'legacy private body',media:[],autoSplit:false,overrides:{}},createdAt:date,updatedAt:date};
        fs.writeFileSync(path.join(legacyHome,'drafts',`${id}.json`),JSON.stringify(old),{mode:0o600});
        const operations = path.join(legacyHome, 'operations');
        fs.mkdirSync(operations, { mode: 0o700 });
        const operation = {
            requestId: 'legacy-publication', fingerprint: 'a'.repeat(64), kind: 'publish', status: 'completed', createdAt: date, updatedAt: date,
            results: [{ accountId: 'fixture-mastodon', platform: 'mastodon', status: 'published', receipts: [{ id: 'fixture-post', url: 'https://example.com/@fixture/123' }] }],
        };
        const operationFile = path.join(operations, `${operation.requestId}.json`);
        fs.writeFileSync(operationFile, JSON.stringify(operation), { mode: 0o600 });
        const env={...process.env,DOTSHARE_HOME:legacyHome};
        const installation = process.argv[2] ? path.resolve(process.argv[2]) : root;
        const cli=path.join(installation,'bin/dotshare-agent.js');
        const runAt = (library, ...args) => JSON.parse(execFileSync(process.execPath, [cli, ...args], {
            env: { ...env, DOTSHARE_HOME: library }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        }));
        const run = (...args) => runAt(legacyHome, ...args);
        assert.equal(run('security', 'status').plaintext, 2);
        const protectedResult=run('security','protect');
        cleanupKeys.add(JSON.parse(fs.readFileSync(path.join(legacyHome,'security.json'),'utf8')).keyId);
        assert.equal(protectedResult.protected,true); assert.equal(protectedResult.plaintext,0); assert.equal(protectedResult.keyAccess,'verified');
        assert.equal(protectedResult.migrated, 2);
        const recovered=run('drafts','get',id); assert.deepEqual(recovered.draft.content,old.content);
        assert.equal(recovered.draft.revision, old.revision);
        assert.deepEqual(run('operation', operation.requestId).operation, operation);
        assert(!fs.readFileSync(operationFile, 'utf8').includes(operation.results[0].receipts[0].url));
        assert.equal(run('security', 'protect').migrated, 0);
        try { execFileSync(process.execPath,[cli,'accounts','add','--input','-'],{env,input:'{"credentials":{"accessToken":"never-print-this-fixture"}BROKEN',encoding:'utf8',stdio:['pipe','pipe','pipe']}); assert.fail('Malformed secret JSON must fail'); }
        catch(error) { assert(!String(error.stdout).includes('never-print-this-fixture')); assert(!String(error.stderr).includes('never-print-this-fixture')); }

        // Simulate a separate keyring backup in memory using only the disposable vault key.
        const backupEntry = `vault:${JSON.parse(fs.readFileSync(path.join(legacyHome, 'security.json'), 'utf8')).keyId}`;
        const backupKey = secrets.get(backupEntry);
        assert(backupKey);
        const backup = path.join(temporary, 'backup');
        const restored = path.join(temporary, 'restored');
        const files = ['security.json', path.join('drafts', `${id}.json`), path.join('operations', `${operation.requestId}.json`)];
        const copyVault = (from, to) => {
            for (const relative of files) {
                const target = path.join(to, relative);
                fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
                fs.copyFileSync(path.join(from, relative), target, fs.constants.COPYFILE_EXCL);
            }
        };
        copyVault(legacyHome, backup);
        copyVault(backup, restored);
        secrets.delete(backupEntry);
        const keyRefused = error => error.status === 1 && /vault key is unavailable or does not match/.test(String(error.stdout));
        assert.throws(() => runAt(restored, 'drafts', 'get', id), keyRefused);
        secrets.set(backupEntry, randomBytes(32).toString('base64'));
        assert.throws(() => runAt(restored, 'operation', operation.requestId), keyRefused);
        for (const relative of files) {
            assert.deepEqual(fs.readFileSync(path.join(restored, relative)), fs.readFileSync(path.join(backup, relative)));
        }
        secrets.set(backupEntry, backupKey);
        assert.deepEqual(runAt(restored, 'drafts', 'get', id).draft, recovered.draft);
        assert.deepEqual(runAt(restored, 'operation', operation.requestId).operation, operation);

        let receivedAtDestination=0;
        destination=http.createServer((req,res)=>{receivedAtDestination++;req.resume();res.end('must not reach');}); await new Promise(resolve=>destination.listen(0,'127.0.0.1',resolve));
        source=http.createServer((req,res)=>{req.resume();res.writeHead(307,{Location:`http://127.0.0.1:${destination.address().port}/steal`});res.end();}); await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
        const url=`http://127.0.0.1:${source.address().port}/redirect`; hardenHttp(); const axios=require('axios');
        await assert.rejects(()=>axios.post(url,{token:'fixture-only'},{headers:{Authorization:'Bearer fixture-only'},timeout:5000}));
        await assert.rejects(()=>secureFetch(url,{method:'POST',body:'fixture-only',headers:{Authorization:'Bearer fixture-only'}}));
        assert.equal(receivedAtDestination,0);
        console.log('Verified: required OS keyring, ciphertext-only records, lost-key refusal/recovery, tamper rejection, idempotent CLI migration preserving draft content, revision and publication receipts, secret-safe input errors and zero credential forwarding on HTTP redirects. No real posts or platform keys used.');
        console.log('Verified: backup restored to a separate library. Absent and mismatched keys were refused without modifying files. Restoring the matching test key recovered the exact draft and publication receipt.');
    } finally {
        const {Entry}=require('@napi-rs/keyring');
        for(const keyId of cleanupKeys) new Entry('DotShare CLI',`vault:${keyId}`,process.platform==='linux'?{linux:{store:'secret-service'}}:undefined).deletePassword();
        if(source) await new Promise(resolve=>source.close(resolve)); if(destination) await new Promise(resolve=>destination.close(resolve));
        fs.rmSync(temporary,{recursive:true,force:true});
    }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
