# 🗺️ DotShare Roadmap — The 3.x Era (SaaS, Cloud Native & AI)

> **Codename:** *The Publishing Suite & AI Copilot*\
> **Philosophy:** Cloud-first scheduling, secure centralized credentials, lightweight extension, and automated codebase release intelligence.\
> **Current Version:** `v3.5.2` (Active Production)\
> **Next Milestone:** `v3.6.0` (Omni-Platform Release Hub)\
> **Companion Document:** [AI_RELEASE_COPILOT_ROADMAP.md](file:///home/kareem/StudioProjects/DotShare/AI_RELEASE_COPILOT_ROADMAP.md)

---

## 🧭 Milestone Overview & Status

```
v3.0.x  ████████████████████  Foundation (WebView Shell, Router, Bridge, Theming) ✅ Completed
v3.1.x  ████████████████████  Polish (Toasts, Error Boundaries, Keyboard Shortcuts) ✅ Completed
v3.2.x  ████████████████████  Cloud Scheduling & R2 Storage (Rail Nav, R2 Media Upload) ✅ Completed
v3.3.x  ████████████████████  SaaS Architecture (Purge Local Engine, DotShareAuth, Gists) ✅ Completed
v3.4.x  ████████████████████  CodeSnap & Modernization (CodeSnap Bridge, Deprecations) ✅ Completed
v3.5.0  ████████████████████  DotShare AI Core (Context Engine, 5 Tones, Bilingual) ✅ Completed
v3.5.1  ████████████████████  Smart CTA Hub & Dynamic AI (Live Discovery, SDK Migration) ✅ Completed
v3.5.2  ████████████████████  Blog Pilot (Dev.to Pure Markdown, Frontmatter Auto-fill) ✅ Completed
─────────────────────────────────────────────────────────────────────────────────────────────
v3.6.0  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  Omni-Platform Hub & Full UI Wizard ⏳ UP NEXT
v3.6.1  ░░░░░░░░░░░░░░░░░░░░  Pro Workflows, CodeSnap Release Bridge & Cloud Scheduler 🔵 Planned
v3.7.0  ░░░░░░░░░░░░░░░░░░░░  Multi-Account & Workspace Profiles 🔵 Backlog
v3.8.0  ░░░░░░░░░░░░░░░░░░░░  Community Plugin & Extension System 🔵 Backlog
v3.9.0  ░░░░░░░░░░░░░░░░░░░░  LTS Hardening & Stability Audit 🔵 Backlog
```

---

## ✅ Completed Milestones

### 🏗️ v3.0 — Foundation Strike
> **Status:** ✅ Completed\
- [x] **`WEBVIEW_SHELL`**: Created `DotShareWebView.ts` panel launcher.
- [x] **`WEBVIEW_ROUTER`**: Client-side tab navigation (Social, Blog, Analytics, Settings).
- [x] **`WEBVIEW_BRIDGE`**: Typed bidirectional `postMessage` protocol between host and WebView.
- [x] **`WEBVIEW_THEME`**: Native VS Code theme token integration (Light, Dark, High Contrast).
- [x] **`PAGE_POST` & `PAGE_PUBLISH`**: Dedicated social composer and long-form markdown publisher.
- [x] **`PLATFORM_ADAPTERS`**: Decoupled social adapters from blogging publishers.

### ✨ v3.1 — Polish & Native DX
> **Status:** ✅ Completed\
- [x] **`ERROR_BOUNDARIES`**: Consistent error banners and friendly recovery hints.
- [x] **`TOAST_SYSTEM`**: Native in-WebView toast notifications (Success, Info, Warning, Error).
- [x] **`KEYBOARD_SHORTCUTS`**: `Ctrl+Enter` to publish/share, `Ctrl+Shift+D` for drafts.
- [x] **`RESPONSIVE_WEBVIEW`**: Responsive flex layout accommodating split-editor panes.

### ⏰ v3.2 — Cloud Scheduling & Media Pipeline
> **Status:** ✅ Completed\
- [x] **`RAIL_NAVIGATION`**: Modern vertical rail navigation for intuitive switching.
- [x] **`CLOUD_ANCHOR`**: Direct media uploads backed by Cloudflare R2 (`MediaService.ts`).
- [x] **`OAUTH_UX`**: Seamless OAuth redirection flow via `dotshare-auth-server`.

### 🏛️ v3.3 — SaaS Architecture Master Plan
> **Status:** ✅ Completed\
- [x] **The Purge (Banish Local Scheduling)**: Completely removed `src/core/scheduler.ts`, `scheduled-posts.ts`, and legacy `bin/` directory.
- [x] **Auth & Billing Bridge**: Built [`DotShareAuth.ts`](file:///home/kareem/StudioProjects/DotShare/src/services/DotShareAuth.ts) with `vscode.secrets` token persistence.
- [x] **Scheduler Client**: Built [`SchedulerClient.ts`](file:///home/kareem/StudioProjects/DotShare/src/services/SchedulerClient.ts) communicating directly with `dotsuite-core` Rust backend.
- [x] **Unified Cloud Auth UI**: Integrated login, token validation, and account status in Settings.
- [x] **GitHub Gists**: Added full GitHub Gists publishing and sharing support.

### 📸 v3.4 — CodeSnap & Platform Modernization
> **Status:** ✅ Completed\
- [x] **`CODESNAP_INTEGRATION`**: Integrated [`CodeSnapService.ts`](file:///home/kareem/StudioProjects/DotShare/src/services/CodeSnapService.ts) and [`CodeSnapPanel.ts`](file:///home/kareem/StudioProjects/DotShare/src/ui/CodeSnapPanel.ts) to snap highlighted code into beautiful images and attach them to posts.
- [x] **`CVE_CLEANUP`**: Eliminated obsolete platforms (`snoowrap`, deprecated Reddit dependencies) and resolved 3 upstream CVEs.
- [x] **`POST_HANDLER_REFACTOR`**: Modularized platform handlers for zero-regression isolation.

### 🧠 v3.5.0 — DotShare AI Context Engine
> **Status:** ✅ Completed\
- [x] **`PROJECT_CONTEXT_SERVICE`**: Parallel extraction of workspace release context via [`ProjectContextService.ts`](file:///home/kareem/StudioProjects/DotShare/src/services/ProjectContextService.ts) (`CHANGELOG.md`, `README.md`, `package.json`, and `git diff --stat HEAD~1 HEAD`).
- [x] **`MULTI_TONE_PROMPTS`**: 5 tailored writing styles implemented in [`ReleasePromptBuilder.ts`](file:///home/kareem/StudioProjects/DotShare/src/ai/prompts/ReleasePromptBuilder.ts):
  - 👔 Professional & Formal (LinkedIn)
  - 🚀 Build in Public / Casual (𝕏 / BlueSky)
  - 🧠 Technical Deep-Dive (Architecture / Code)
  - ⚡ Quick TL;DR (Scannable highlights)
  - 📝 Full Markdown Article (Blogs)
- [x] **`BILINGUAL_PROMPTS`**: First-class support for fluent technical English and Arabic.
- [x] **`DYNAMIC_TOKENS`**: Tone-aware token budgets (up to 4,000 tokens for long-form articles).

### 🔗 v3.5.1 — Smart CTA Hub & Dynamic AI Discovery
> **Status:** ✅ Completed (Current Active Release)\
- [x] **`SMART_CTA_HUB`**:
  - Saved personal/community links (`UserCtaLink`) managed in `globalState` with live multi-panel sync.
  - Automatic detection and toggling of Workspace Git Repository URL.
  - Strict zero-hallucination URL prompt rules guaranteeing verbatim fidelity.
- [x] **`PURE_DYNAMIC_AI_DISCOVERY`**:
  - 100% dynamic live model fetching from provider APIs with zero hardcoded model fallbacks.
  - **Google Gemini**: Migrated to official `@google/genai` SDK with `pageSize=1000`.
  - **OpenAI**: Migrated generation engine to the modern `Responses API`.
  - **xAI Grok**: Integrated `/v1/language-models` endpoint with text modality filtering.
  - **DeepSeek**: Integrated live discovery and `thinking: { type: 'disabled' }`.
  - **Anthropic Claude**: Integrated live discovery via `client.models.list()`.
- [x] **`SECRETS_AUTO_FETCH`**: SecretStorage background auto-fetching for keys and status badges.
- [x] **`STRICT_MODEL_VERIFICATION`**: Enforced `GenerateContentOptions.model: string` across adapters.

---

### 📝 v3.5.2 — Blog Pilot (Dev.to Pure Markdown)
> **Status:** ✅ Completed\
- [x] **`DEVTO_ARTICLE_GENERATOR`**:
  - Connected `Full Technical Article` tone directly to Dev.to publisher workspace.
  - Strictly enforce GitHub Flavored Markdown (code fences with language identifiers, structured sections).
- [x] **`YAML_FRONTMATTER_BUILDER`**:
  - Auto-extract and populate metadata from project context and AI generation.
  - Auto-fill `blog-title`, `blog-tags` (max 4, sanitized lowercase), and `blog-canonical-url` in the WebView composer.
- [x] **`MARKDOWN_LIVE_PREVIEW`**:
  - Segmented toggle (`✏️ Raw Markdown` / `👁️ Live Preview`) with real-time rendered HTML and syntax-highlighted code blocks via `marked`.
  - Added live reading time and metadata stats (word count, char count).
  - 1-click "Publish Live" or "Save as Draft" directly to Dev.to.

---

## 🎯 Active & Upcoming Milestones

### 🌐 v3.6.0 — Omni-Platform Release Hub
> **Status:** ⏳ In Progress / Up Next\
> **Focus:** Full Release Control Center wizard generating content for all platforms simultaneously.

- [ ] **`MULTI_PLATFORM_ADAPTERS`**:
  - **🦋 BlueSky**: 300-grapheme limits, link facets, and thread creation.
  - **💬 Discord**: Rich webhook embeds with release highlights and color bands.
  - **📱 Telegram**: Telegram Markdown V2 / HTML formatted broadcasts.
- [ ] **`RELEASE_WIZARD_MODAL`**:
  - Unified 4-step wizard:
    1. Select context sources (`CHANGELOG`, `Git`, `README`).
    2. Select target platforms (Multi-select: X, LinkedIn, BlueSky, Dev.to, Discord, Telegram).
    3. Choose tone and language.
    4. **Multi-Tab Live Preview**: Switch tabs to review/edit platform variants before sending.
- [ ] **`ONE_CLICK_BROADCAST`**: "Publish to All Selected Platforms" action with atomic status tracking.

---

### 🚀 v3.6.1 — Pro Workflows & CodeSnap Bridge
> **Status:** 🔵 Planned\
> **Focus:** CodeSnap integration for releases, cloud scheduling, and smart tagging.

- [ ] **`CODESNAP_RELEASE_BRIDGE`**: Auto-detect key code changes in git diff and suggest generating a snapshot image to attach to the release post.
- [ ] **`CLOUD_RELEASE_SCHEDULER`**: Schedule release announcements across platforms via DotSuite Rust backend (`SchedulerClient`).
- [ ] **`SMART_HASHTAG_EXTRACTOR`**: Automatically infer platform-tailored tags from `package.json` and `README.md` tech stack.

---

## 🔮 Future Backlog (v3.7 — v3.9)

### 👥 v3.7 — Multi-Account & Workspace Profiles
- [ ] **`MULTI_ACCOUNT_STORE`**: Support multiple accounts per platform (e.g., Personal X + Corporate X).
- [ ] **`WORKSPACE_PROFILES`**: Bind active social accounts to specific VS Code workspaces (`.dotshare.json`).
- [ ] **`TEAM_CONFIG`**: Exportable team profile configurations without credentials.

### 🧩 v3.8 — Extension & Plugin System
- [ ] **`PLATFORM_PLUGIN_API`**: Public interface (`IDotSharePlatform`) allowing community-authored platform plugins.
- [ ] **`POST_TEMPLATES`**: Reusable templates with dynamic variables (`{{version}}`, `{{repo}}`, `{{highlights}}`).
- [ ] **`WEBHOOK_TRIGGERS`**: Outbound webhooks on successful publish events.

### 🛡️ v3.9 — Stability, LTS & Public API
- [ ] **`FULL_E2E_SUITE`**: End-to-end testing using VS Code Extension Testing API.
- [ ] **`PERFORMANCE_BUDGETS`**: Profile and optimize WebView message roundtrips and memory footprint.
- [ ] **`DOCS_PORTAL`**: Dedicated documentation portal with quickstarts, tutorials, and developer guides.

---

## 📁 Current Repository Architecture

```
src/
├── ai/                         # DotShare AI Engine
│   ├── prompts/
│   │   └── ReleasePromptBuilder.ts   # 5-tone bilingual release prompt system
│   ├── claude.ts               # Anthropic SDK (dynamic discovery)
│   ├── deepseek.ts             # DeepSeek API (thinking: disabled)
│   ├── gemini.ts               # @google/genai SDK (pageSize=1000)
│   ├── openai.ts               # OpenAI Responses API
│   └── xai.ts                  # xAI Grok language-models API
├── handlers/                   # IPC Message Routing
│   ├── ConfigHandler.ts
│   ├── GistHandler.ts
│   ├── MessageHandler.ts
│   └── PostHandler.ts          # Core post and AI generation dispatcher
├── platforms/                  # Publishing Adapters
│   ├── bluesky.ts
│   ├── devto.ts
│   ├── discord.ts
│   ├── linkedin.ts
│   ├── platform-config.ts
│   ├── telegram.ts
│   └── x.ts
├── services/                   # Business Services
│   ├── AnalyticsService.ts
│   ├── CodeSnapService.ts      # Code screenshot capture
│   ├── DotShareAuth.ts         # DotSuite cloud authentication & secret storage
│   ├── DraftsService.ts
│   ├── GistService.ts
│   ├── HashtagService.ts
│   ├── HistoryService.ts
│   ├── MediaService.ts         # Cloudflare R2 media upload
│   ├── ProjectContextService.ts # Context engine (CHANGELOG, Git, README)
│   ├── SchedulerClient.ts      # dotsuite-core Rust backend scheduler client
│   └── TokenManager.ts
├── storage/                    # Secure Storage Layer
│   ├── credential-provider.ts
│   └── storage-manager.ts
├── ui/                         # VS Code Panels
│   ├── AnalyticsPanel.ts
│   ├── CodeSnapPanel.ts
│   ├── DotShareProvider.ts
│   ├── DotShareWebView.ts      # Primary tab-based WebView container
│   └── WhatsNewProvider.ts
├── utils/                      # Helper Utilities
│   ├── blog-validator.ts
│   ├── contextBuilder.ts
│   ├── frontmatter-parser.ts
│   ├── Logger.ts
│   └── projectDetector.ts
├── types/                      # TypeScript Definitions
│   ├── dotshare-ai.ts          # Release copilot & CTA contracts
│   └── index.ts
├── constants.ts
├── extension.ts                # Main extension entrypoint
└── types.ts
```

---

*Last updated: October 2026 · DotShare by [@dotshare-dev](https://github.com/kareem2099/DotShare)*
