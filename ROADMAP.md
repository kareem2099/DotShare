# 🗺️ DotShare Roadmap

> **Current release:** VS Code extension `v3.6.1` · `dotshare-cli` `v3.0.1` (MCP server and CLI)\
> **Next milestone:** `v3.6.2` — Reliability\
> **Principle:** Everything that runs on the user's machine with their own accounts stays free and open source. Paid DotSuite plans cover what runs on DotSuite servers.\
> **Companion:** [AI Release Copilot roadmap](AI_RELEASE_COPILOT_ROADMAP.md)

---

## 🧭 Overview

```
v3.0 – v3.4  ████████████████████  WebView shell, cloud scheduling, SaaS auth, CodeSnap        ✅ Done
v3.5.x       ████████████████████  AI release copilot, Smart CTA hub, Dev.to articles, Mastodon ✅ Done
v3.6.0       ████████████████████  Local MCP server & shared Publishing Library                ✅ Done
v3.6.1       ████████████████████  Field fixes: Bluesky facets, LinkedIn first comment, locks  ✅ Done
──────────────────────────────────────────────────────────────────────────────────────────────────────
v3.6.2       ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  Reliability: CI, token lifecycle, release automation        ⏳ Next
v3.7.0       ░░░░░░░░░░░░░░░░░░░░  One domain: auth on dotsuite.dev, verified publishing        🔵 Planned
v3.8.0       ░░░░░░░░░░░░░░░░░░░░  Multi-account cloud & remote MCP (paid plans)              🔵 Planned
v3.9.0       ░░░░░░░░░░░░░░░░░░░░  Trust & teams: provenance view, approvals, analytics       🔵 Backlog
```

Each milestone lists its CLI version where the MCP server or CLI changes. Plans: **Free** / **Pro** / **Max**.

---

## 🚨 Now — Auth server security fixes (`dotshare-auth-server`)

> **Why:** Two flaws in the live OAuth server. Fix and redeploy before anything else; the merge below replaces this server later.

- [ ] **`SCHEME_ALLOWLIST`** — The callback page sends the new tokens to `${scheme}://freerave.dotshare/auth?...`, taking `scheme` unchecked from the sign-in link. A link with `scheme=https://attacker.example/?` makes a victim's own LinkedIn or X sign-in deliver their access and refresh tokens to the attacker. Accept only known editor schemes (`vscode`, `vscode-insiders`, `vscodium`, `cursor`, `windsurf`) and fall back to `vscode`.
- [ ] **`NO_CLIENT_USER_ID`** — `/api/auth/{linkedin,x}` takes `userId` from the request body and saves the token to that DotSuite account through `/internal/oauth/save`. Anyone with their own authorization code could attach their account to someone else's DotSuite user. Nothing in DotShare or the site sends `userId` today, so remove the field; after the merge the user comes from the signed-in session.

---

## ⏳ v3.6.2 — Reliability

> **Why:** Every real post during the 3.6 launch found a bug the tests missed, and the release took several manual steps. This milestone makes breakage visible before users see it.\
> **CLI:** `3.0.2`

- [ ] **`CI_PIPELINE`** — GitHub Actions on every push and pull request: type-check, lint, all Jest suites, `verify-agent`, `verify-security`, `verify-library`, and building the VSIX and CLI tarball. The repository has no workflows today.
- [ ] **`X_TOKEN_REFRESH`** — The agent stores only an X access token, and X OAuth 2.0 tokens expire after about two hours, so MCP posting to X stops working soon after an account is added. Store the refresh token and rotate it, as the extension already does through the auth server.
- [ ] **`TOKEN_EXPIRY`** — Record when each token expires (LinkedIn: 60 days). `doctor` lists expiry dates and warns a week ahead; `publish_post` and `preview_post` return a warning for expiring accounts.
- [ ] **`ACCOUNTS_CONNECT`** — `dotshare-agent accounts connect linkedin` (and `x`): the browser sign-in flow built into the CLI, so nobody needs LinkedIn's token generator, which failed with a "state parameter" error during launch.
- [ ] **`RELEASE_SCRIPT`** — `npm run release <version>`: one source of truth for the extension, CLI and in-code client versions; create the CHANGELOG and What's New sections; build both artifacts and verify their contents; print the exact publish commands (`npm publish ./artifacts/…`, not `artifacts/…`).
- [ ] **`LEGACY_SECRET_CLEANUP`** — Clear All Credentials also removes secrets from removed platforms (Reddit).

---

## 🔵 v3.7.0 — One Domain & Verified Publishing

> **Why:** DotShare spans `core.dotsuite.dev`, `dotsuite.dev` and `dotshare-auth-server.vercel.app`. Merging auth into the DotSuite site puts every service under one name users can trust and one sign-in, and verified publishing confirms that what DotShare posted looks right.\
> **CLI:** `3.1.0`

### 🌐 Merge the auth server into `dotsuite.dev`
The auth server (`dotshare-auth-server`, v1.4.2) is a small Next.js app: PKCE sign-in pages, a callback page, LinkedIn and X token exchange, X token refresh, Upstash rate limits and a sync to `dotsuite-core`. The `dotsuite` site is Next.js 16 too, so the code moves in rather than being rebuilt.
- [ ] **`MOVE_ROUTES`** — Bring `src/lib/{pkce,platforms,tokenUtils}.ts`, the two hooks and the pages and API routes into `dotsuite`. Use new paths, because `dotsuite` already serves NextAuth and account routes under `/api/auth/*`: pages at `/connect/{linkedin,x}` and `/connect/{platform}/callback`, APIs at `/api/connect/{platform}` and `/api/connect/x/refresh`. Keep the pages outside the `[locale]` routing in `dotsuite/src/proxy.ts`.
- [ ] **`SESSION_USER`** — Take the DotSuite user from the NextAuth session when syncing tokens to `dotsuite-core`, never from the request.
- [ ] **`ENV_AND_LIMITS`** — Move `LINKEDIN_CLIENT_ID`/`SECRET`, `X_CLIENT_ID`, `INTERNAL_SECRET`, `DOTSUITE_CORE_URL` and the Upstash variables to the `dotsuite` deployment, with the same rate limits.
- [ ] **`OAUTH_REDIRECTS`** — Add `https://dotsuite.dev/connect/linkedin/callback` and `https://dotsuite.dev/connect/x/callback` to the LinkedIn and X apps, keeping the Vercel callbacks during the transition.
- [ ] **`ONE_URL_CONSTANT`** — The auth URL is hard-coded in `src/constants.ts`, `src/services/TokenManager.ts` and `media/main.ts`. Replace them with one constant pointing at `dotsuite.dev`, with a development override like `DOTSUITE_API_URL`, and update the paths.
- [ ] **`CLI_CONFIG_MIGRATION`** — The CLI saves `serverUrl` in `~/.dotshare/config.json`; rewrite the old Vercel address on load.
- [ ] **`RETIRE_VERCEL`** — Keep the old server running, not redirecting, until older extensions age out: 3.6.x refuses HTTP redirects, so a redirect would break X token refresh for those users. Then shut it down.

### ✅ Verified publishing
- [ ] **`POST_PUBLISH_CHECK`** — After publishing, read the post back from the platform and record in the receipt whether images, links, hashtags and the first comment are present. This would have caught the thread images that went out without media.
- [ ] **`LINK_CARDS`** — Rich previews for links: an external embed on Bluesky and an `ARTICLE` share on LinkedIn.
- [ ] **`LIVE_SMOKE_TESTS`** — A pre-release script that posts a text post, a thread and an image post to test accounts on each platform, verifies them, then deletes them.
- [ ] **`EXTENSION_PARITY`** — The VS Code composer gets the LinkedIn first-comment field and a NeedsReview view in the Publishing Library, matching the MCP.

### ☁️ Cloud scheduling checks (`dotsuite-core`)
- [ ] **`SCHEDULED_E2E`** — Verified scheduled posts on the live server for Mastodon and Bluesky (not yet tested since the SSRF and Bluesky fixes).
- [ ] **`FAILED_POST_ALERTS`** — Notify the user when a scheduled post fails; today it fails silently.
- [ ] **`DAILY_LIMITS`** — Optional per-account daily caps, starting with X, to protect accounts from automated over-posting.

---

## 🔵 v3.8.0 — Multi-Account Cloud & Remote MCP

> **Why:** Local multi-account publishing is free and already works in the MCP. Running it on DotSuite servers is what paid plans pay for.\
> **CLI:** `3.2.0`

- [ ] **`CLOUD_MULTI_ACCOUNT`** — `dotsuite-core` stores one credential per user and platform (`ds_credentials_user_platform`). Key credentials by account instead. Accounts per platform: Free 1, Pro 3, Max unlimited.
- [ ] **`EXTENSION_MULTI_ACCOUNT`** — Named accounts in the VS Code composer, shared with the MCP library.
- [ ] **`REMOTE_MCP`** — A hosted MCP endpoint on DotSuite with OAuth sign-in, so ChatGPT and Claude.ai can draft and schedule without installing anything. Available on every plan within its scheduling quota.
- [ ] **`RELEASE_CAMPAIGNS`** — Schedule one release across several platforms and accounts as a single campaign. Free: one per month; Pro and Max: unlimited.
- [ ] **`SYNCED_DRAFTS`** — Drafts and the approval queue synced across devices (Pro and Max).
- [ ] **`PRICING_PAGE`** — Update the DotSuite pricing page, README and `products.ts` together whenever plan features change.

---

## 🔵 v3.9.0 — Trust & Teams

> **Why:** A review step only helps if the reviewer can see what changed and where each claim came from (suggested by a reader on the Part 1 article).

- [ ] **`PROVENANCE_VIEW`** — Compare draft revisions, and show the sources (commits, changelog lines, links) next to the AI-written claims they support.
- [ ] **`TEAM_APPROVALS`** — Shared libraries with reviewer roles and approvals bound to a revision (Max).
- [ ] **`HOSTED_AI`** — AI generation without a personal key, as a monthly credit allowance on Pro and Max.
- [ ] **`ANALYTICS_AND_COMMENTS`** — Engagement metrics and replies from supported platforms.
- [ ] **`CODESNAP_RELEASE_BRIDGE`** — Suggest a CodeSnap image from the key changes in a release diff.

---

## 🧱 Maintenance (ongoing)

- [ ] **`WORKSPACES_LAYOUT`** — Split the repository into npm workspaces (`packages/core`, `packages/extension`, `packages/cli`) so the CLI no longer publishes by copying `package.cli.json` over `package.json`.
- [ ] **`DEPENDENCY_HYGIENE`** — Keep Dependabot alerts at zero; record dismissals with a reason (like the dev-only `deepmerge` alert, which has no fixed version).
- [ ] **`TOOLING`** — Keep `@vscode/vsce` current (4.x).

---

## ✅ Completed

### v3.6.1 — Field Fixes (November 2026)
- [x] Clickable Bluesky links and hashtags (rich-text facets with UTF-8 byte offsets).
- [x] LinkedIn `firstComment`, posted right after the post; a failed comment never republishes the post.
- [x] Locks recover after crashes and wait for other writers; several MCP clients can share one library.
- [x] Damaged records no longer hide the rest of the history or drafts; locale-independent fingerprints; relative image paths inside `DOTSHARE_MEDIA_ROOTS`; Mastodon `profile` scope documented; activation no longer blocked by `NODE_TLS_REJECT_UNAUTHORIZED=0`.

### v3.6.0 — MCP & Publishing Library (November 2026)
- [x] Local MCP server (`dotshare-cli` 3.0.0) with 23 tools: accounts, drafts, templates, previews, publishing, history and cloud scheduling.
- [x] Shared Publishing Library in VS Code, saved previews bound to a revision, and per-account receipts.
- [x] Encrypted local records (AES-256-GCM, master key in the OS keyring), `setup` and `doctor`.

### v3.5.x — AI Release Copilot & Mastodon
- [x] **3.5.3:** Mastodon publishing to any instance; Mastodon cloud scheduling; thread images fixed; plan alignment.
- [x] **3.5.2:** Dev.to article generator, frontmatter builder, live Markdown preview, release-evidence engine.
- [x] **3.5.1:** Smart CTA hub, live model discovery for Gemini, OpenAI, Claude, DeepSeek and Grok.
- [x] **3.5.0:** Project context engine, five writing tones, English and Arabic generation.

### v3.0 – v3.4 — Foundation
- [x] WebView shell, router and theming; toasts and shortcuts.
- [x] Cloud scheduling with Cloudflare R2 media; OAuth through the auth server.
- [x] DotSuite accounts and billing, GitHub Gists, and removal of the local scheduler.
- [x] CodeSnap, and removal of Facebook, Reddit and Medium.

---

## 🧩 Where things live

| Piece | Location |
|---|---|
| VS Code extension | `src/` (`extension.ts`, `handlers/`, `ui/`, `media/`) |
| Platform adapters (shared by extension, CLI and MCP) | `src/platforms/` |
| MCP server, CLI agent commands, drafts, templates | `src/agent/`, `bin/dotshare-mcp.js`, `bin/dotshare-agent.js` |
| Publishing Library bridge | `src/library/` |
| Encryption, locks, redaction, HTTP hardening | `src/security/` |
| Scheduler, billing, media API | `dotsuite-core`, private repository (`core.dotsuite.dev`) |
| Website, dashboard, pricing | `dotsuite` (`dotsuite.dev`) |
| OAuth for LinkedIn and X | `dotshare-auth-server` (`dotshare-auth-server.vercel.app`), merging into `dotsuite.dev` in v3.7.0 |

---

*Last updated: November 2026*
