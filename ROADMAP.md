# 🗺️ DotShare Roadmap — The 3.x Era

> **Codename:** *The Publishing Suite*
> **Audience:** Tech Writers · Open Source Contributors · DevRel Engineers
> **Philosophy:** One tool. Every platform. Zero friction.

---

## 🏛️ Architectural Manifesto (Before We Cook)

The 3.x era is a **complete rethinking** of how DotShare lives inside VS Code.

| What changes | Before (2.x) | After (3.x) |
|---|---|---|
| **Entry point** | Activity Bar sidebar panel | Full **WebView Panel** (tab-based, resizable) |
| **UI model** | Single cramped panel | Separate **Post**, **Publish**, **Analytics**, **Settings** pages |
| **Social vs Blog** | Mixed together | Strictly **decoupled** logic modules |
| **State** | Scattered in providers | Centralized **StateManager** |
| **Styling** | Inline styles / basic HTML | VS Code-aware CSS variables + component system |

> The activity bar icon stays — it just **opens the WebView** instead of being the UI## v3.0 — *Foundation Strike* 🏗️

> **Tag:** `The Publishing Suite` | **Status:** ✅ Completed

This is the ground-up rebuild. Everything else in 3.x depends on getting this right.

### M1 · WebView Architecture Migration

The **biggest structural change** in DotShare's history.

- [x] **`WEBVIEW_SHELL`** — Create a `DotShareWebView.ts` panel launcher. Replaces `DotShareProvider` as the primary UI host. Opens as a proper editor tab.
- [x] **`WEBVIEW_ROUTER`** — Implement client-side page routing inside the WebView (`post`, `publish`, `analytics`, `settings`). Think of it like a mini SPA inside VS Code.
- [x] **`WEBVIEW_BRIDGE`** — Robust `postMessage` protocol between the extension host and the WebView. Define typed message contracts (`WebViewMessage`, `ExtensionMessage`).
- [x] **`WEBVIEW_STATE`** — Centralized `StateManager` that survives WebView restores (uses `vscode.Memento` for persistence).
- [x] **`WEBVIEW_THEME`** — Full VS Code theme token binding. The UI must look native in Light, Dark, and High Contrast modes automatically.

### M2 · Page Split: Post vs. Publish vs. Analytics

Three clean pages — no more clutter.

#### 📣 **Post Page** (Social Media)
- [x] **`PAGE_POST`** — The social post composer. Character counters, thread splitting, platform toggles. Migrated and cleaned from old `DotShareProvider`.
- [x] **`PAGE_POST_PREVIEW`** — Live per-platform preview pane (shows how the post looks on X vs. LinkedIn vs. Bluesky).
- [x] **`PAGE_POST_SCHEDULER`** — Scheduling UI embedded directly in the Post page (date/time picker, scheduled queue view).

#### 📝 **Publish Page** (Long-form / Blog)
- [x] **`PAGE_PUBLISH`** — Brand new page. Inputs: Title, Tags, Canonical URL, Publish Status toggle, Markdown preview area.
- [x] **`PAGE_PUBLISH_LOAD_FILE`** — "Load Current File" button using `vscode.window.activeTextEditor`. Pulls the active `.md` file directly.
- [x] **`PAGE_PUBLISH_FRONTMATTER`** — YAML frontmatter parser (`title`, `tags`, `canonical_url`, `description`) auto-fills the form on file load.
- [x] **`PAGE_PUBLISH_DRAFT_TOGGLE`** — Clear UI toggle: `🟡 Save as Draft` / `🟢 Publish Live`. Per platform.

#### 📊 **Analytics Page**
- [x] **`PAGE_ANALYTICS`** — Migrate `AnalyticsPanel.ts` into the WebView. Now it's a proper page, not a floating panel.
- [x] **`PAGE_ANALYTICS_CHART`** — Basic charts for post reach, engagement per platform (use a lightweight chart lib or canvas).

### M3 · Blogging Platform Integrations

- [x] **`DEVTO_API`** — Dev.to integration. `POST /api/articles`. Handle: `title`, `body_markdown`, `tags` (max 4), `canonical_url`, `published` flag. Use `api_key` auth.
- [x] **`DEVTO_FETCH_DRAFTS`** — List user's existing drafts from Dev.to for editing/republishing.
- [x] **`MEDIUM_API`** — Medium integration. Flow: `GET /v1/me` → get `authorId` → `POST /v1/users/{authorId}/posts`. Handle: `contentFormat: "markdown"`, `tags`, `publishStatus` (`public` | `draft` | `unlisted`), `canonicalUrl`.
- [x] **`MEDIUM_TOKEN_STORE`** — Secure Medium integration token storage via `credential-provider.ts`.

### M4 · Hashtag Manager

- [x] **`HASHTAG_MANAGER`** — Visual tag manager component. Add/remove custom tags, track usage frequency per platform. Postponed from v2.x, now it ships.
- [x] **`HASHTAG_SUGGEST`** — Based on usage history, suggest top tags when composing a post.

### M5 · Codebase Refactoring

- [x] **`SPLIT_WORKFLOWS`** — Hard wall between `/platforms/` (social: character limits, threads) and `/publishers/` (new dir: markdown parsing, metadata, blog APIs).
- [x] **`TYPES_V3`** — Rewrite `types.ts`. Add `BlogPost`, `SocialPost`, `PublishTarget`, `DraftStatus`, `FrontMatter` types.
- [x] **`CONSTANTS_CLEANUP`** — Audit `constants.ts`. Remove dead values, add platform-specific limits (Dev.to tag max, Medium tag max, etc.).
- [x] **`LOGGER_UPGRADE`** — Add log levels (`DEBUG`, `INFO`, `WARN`, `ERROR`) to `Logger.ts`. Structured output.

---

## v3.1 — *Polish Pass* ✨

> **Status:** ✅ Completed | Depends on: v3.0

No new features. Make everything in 3.0 feel **production-grade**.

- [x] **`ERROR_BOUNDARIES`** — Every API call (Dev.to, Medium, all social platforms) gets a consistent error UI. No raw JSON errors shown to users ever again.
- [x] **`LOADING_STATES`** — Skeleton loaders and spinner states for all async operations in the WebView.
- [x] **`TOAST_SYSTEM`** — Replace `vscode.window.showInformationMessage` with in-WebView toast notifications (success 🟢, warning 🟡, error 🔴).
- [x] **`KEYBOARD_SHORTCUTS`** — Map key actions: `Ctrl+Enter` to post, `Ctrl+Shift+D` to save draft, `Ctrl+L` to load current file.
- [x] **`EMPTY_STATES`** — Beautiful empty states for Analytics page when no data, Scheduled Queue when empty, etc.
- [x] **`RESPONSIVE_WEBVIEW`** — The WebView gracefully handles narrow panel widths (e.g. when split-screen coding).
- [x] **`ONBOARDING_FLOW`** — First-time setup wizard. Detect missing API keys and guide the user to configure them without leaving the WebView.
- [x] **`WHATS_NEW_V3`** — Update `WhatsNewProvider` with a 3.0 highlights page.er to configure them without leaving the WebView.
- [ ] **`WHATS_NEW_V3`** — Update `WhatsNewProvider` with a 3.0 highlights page.

---

## v3.2 — *Scheduling Engine Overhaul* ⏰

> **Status:** 🔵 Backlog | Depends on: v3.1

The current scheduler works. Now make it **powerful**.

- [ ] **`QUEUE_MANAGER_UI`** — Full scheduled queue viewer in the Post page. List all pending posts, edit time, delete, reorder.
- [ ] **`RECURRING_POSTS`** — Schedule posts to repeat (daily, weekly, custom interval). Built for devrel-style "tip of the day" campaigns.
- [ ] **`MULTI_PLATFORM_SCHEDULE`** — Schedule the same post to fire on different platforms at different times. E.g., post on LinkedIn Monday 9AM, Bluesky Monday 10AM.
- [ ] **`SCHEDULE_PREVIEW_CALENDAR`** — Mini calendar view showing all scheduled posts across all platforms in the WebView.
- [ ] **`SCHEDULER_SERVICE_HEALTH`** — Status indicator showing if `dotshare-scheduler.service` is running. One-click restart from within VS Code.
- [ ] **`TIME_ZONE_SUPPORT`** — Per-post time zone selection. Store in UTC internally, display in user's local time.
- [ ] **`POST_HISTORY_LOG`** — Persistent log of all sent posts (platform, content snippet, timestamp, success/fail status). Viewable in the WebView.

---

## v3.3 — *AI Writing Co-pilot* 🤖

> **Status:** 🔵 Backlog | Depends on: v3.1
> *Uses existing `src/ai/` — claude.ts, gemini.ts, openai.ts, xai.ts*

DotShare already has AI providers. Now surface them in the UI.

- [ ] **`AI_COPILOT_PANEL`** — Collapsible AI assistant pane in the Post page. Uses whichever AI provider is configured.
- [ ] **`AI_REWRITE_PLATFORM`** — "Optimize for [Platform]" button. Rewrites the current post to match the tone/length/format of X, LinkedIn, Bluesky, etc.
- [ ] **`AI_THREAD_SPLITTER`** — AI-powered smart thread splitting for X/Bluesky. Preserves meaning at split points. Better than character-count splitting.
- [ ] **`AI_HASHTAG_SUGGEST`** — AI generates relevant hashtags based on post content and past performance data.
- [ ] **`AI_BLOG_TO_SOCIAL`** — From the Publish page: one click to generate a social media teaser post from the loaded markdown article. Fire it to social platforms alongside the blog post.
- [ ] **`AI_TONE_SELECTOR`** — Tone presets: `Professional`, `Casual`, `Excited`, `Technical`. AI rewrites the draft accordingly.
- [ ] **`AI_PROVIDER_SELECTOR`** — Let users pick which AI model powers the co-pilot without leaving the WebView (Claude, GPT-4o, Gemini, Grok).

---

## v3.4 — *Analytics Powerhouse* 📊

> **Status:** 🔵 Backlog | Depends on: v3.2, v3.3

Turn DotShare into a **content performance command center**.

- [ ] **`ANALYTICS_FETCH_DEVTO`** — Pull article stats from Dev.to API (views, reactions, comments).
- [ ] **`ANALYTICS_FETCH_MEDIUM`** — Pull story stats from Medium (views, reads, fans) via their Partner API.
- [ ] **`ANALYTICS_DASHBOARD`** — Unified dashboard. All platforms, all metrics, single view. Time range selector (7d, 30d, 90d).
- [ ] **`ANALYTICS_BEST_TIME`** — "Best time to post" heatmap based on your historical engagement data. Per platform.
- [ ] **`ANALYTICS_TOP_POSTS`** — Ranked list of your top performing posts across all platforms with key metrics.
- [ ] **`ANALYTICS_EXPORT`** — Export analytics as CSV or JSON from within the WebView.
- [ ] **`ANALYTICS_GOALS`** — Set monthly goals (e.g., "500 reactions on Dev.to") and track progress with a visual indicator.

---

## v3.5 — *Multi-Account & Workspace Support* 👥

> **Status:** 🔵 Backlog | Depends on: v3.4

For DevRel engineers managing **multiple brands or clients**.

- [ ] **`MULTI_ACCOUNT_STORE`** — Extend `credential-provider.ts` to store N credentials per platform (e.g. personal X + company X). Named profiles.
- [ ] **`ACCOUNT_SWITCHER`** — Account switcher UI in the WebView header. Switch active profile per platform.
- [ ] **`WORKSPACE_PROFILES`** — VS Code workspace-level profiles. Open a client project → auto-switch to client's social accounts.
- [ ] **`TEAM_CONFIG`** — Export/import a workspace config (sans credentials) for sharing setup across a team via `.dotshare.json` in the project root.
- [ ] **`ORG_HASHTAG_SETS`** — Pre-defined hashtag sets per workspace/account (e.g. `#opensource #devrel #typescript` is your org's default set).

---

## v3.6 — *Cross-Platform Intelligence* 🔗

> **Status:** 🔵 Backlog | Depends on: v3.5

Stop copy-pasting. **DotShare adapts content** for each platform automatically.

- [ ] **`PLATFORM_RULES_ENGINE`** — Define per-platform rules: X (280 chars, no markdown), LinkedIn (3000 chars, structured), Bluesky (300 chars, supports links), Dev.to (full markdown), Medium (full markdown). Enforce at compose time.
- [ ] **`SMART_CROSSPOST`** — Single source post → AI adapts it to each selected platform's rules and tone. Preview each variant before sending.
- [ ] **`LINK_UNFURL_PREVIEW`** — Show how links unfurl (OG preview) on each platform before posting.
- [ ] **`CANONICAL_CHAIN`** — When publishing a blog post on Dev.to AND Medium, automatically set `canonical_url` on the second to point to the first. UI to choose which is canonical.
- [ ] **`PLATFORM_STATUS_CHECK`** — Real-time platform API status check before posting (avoid posting during a Twitter/X outage). Uses status page APIs.

---

## v3.7 — *CLI Parity* ⌨️

> **Status:** 🔵 Backlog | Depends on: v3.0
> *Extends existing `bin/dotshare-cli.js` and `src/cli/`*

The CLI should be **a first-class citizen**, not an afterthought.

- [ ] **`CLI_PUBLISH_BLOG`** — `dotshare publish --platform devto --file ./post.md` — publish a markdown file to Dev.to or Medium from the terminal.
- [ ] **`CLI_FRONTMATTER_AWARE`** — CLI reads YAML frontmatter automatically. No extra flags needed if the file is well-formed.
- [ ] **`CLI_DRAFT_MODE`** — `--draft` flag for all publish commands. Save as draft instead of publishing live.
- [ ] **`CLI_ANALYTICS`** — `dotshare stats --platform devto --range 30d` — pull and display analytics in the terminal.
- [ ] **`CLI_INTERACTIVE_MODE`** — `dotshare` with no args launches an interactive TUI (terminal UI) for composing and sending posts. Think `gum` or `charm`.
- [ ] **`CLI_CONFIG_INIT`** — `dotshare init` — guided CLI setup wizard for first-time config. Sets up all API keys, stored securely.
- [ ] **`CLI_CI_MODE`** — Headless mode for CI/CD pipelines. `dotshare publish --ci --file post.md --platforms devto,medium`. Exit codes for success/failure. Pipe-friendly output.

---

## v3.8 — *Extension & Plugin System* 🧩

> **Status:** 🔵 Backlog | Depends on: v3.6, v3.7

Let the community build on DotShare.

- [ ] **`PLATFORM_PLUGIN_API`** — Define a public `IDotSharePlatform` interface that community devs can implement to add new platforms without touching DotShare's core.
- [ ] **`PLATFORM_PLUGIN_LOADER`** — Discovery and loading of platform plugins from `node_modules` (similar to ESLint plugin pattern). Prefix: `dotshare-platform-*`.
- [ ] **`TEMPLATE_SYSTEM`** — User-defined post templates. Store in `.dotshare/templates/`. Variables: `{{title}}`, `{{url}}`, `{{tags}}`, `{{date}}`.
- [ ] **`WEBHOOK_TRIGGERS`** — Post-publish webhooks. Notify your own endpoint when a post goes live. For custom integrations (Zapier, n8n, etc.).
- [ ] **`PLUGIN_MARKETPLACE_PAGE`** — A page in the WebView listing known community plugins with install instructions.

---

## v3.9 — *Stability & LTS Prep* 🛡️

> **Status:** 🔵 Backlog | Depends on: v3.8

**Lock it down.** This is the release that gets the LTS tag.

- [ ] **`FULL_TEST_COVERAGE`** — Bring test coverage (already started in `src/ai/__tests__/`) to >80% across all modules. Focus on: `post-executor`, `scheduler`, all platform adapters, the new publisher modules.
- [ ] **`E2E_TEST_SUITE`** — End-to-end tests for the full post → publish → verify flow using VS Code Extension Testing API.
- [ ] **`PERFORMANCE_AUDIT`** — Profile WebView load time, message round-trips, and memory usage. Set budgets and enforce them.
- [ ] **`ACCESSIBILITY_AUDIT`** — Full WCAG 2.1 AA pass on the WebView UI. Keyboard nav, ARIA labels, screen reader testing.
- [ ] **`SECURITY_AUDIT`** — Audit credential storage, WebView CSP headers, input sanitization on all user-facing fields. Run `npm audit --audit-level=high` clean.
- [ ] **`DOCS_SITE`** — Dedicated documentation site (VitePress or Docusaurus). Auto-generated API docs from JSDoc. Guides for: setup, CLI usage, plugin development.
- [ ] **`MIGRATION_GUIDE_3X`** — Clear upgrade guide from 2.x → 3.x covering breaking changes: WebView migration, new config format, credential store changes.
- [ ] **`DEPRECATION_CLEANUP`** — Remove all `@deprecated` code paths that were kept for 2.x compat.

---

## 🔢 Quick Reference

```
v3.0  ████████████████████░░░░  Foundation (WebView + Blog platforms + Refactor)
v3.1  ███████████████░░░░░░░░░  Polish (DX, errors, onboarding)
v3.2  ████████████░░░░░░░░░░░░  Scheduling (queue, recurring, calendar)
v3.3  ████████████░░░░░░░░░░░░  AI Co-pilot (rewrite, thread split, blog→social)
v3.4  ██████████░░░░░░░░░░░░░░  Analytics (Dev.to, Medium, dashboard, goals)
v3.5  ████████░░░░░░░░░░░░░░░░  Multi-account (profiles, workspace, team config)
v3.6  ████████░░░░░░░░░░░░░░░░  Cross-platform (smart crosspost, canonical chain)
v3.7  ██████░░░░░░░░░░░░░░░░░░  CLI Parity (publish blog, CI mode, TUI)
v3.8  ██████░░░░░░░░░░░░░░░░░░  Plugin System (platform API, templates, webhooks)
v3.9  █████░░░░░░░░░░░░░░░░░░░  LTS Prep (tests, security, docs, deprecation)
```

---

## 📁 Projected Directory Structure (end of v3.x)

```
src/
├── ai/                     # AI providers (claude, gemini, openai, xai) — unchanged
├── cli/                    # CLI commands — expanded (v3.7)
│   ├── commands.ts
│   ├── config.ts
│   └── interactive.ts      # NEW: TUI mode
├── core/                   # Core engine — unchanged
│   ├── post-executor.ts
│   ├── scheduled-posts.ts
│   └── scheduler.ts
├── handlers/               # VS Code message handlers
├── platforms/              # Social platforms (unchanged adapters)
│   ├── bluesky.ts
│   ├── discord.ts
│   ├── facebook.ts
│   ├── linkedin.ts
│   ├── reddit.ts
│   ├── telegram.ts
│   └── x.ts
├── publishers/             # NEW (v3.0): Blog/long-form publishers
│   ├── devto.ts
│   ├── medium.ts
│   └── index.ts
├── plugins/                # NEW (v3.8): Plugin loader
│   └── loader.ts
├── state/                  # NEW (v3.0): Centralized WebView state
│   └── StateManager.ts
├── storage/
│   ├── credential-provider.ts  # Extended for multi-account (v3.5)
│   └── storage-manager.ts
├── ui/                     # WebView providers
│   ├── DotShareWebView.ts  # NEW (v3.0): Main WebView launcher
│   ├── AnalyticsPanel.ts   # Migrated into WebView (v3.0)
│   └── WhatsNewProvider.ts
├── webview/                # NEW (v3.0): All WebView frontend assets
│   ├── pages/
│   │   ├── PostPage.ts
│   │   ├── PublishPage.ts
│   │   ├── AnalyticsPage.ts
│   │   └── SettingsPage.ts
│   ├── components/
│   │   ├── HashtagManager.ts
│   │   ├── PlatformToggle.ts
│   │   ├── DraftToggle.ts
│   │   └── Toast.ts
│   └── router.ts
├── utils/
│   ├── Logger.ts           # Upgraded with log levels (v3.0)
│   ├── contextBuilder.ts
│   ├── frontmatterParser.ts  # NEW (v3.0)
│   └── projectDetector.ts
├── analytics.ts
├── constants.ts
├── extension.ts            # Entry point — opens WebView
└── types.ts                # Extended with blog/publisher types
```

---

## 🚩 Breaking Changes (2.x → 3.x)

| Area | 2.x Behavior | 3.x Behavior |
|---|---|---|
| UI Entry | Activity Bar sidebar | WebView panel (tab) |
| Config file | `settings.json` keys | `.dotshare.json` in workspace |
| Credential keys | Single account per platform | Named profiles, multi-account |
| `DotShareProvider` | Main UI host | Deprecated, replaced by `DotShareWebView` |
| Post logic | Monolithic | Split: `platforms/` (social) vs `publishers/` (blog) |

---

*Last updated: 2025 · DotShare by [@dotshare-dev](https://github.com)*
