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
    // 1. Extension Backend — Node/CJS
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
    });

    if (watch) {
        await Promise.all([extCtx.watch(), sidebarCtx.watch(), webviewCtx.watch()]);
        console.log('[watch] Watching Extension, Sidebar, and Webview for changes...');
    } else {
        await Promise.all([extCtx.rebuild(), sidebarCtx.rebuild(), webviewCtx.rebuild()]);
        await extCtx.dispose();
        await sidebarCtx.dispose();
        await webviewCtx.dispose();
        console.log('[build] Build completed successfully.');
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});