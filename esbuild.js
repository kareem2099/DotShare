const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').Plugin} */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log(`[watch] build started for ${build.initialOptions.platform}`);
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log(`[watch] build finished for ${build.initialOptions.platform}`);
        });
    },
};

async function main() {
    const extCtx = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'out/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
        define: {
            'process.env.NODE_ENV': production ? '"production"' : '"development"',
        },
    });

    // 2. Sidebar Frontend — Browser/IIFE
    const sidebarCtx = await esbuild.context({
        entryPoints: ['media/main.ts'],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        outfile: 'media/app.js',
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
        define: {
            'process.env.NODE_ENV': production ? '"production"' : '"development"',
        },
    });

    // 3. WebView Frontend — Browser/IIFE
    const webviewCtx = await esbuild.context({
        entryPoints: ['media/webview/app.ts'],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        outfile: 'media/webview/app.js',
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
        define: {
            'process.env.NODE_ENV': production ? '"production"' : '"development"',
        },
    });

    // 4. Standalone CLI (npm package `dotshare-cli`) — Node/CJS
    // npm packages stay external: they are installed from package.cli.json dependencies
    // (@napi-rs/keyring is a native module and cannot be bundled).
    const cliCtx = await esbuild.context({
        entryPoints: ['src/cli/commands.ts'],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node22',
        packages: 'external',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        outfile: 'out/cli/commands.js',
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
    });

    // 5. Headless publishing and MCP entrypoints (portable; no VS Code host).
    const agentCtx = await esbuild.context({
        entryPoints: ['src/agent/server.ts', 'src/agent/commands.ts'],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node22',
        packages: 'external',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        outdir: 'out/agent',
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
    });

    const libraryCtx = await esbuild.context({
        entryPoints: ['media/library/app.ts'], bundle: true, format: 'iife', platform: 'browser',
        target: 'es2020', minify: production, sourcemap: !production, sourcesContent: false,
        outfile: 'media/library/app.js', logLevel: 'silent', plugins: [esbuildProblemMatcherPlugin],
    });

    if (watch) {
        await Promise.all([extCtx.watch(), sidebarCtx.watch(), webviewCtx.watch(), cliCtx.watch(), agentCtx.watch(), libraryCtx.watch()]);
        console.log('[watch] Watching Extension, Sidebar, Webview, and CLI for changes...');
    } else {
        await Promise.all([extCtx.rebuild(), sidebarCtx.rebuild(), webviewCtx.rebuild(), cliCtx.rebuild(), agentCtx.rebuild(), libraryCtx.rebuild()]);
        await extCtx.dispose();
        await sidebarCtx.dispose();
        await webviewCtx.dispose();
        await cliCtx.dispose();
        await agentCtx.dispose();
        await libraryCtx.dispose();
        console.log('[build] Build completed successfully.');
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
