#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'artifacts');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dotshare-package-'));
try {
    execFileSync(process.execPath, [path.join(root, 'esbuild.js'), '--production'], { cwd: root, stdio: 'inherit' });
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.cli.json'), 'utf8'));
    fs.writeFileSync(path.join(temporary, 'package.json'), JSON.stringify(manifest, null, 2));
    for (const entry of manifest.files) {
        const relative = entry.replace(/\/$/, '');
        const target = path.join(temporary, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.cpSync(path.join(root, relative), target, { recursive: true });
    }
    fs.mkdirSync(destination, { recursive: true });
    execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', destination, '--cache', path.join(os.tmpdir(), 'dotshare-npm-cache')], { cwd: temporary, stdio: 'inherit' });
} finally {
    fs.rmSync(temporary, { recursive: true, force: true });
}
