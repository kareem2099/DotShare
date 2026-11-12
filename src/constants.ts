export const APP_NAME = 'DotShare';

// ── Social sign-in (LinkedIn, X) ────────────────────────────────────────────
// Hosted on dotsuite.dev in every build: the providers only return to the
// callbacks registered there, so this never points at localhost.
export const DOTSUITE_CONNECT_URL = 'https://dotsuite.dev/api/connect';

export const DEFAULT_SERVER_URL = 'https://dotsuite.dev';

/** Earlier releases used this server; saved CLI configs move off it automatically. */
export const LEGACY_SERVER_HOST = 'dotshare-auth-server.vercel.app';

// ── DotSuite Core (Rust Backend) ────────────────────────────────────────────
// To point to a local server during development, override with the
// DOTSUITE_API_URL environment variable or change this constant.
export const DOTSUITE_CORE_API_URL = 'https://core.dotsuite.dev';

// ── DotSuite Web (Next.js Frontend) ─────────────────────────────────────────
// Production URL. Falls back to localhost:3000 in development.
export const DOTSUITE_WEB_URL =
    process.env.NODE_ENV === 'production'
        ? 'https://dotsuite.dev'
        : 'http://localhost:3000';