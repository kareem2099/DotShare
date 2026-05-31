// eslint.config.js — ESLint v9+ Flat Config
// Migrated from .eslintrc.json

import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import js from '@eslint/js';

const ignores = [
    'out/**',
    'node_modules/**',
    // Compiled browser bundles — never lint generated output
    'media/app.js',
    'media/webview/app.js',
    'media/webview/app.js.map',
    'media/webview/style.css',
    // Third-party vendor files (highlight.js, theme CSS) — generated, not our code
    'media/webview/vendor/**',
    // Source-only dirs that shouldn't be linted directly
    'media/src/**',
    'media/main.ts',
    'media/app-backup.ts',
    // Build tooling
    'esbuild.js',
    'bin/**',
];

export default [
    { ignores },

    // ── Base JS ─────────────────────────────────────────────
    js.configs.recommended,

    // ── src/**/*.ts — Node extension code ───────────────────
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                // Node globals
                require: 'readonly',
                module: 'writable',
                __dirname: 'readonly',
                __filename: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                global: 'writable',
                // Node 18+ built-ins (fetch API, etc.)
                fetch: 'readonly',
                Response: 'readonly',
                Request: 'readonly',
                Headers: 'readonly',
                AbortSignal: 'readonly',
                AbortController: 'readonly',
                TextDecoder: 'readonly',
                TextEncoder: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                atob: 'readonly',
                btoa: 'readonly',
                FormData: 'readonly',
                Blob: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            // preserve-caught-error is too strict for existing patterns
            'preserve-caught-error': 'off',
        },
    },

    // ── media/webview/**/*.ts — Browser webview code ─────────
    {
        files: ['media/webview/*.ts', 'media/*.ts'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                fetch: 'readonly',
                HTMLElement: 'readonly',
                HTMLButtonElement: 'readonly',
                HTMLInputElement: 'readonly',
                HTMLTextAreaElement: 'readonly',
                HTMLSelectElement: 'readonly',
                Event: 'readonly',
                MessageEvent: 'readonly',
                KeyboardEvent: 'readonly',
                MutationObserver: 'readonly',
                requestAnimationFrame: 'readonly',
                navigator: 'readonly',
                alert: 'readonly',
                globalThis: 'readonly',
                // File APIs
                File: 'readonly',
                FileReader: 'readonly',
                FileList: 'readonly',
                Blob: 'readonly',
                Image: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                AbortSignal: 'readonly',
                AbortController: 'readonly',
                // Storage
                localStorage: 'readonly',
                sessionStorage: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
        },
    },

    // ── Tests ─────────────────────────────────────────────────
    {
        files: ['src/**/__tests__/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                require: 'readonly',
                module: 'writable',
                __dirname: 'readonly',
                global: 'writable',
                process: 'readonly',
                console: 'readonly',
                // Jest globals
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                jest: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-unused-vars': 'warn',
        },
    },
];
