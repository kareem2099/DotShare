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
v3.7.0       ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  Connect: sign-in on dotsuite.dev, agent sign-in, video, stats 🚀 Releasing
v3.7.x       ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  Reliability & verified publishing: CI, read-back checks      ⏳ Next
v3.8.0       ░░░░░░░░░░░░░░░░░░░░  Multi-account cloud & remote MCP (paid plans)              🔵 Planned
v3.9.0       ░░░░░░░░░░░░░░░░░░░░  Trust & teams: provenance view, approvals, analytics       🔵 Backlog
```

Each milestone lists its CLI version where the MCP server or CLI changes. Plans: **Free** / **Pro** / **Max**.

---

## 🚀 v3.7.0 — Connect (release checklist)

> **Built and pushed:** sign-in on `dotsuite.dev/api/connect`, agent browser sign-in and X refresh, `schedule_draft`, `get_post_stats`, video/GIF, Bluesky mentions, Claude Code/Cursor setup (see Completed). Ship once the items below are done.\
> **CLI:** `3.1.0`

### 🌐 Before tagging
- [ ] **`ENV_AND_LIMITS`** — Set `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` and `X_CLIENT_ID` on the `dotsuite` deployment (rate limits use its Postgres limiter). `/api/connect/health` must report both platforms before 3.7.0 ships.
- [ ] **`OAUTH_REDIRECTS`** — Add `https://dotsuite.dev/api/connect/linkedin/callback` and `https://dotsuite.dev/api/connect/x/callback` to the LinkedIn and X apps, keeping the Vercel callbacks during the transition.
- [ ] **`RETIRE_VERCEL`** — Keep the old server running, not redirecting, until older extensions age out: 3.6.x refuses HTTP redirects, so a redirect would break X token refresh for those users. Then shut it down.

---

## ⏳ v3.7.x — Reliability & Verified Publishing

> **Why:** Every real post during the 3.6 launch found a bug the tests missed, and the release took several manual steps. This milestone makes breakage visible before users see it.\
> **CLI:** `3.1.x`

- [ ] **`CI_PIPELINE`** — GitHub Actions on every push and pull request: type-check, lint, all Jest suites, `verify-agent`, `verify-security`, `verify-library`, and building the VSIX and CLI tarball. The repository has no workflows today.
- [ ] **`TOKEN_EXPIRY`** — Browser-connected accounts record their expiry and `doctor` warns a week ahead (3.7.0). Still to do: `preview_post`/`preview_draft` warnings, and expiry for tokens pasted with `accounts add`.
- [ ] **`RELEASE_SCRIPT`** — `npm run release <version>`: one source of truth for the extension, CLI and in-code client versions; create the CHANGELOG and What's New sections; build both artifacts and verify their contents; print the exact publish commands (`npm publish ./artifacts/…`, not `artifacts/…`).
- [ ] **`LEGACY_SECRET_CLEANUP`** — Clear All Credentials also removes secrets from removed platforms (Reddit).

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
- [ ] **`ANALYTICS_AND_COMMENTS`** — Replies from supported platforms, and engagement in the VS Code library (agents have `get_post_stats` since 3.7.0).
- [ ] **`CODESNAP_RELEASE_BRIDGE`** — Suggest a CodeSnap image from the key changes in a release diff.

---

## 🧱 Maintenance (ongoing)

- [ ] **`WORKSPACES_LAYOUT`** — Split the repository into npm workspaces (`packages/core`, `packages/extension`, `packages/cli`) so the CLI no longer publishes by copying `package.cli.json` over `package.json`.
- [ ] **`DEPENDENCY_HYGIENE`** — Keep Dependabot alerts at zero; record dismissals with a reason (like the dev-only `deepmerge` alert, which has no fixed version).
- [ ] **`TOOLING`** — Keep `@vscode/vsce` current (4.x).

---

## ✅ Completed

### v3.7.0 — Connect (November 2026)
- [x] Auth server security fixes: editor scheme allowlist, required LinkedIn state, no client-supplied `userId` (deployed to the Vercel server November 11).
- [x] LinkedIn/X sign-in moved to `dotsuite.dev/api/connect`, server-side with signed state and PKCE; dashboard Connect buttons save accounts for cloud scheduling with the signed-in session user.
- [x] One `DOTSUITE_CONNECT_URL` in the extension and CLI; saved Vercel URLs migrate automatically.
- [x] `dotshare-agent accounts connect` (browser sign-in, tokens encrypted to the CLI) and automatic X token refresh.
- [x] `schedule_draft`, `get_post_stats`, agent video/GIF, Bluesky mentions, setup for Claude Code and Cursor, and the DotShare agent skill.

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
