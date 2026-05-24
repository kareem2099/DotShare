export const APP_NAME = 'DotShare';

export const DEFAULT_SERVER_URL = 'https://dotshare-auth-server.vercel.app/';

// ── DotSuite Core (Rust Backend) ────────────────────────────────────────────
// To point to a local server during development, override with the
// DOTSUITE_API_URL environment variable or change this constant.
export const DOTSUITE_CORE_API_URL = 'https://dotsuite-core-production.up.railway.app';

// ── DotSuite Web (Next.js Frontend) ─────────────────────────────────────────
// Production Vercel URL. Falls back to localhost:3000 in development.
export const DOTSUITE_WEB_URL =
    process.env.NODE_ENV === 'production'
        ? 'https://dotsuite.vercel.app'
        : 'http://localhost:3000';