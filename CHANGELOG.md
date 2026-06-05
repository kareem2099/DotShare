# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.4.1] - 2026-06-05 — "Cleanup"

### Removed
- **🧹 Facebook Platform**: Fully removed — all backend adapters (`PostHandler`, `PostExecutor`), OAuth flows (`MessageHandler`, `TokenManager`), Rust core routes, secret keys (`storage-manager.ts`), UI components (`platform-post.html`, CSS), and event listeners (`event-handlers.ts`).
- **🧹 Reddit Platform**: Fully removed — same scope as Facebook. This includes the Reddit Settings Card UI (subreddit/title/flair/spoiler inputs), `redditMetadata` payload logic, `reddit-disclaimer` CSS, and the `reddit-options-card` DOM element.
- **🧹 Medium Platform**: Fully removed — all blog publishing integration, API adapters, and type references.
- **🧹 Legacy CSS & Variables**: Removed old `.theme-toggle` logic, `body.dark` overrides, and unused `themeChanged` listeners. Webviews now natively use VS Code CSS variables (`--vscode-*`).

### Fixed
- **🔧 TypeScript: `ScheduledPost` property names**: Corrected stale references to `scheduledTime` → `scheduled_at`, `postData.text` → `text_preview`, and `postData.media` → `has_media` in `scheduled-posts.ts` to match the updated `ScheduledPost` interface in `src/types.ts`.
- **🔧 TypeScript: `getProviderEmoji` signature**: Updated the parameter type from `'gemini' | 'openai' | 'xai'` to `string` and added a `claude` case — preventing a `TS2345` type error in `post-history.ts`.
- **🔧 TypeScript: `saved-apis.ts` module path**: Fixed broken import (`../../types` → `../../../src/types`) and added explicit `string` cast for `credentials` values to resolve `Property 'trim' does not exist on type '{}'` errors.
- **🔧 TypeScript: `noUnusedLocals` clean**: All files now pass `tsc --noUnusedLocals --noEmit` with zero errors.
  - `MessageHandler.ts` / `PostHandler.ts`: Removed `private` shorthand from services that were only passed-through — they are now plain constructor params.
  - `DotShareAuth.ts`: Added `getContext()` accessor so the static `_context` field is considered read.
  - `AnalyticsPanel.ts`: Added `get extensionUri()` accessor; restored accidentally-removed `this._update()` call.
  - `DotShareWebView.ts`: Converted `private constructor(private readonly _context)` to a plain param that assigns to the static field.
  - `event-handlers.ts`: Removed dead `const shareFacebookBtn = null` and `const loadRedditPostsBtn = null` stubs.
  - `post-history.ts`: Removed unused `successRateValue` variable declaration and initialization.
  - `scheduled-posts.ts`: Removed unused `currentEditingPostId` and `setCurrentEditingPostId` imports.
  - `event-handlers.ts`: Removed unused `themeToggle` declaration and related UI event listeners.

### Enhancements
- **🚀 Dev.to Integration**: Polished and enhanced the Dev.to article publishing flow for better reliability and consistency with the remaining blogging platforms.

### Changed
- **`MAX_CHARS_MAP`** in `media/webview/app.ts`: Removed `facebook: 63206` and `reddit: 40000` entries.
- **Platform count**: DotShare now supports **7 platforms** — LinkedIn, X (Twitter), Telegram, Discord, BlueSky, Dev.to, and GitHub Gist.

---

## [3.4.0] - 2026-05-31 — "CodeSnap"

### Added
- **📸 CodeSnap Feature**: Capture syntax-highlighted code snapshots from your active editor
  - Auto-captures selected code or full file content
  - Smart indentation normalization to avoid wasted space
  - Supports 40+ programming languages with proper syntax coloring
- **🎨 Rendering Engine**: HTML Canvas-based rendering (no native dependencies)
  - Offline-first with local Highlight.js and theme CSS via `vendor/` directory
  - Webview Asset URIs for secure local resource loading
- **🎨 Professional Theme Support**: 9+ built-in themes with accurate color palettes
  - Atom One Dark, GitHub Dark, Monokai, Dracula, Nord, VS2015, Tokyo Night, GitHub Light, Catppuccin Mocha
  - Each theme includes background, code background, and syntax color definitions
- **🎛️ Customization Controls**: Real-time preview with adjustable settings
  - Font size slider (8px–24px)
  - Padding slider (4px–48px)
  - Toggle: Window chrome, line numbers, DotShare watermark
  - Background color picker
- **📱 Platform Integration**: QuickPick platform selector to share CodeSnap to all platforms
  - Works with: LinkedIn, X (Twitter), BlueSky, Telegram, Discord, Dev.to
  - Automatically opens Composer with snapshot attached via internal messaging
- **💾 Local Save**: Download CodeSnap as PNG via native Save dialog
- **🔄 Singleton Panel**: One CodeSnap panel at a time, reuses existing panel if already open
- **🔗 Two-Way Integration**: 
  - CodeSnap panel has a "Share" button that opens the Composer
  - Composer has a "📸 Add CodeSnap" button that opens the CodeSnap panel
  - Pending snap image is held until Composer fires webviewReady, then automatically attached
- **⌨️ Command Registration**:
  - `dotshare.codeSnap`: Opens CodeSnap panel
  - `dotshare.attachSnapToComposer`: Internal command to attach snap to Composer
  - `dotshare._composerReady`: Monitors Composer readiness and injects pending snap

### Technical Details
- **CodeSnapService**: Captures editor state with language detection and indentation normalization
- **CodeSnapPanel**: Manages WebView lifecycle with race-condition-safe webviewReady handshake
- **codesnap.html**: Standalone HTML UI with embedded Canvas rendering logic and theme system
- **messaging**: Base64 PNG encoding/decoding for snap data transfer between panels

---


## [3.3.5] - 2026-05-27 — "Open Privacy Hotfix"

### Fixed
- **Local Publishing Bug**: We apologize for a bug introduced in v3.3.4 where the "Share Thread" and "Publish Article" buttons were incorrectly disabled if you weren't logged into DotSuite Cloud. DotShare remains a privacy-first tool: standard local publishing via manual API keys is fully supported and does **not** require a DotSuite Cloud account. Only Cloud Scheduling requires the dashboard connection. This has been fully resolved.
- **UI Clarification**: Added explicit "OPTIONAL" tagging to the DotSuite Cloud section to clarify that it is solely for scheduling and sync features.

---

## [3.3.4] - 2026-05-27 — "Unified Cloud Auth"

### Added
- **🌐 Unified DotSuite Cloud Authentication**: We've completely overhauled the authentication experience. The old, intrusive manual API key popup is gone. It's been replaced by a sleek, unified "DotSuite Cloud" section directly inside the sidebar. 
- **⚡ Seamless Browser OAuth**: Connect to DotShare securely via your browser (dashboard) and watch the VS Code sidebar instantly update in real-time. No copy-pasting required.
- **💼 Rich Profile Insights**: Once connected, your cloud card now displays your active tier (Pro/Max), used quotas, and profile details straight from the backend.

### Removed
- Removed the old redundant "Profile Modal" and `dotshare.login` command popups to streamline the user experience into a single sidebar component.

---

## [3.3.3] - 2026-05-27 — "Auth Hotfix"

### Fixed
- **Critical Fix**: Resolved an issue where the production version was incorrectly pointing to `localhost:3000` for authentication callbacks instead of the live Vercel URL.
- **URI Handler Update**: Fixed the `vscode://freerave.dotshare` URI scheme handler to properly intercept production tokens.

---

## [3.3.2] - 2026-05-25 — "GitHub Gists & Developer Workflows"

### Added
- **1-Click Gist Creation (Auto-Populate)**: Select any code snippet in your active VS Code editor, hit "Create Gist" from the command palette or sidebar, and the Webview will open with the exact code snippet and current file name automatically populated.
- **Universal Drafts System for Gists**: Gists are now fully integrated into DotShare's global `DraftsService`. You can save, load, edit, and delete Gist drafts seamlessly alongside your other social media and blog drafts from the unified "Saved Drafts" tab.

### Fixed
- **OAuth Connect/Disconnect State Bug**: Fixed a bug where the GitHub "Disconnect" button would fail to appear correctly in the UI. The extension now relies on its internal `TokenManager` as the absolute source of truth instead of checking the global VS Code session, ensuring the sidebar Connect/Disconnect UI accurately reflects your DotShare authentication status.
- **Type Safety**: Ensured strict TypeScript casting for draft data when loading isolated Gist drafts into the Webview.

---

## [3.3.1] - 2026-05-24 — "Security Patch"

### Added
- **🔐 Explicit Security Consent** (`src/handlers/PostHandler.ts`): Added a mandatory one-time consent dialog before any platform API key is synced to the DotSuite server. The dialog clearly states:
  - What data is being synced
  - That keys are encrypted with **AES-256-GCM** at rest
  - That access can be revoked at any time from the Dashboard
  - That keys are never shared with third parties
  - User consent is persisted in VS Code `globalState` (`dotshare.cloudCredentialsConsentGiven`) — asked only once per machine. If the user declines, no credentials are ever uploaded.
- **🛡️ README Security Section**: Added a full `Security, Privacy & Your API Keys` section documenting the consent mechanism, encryption layers, and user rights.

---

## [3.3.0] - 2026-05-24 — "Production Bridge"

### Added
- **`src/constants.ts`**: New centralized constants file for all external URLs.
  - `DOTSUITE_CORE_API_URL` — points to the production Rust backend on Railway (`dotsuite-core-production.up.railway.app`).
  - `DOTSUITE_WEB_URL` — points to the production Next.js frontend on Vercel (`dotsuite.vercel.app`), with an automatic `localhost:3000` fallback in development.
- **Cover Image Upload for Blog Posts**: Added a dedicated **Upload** button to the blog composer's Cover Image field. Users can now select a local image file and upload it directly to Cloudflare R2, receiving a permanent CDN URL that is auto-filled into the cover image input — without leaving VS Code.

### Changed
- **`DotShareAuth.ts`**: Default API base URL updated from `http://127.0.0.1:8080` (local dev) to `DOTSUITE_CORE_API_URL` (production Railway). The local override via `DOTSUITE_API_URL` environment variable is still supported.
- **`MessageHandler.ts`** and **`PostHandler.ts`**: All hardcoded `localhost:3000` / production URL ternaries replaced with a single import of `DOTSUITE_WEB_URL` from `constants.ts`.
- **`SchedulerClient.ts`**: Replaced `native fetch` with `axios` for `multipart/form-data` uploads to fix a Node.js boundary-piping bug that caused `Bad Request` errors from the Rust backend.

### Fixed
- **Composer Wipe on Image Upload**: The `status: success` message handler was incorrectly calling `resetAllComposers()` for *any* success event (including image uploads), erasing the user's title, tags, description, and content. Fixed by decoupling informational success toasts from workflow-completion resets. Only `shareComplete` and `blogShareComplete` events now trigger a composer reset.

---

## [3.2.7] - 2026-05-14 — "Cloud Anchor"

### Added
- **Cloud Media Upload Pipeline** (`src/services/SchedulerClient.ts`): Images attached to scheduled posts are now uploaded to **Cloudflare R2** via `POST /v1/media/upload` before the schedule payload is sent. The returned CDN URL replaces the local file path in `media_urls`, ensuring the Rust scheduler can always access the asset at dispatch time — even if the local file is gone.
  - Upload is authenticated with the user's Bearer JWT (same token used for scheduling).
  - Each file is sent as `multipart/form-data` to `dotsuite-core`.
  - Local paths in `media_urls` are detected and uploaded automatically; already-remote URLs are passed through unchanged.
- **Missing OAuth Credentials UX** (`src/handlers/PostHandler.ts`): Cloud scheduling now intercepts the new `MISSING_OAUTH_CREDENTIALS` error code returned by `dotsuite-core`. Instead of a generic error toast, VS Code shows an actionable alert: **"Open Dashboard"** — deep-linking the user directly to `dotsuite.dev/en/login?intent=vscode` to connect their accounts.
- **Upload Progress Indicator** (`media/webview/app.ts` + `media/webview/style.css`): A per-image upload progress bar appears in the media grid while images are being pushed to R2. Each thumbnail shows a spinner overlay and transitions to a ✓ checkmark on success. Upload failures display an inline ✗ with a retry hint.
- **`uploadMediaFiles()` helper** (`media/webview/app.ts`): New async function that resolves all local media paths to CDN URLs before the schedule payload is constructed, keeping `handleSchedulePost()` clean.

### Changed
- **`SchedulerClient.schedulePost()`**: Now accepts and forwards `media_urls: string[]` (CDN URLs) instead of raw local file paths. Callers are responsible for resolving paths before calling this method.
- **`MessageHandler.ts`**: Refactored `cloud_schedule` command handler to await media upload resolution before forwarding to `SchedulerClient`. Error surface is now split: upload errors bubble as `upload_error`, OAuth errors as `oauth_error`, quota errors as `quota_error`.
- **`media/main.ts`**: Unified the media-path serialisation to always use the resolved CDN URL array when building the outgoing `schedulePost` WebView message.

### Fixed
- **Scheduler sending local paths**: Previously, `media_urls` could contain absolute local filesystem paths (e.g. `/home/user/photo.jpg`). The Rust scheduler has no access to the client's filesystem, so those posts would always fail silently at dispatch. The new upload step eliminates this failure class entirely.

---

## [3.2.6] - 2026-04-25 — "Patch"

### Fixed
- **Markdown File Load — Fields Empty Bug**: Fixed `handleReadMarkdownFile` incorrectly calling `sendSuccess()` which triggered `resetAllComposers()` and erased all just-populated fields (title, tags, description, body). Now uses `status` type `'info'` so the reset is not triggered.
- **Remote Drafts — Showing All Articles**: `handleFetchDevToDrafts` was returning all articles (published + drafts). Now filters to `published === false` only, showing drafts exclusively.
- **Blog Publish — Error and Success Toast Simultaneously**: When pre-publish validation failed, `shareToDevToWithUpdate` / `shareToMediumWithUpdate` used `return` (silent) instead of `throw`, causing `handleShareBlog` to count it as a success and fire a success toast alongside the error toast. Now throws so `handleShareBlog` correctly records the failure.
- **Blog Publish Button Stuck After Validation Error**: The `finally { shareComplete }` block fired even after validation failures, triggering `resetAllComposers()` which wiped article content and left the button in a broken state. Replaced `shareComplete` with a new `blogShareComplete` message that only resets publish buttons — article content is preserved.

### Added
- **Pre-Publish Blog Validator** (`src/utils/blog-validator.ts`): New validation layer that runs before every Dev.to and Medium publish:
  - **Errors (block publish)**: missing title, title > 128 chars (Dev.to) / > 100 chars (Medium), empty body, boilerplate body placeholder.
  - **Warnings (non-blocking toasts)**: article < 50 words, missing description (SEO), no tags, tags > 4 (Dev.to) / > 5 (Medium), duplicate tags, invalid tag characters, tags > 30 chars.
  - Tags are **auto-sanitized** (lowercase, dedup, invalid char strip, length trim, count clamp) before the API call.
- **`blogShareComplete` WebView Message**: New message type for blog platforms that resets only the publish buttons on success — preserves article body/title/tags/description so the user can review what was published. Includes the published article URL in the success toast (8s display).

## [3.2.5] - 2026-04-24 — "Nexus"
### Added
- **Universal Drafts System**: Expanded the drafts architecture to support all platforms (LinkedIn, X, Bluesky, Facebook, Telegram, Reddit) in addition to Dev.to and Medium.
- **Deep Draft Integration**: Drafts are now accessible directly within the Social Composer, allowing you to save and resume progress across any social platform seamlessly.
- **Enhanced Drafting UI**: Improved the drafting experience with clear platform badges, better metadata preservation, and a more responsive grid layout.
- **Two-Way Markdown Sync**: Click "Load" on any Draft to immediately rewrite the currently open `.md` editor file with the draft's exact YAML frontmatter and body, ensuring the Webview and Editor are always 100% in sync.
- **Full Meta-Data Draft Preservation**: Saving Local/Remote drafts from the Blogging Workspace now correctly captures and preserves Title, Tags, Description, Cover Image, Canonical URL, and Series metadata, not just the body text.
- **Blog Reset Boilerplate Button**: Added a new "🧹 Reset Boilerplate" ghost button in the blog publisher view. With one click, it wipes the UI and the active markdown editor back to the clean, default frontmatter block, avoiding manual deletion.
- **Split-Editor Workflow Optimization**: Pressing "Create Post" for Dev.to or Medium now automatically creates/opens the required platform `.md` file in a Side-by-Side Split Editor, ensuring the Webview never obscures the active writing file.

### Changed
- **Major Codebase Cleanup**: Removed over 500 lines of legacy CSS and unused JavaScript components, significantly reducing the extension's memory footprint.
- **Webview Optimization**: Refactored the internal messaging and state management for a snappier, more reliable UI response time.

### Fixed
- **Escape HTML Reference Fix**: Resolved a critical `ReferenceError: escapeHtml is not defined` bug that caused Local Drafts to fail to render if they contained non-escaped character sequences.

## [3.2.4] - 2026-04-19
### Fixed
- **Temporary Reddit Disablement**: Temporarily disabled Reddit OAuth functionality due to third-party authorization issues to ensure security. Reddit connection features will be restored soon.
- **Type Safety**: Improved type safety and fixed unreachable code evaluation warnings in backend API handlers.

## [3.2.3] - 2026-04-16 — "Aegis"
### Added
- **Aegis 1.4.0 Integration**: Full integration with the DotShare Auth v1.4.0 "Aegis" protocol for proactive token lifecycle management.
- **Visual Token Intelligence**: Added Aegis Status Badges (Stable 🛡️ / Warning ⚠️) to the platform cards in the sidebar. Users can now see their exact token health at a glance.
- **Proactive Refresh Button**: A new "Refresh Connection" button appears when a token is nearing expiry (e.g., Facebook's 60-day window or X's rotation), allowing manual renewal before a failure occurs.
- **Absolute Expiry Tooltips**: Hovering over the platform badge now shows the exact date and time the connection will expire.
- **Unified Auth Broker Pattern**: Refactored `TokenManager.ts` to use a unified response handler for all OAuth platforms, improving reliability and reducing code duplication.

### Fixed
- **X (Twitter) Rotation Warnings**: Added UI-level detection for X rotation failures. The extension now explicitly asks the user to reconnect if a secret rotation fails during a refresh.
- **Reddit Token Permanence**: Fixed Reddit auth flow to always request `duration=permanent`, ensuring refresh tokens are correctly issued.

## [3.2.2] - 2026-04-13
### Fixed
- **Character Limit Validation**: Fixed a bug where thread posts did not turn red when exceeding platforms' character limits and the "Share" button remained enabled. Corrected missing validation logic in the thread composer's character counter.

## [3.2.1] - 2026-04-12
### Added
- **Frontend Image Compression**: Migrated image compression logic from the backend to the frontend using HTML5 Canvas. This eliminates the heavy `sharp` dependency and improves processing speed.

## [3.2.0] - 2026-04-12 — "The Media Expansion" (2026-04-12)

### Added
- **Multi-Image Media Grid**: Users can now attach up to 4 images per single post, matching platform-native behaviour for both Bluesky and X/Twitter.
  - Dynamic CSS-grid thumbnail preview rendered inside the composer on file selection.
  - Per-thumbnail ✕ remove buttons for granular selection management.
  - "Remove All" bulk action button to clear the entire media selection in one click.
  - `renderMainMediaGrid()` — central re-render function acting as the single source of truth; rebuilds the grid DOM from `activeMediaPaths[]` on every state change.
- **True Multi-Image Bluesky Posts**: Fixed `bluesky.ts` embed builder — now uploads every selected image as a separate Blob, collects all `ref` objects, and attaches them as a proper `app.bsky.embed.images` array in one post request (previously only `media[0]` was used).
- **True Multi-Image X / Twitter Posts**: Updated `x.ts` media upload flow — calls `uploadMedia()` sequentially for each image and passes all resulting `media_id` values together in the final tweet payload.
- **Thread Multi-Image Support**: Each post in the Thread Composer now independently supports up to 4 images. Per-post `mediaFilePaths[]` arrays are tracked separately and serialised correctly in the `shareThread` payload.
- **Smart File Size Warning**: Files over 2 MB trigger an inline toast warning at selection time (before upload), informing users that automatic optimisation will occur at post time.
- **Just-In-Time Compression**: Image compression is applied in `MediaService.ts` at share time (backend), preserving quality as long as possible and keeping the frontend snappy.
- **Secure Webview URI Thumbnails**: `MessageHandler.ts` now converts local filesystem paths into `vscode-resource://` safe URIs via `webview.asWebviewUri()`, enabling real `<img src>` thumbnail previews within VS Code's sandboxed webview CSP.

### Fixed
- **`activeMediaPath` typo** (TS error `2552`): Renamed all stale references to the correct `activeMediaPaths` array — the share payload was sending `undefined` before this fix.
- **Media state reset**: `activeMediaPaths` is now correctly cleared to `[]` after a successful post and when the user discards the composer.
- **Thread post re-indexing**: Removing a thread post now correctly splices the `threadPosts` array and calls `reIndexThreads()` to prevent stale `data-*` index references causing media attachment bugs.

---

## [3.1.0] - 2026-04-07 — "The Polish Pass"


### Added
- **WebView Toast Engine**: Replaced intrusive VS Code popups with custom, non-intrusive notifications (progress bars, auto-dismiss, contextual colors).
- **Global Loading States**: Buttons switch to "Spinning/⏳" state and disable themselves automatically during async posting operations.
- **Character Limit Validation**: Integrated max-chars verification system (`MAX_CHARS`) into the UI, offering visual highlights (warning at 80% limit, error styling over 100%, button disabled).
- **UI Aesthetics**: Substantial UI/UX visual upgrade employing glassmorphism effects (`backdrop-filter: blur(8px)`) and CSS animations on modals/cards.

### Fixed
- **Reddit Native Image Upload (S3 Boss Fight)**: Fixed the complex native image upload pipeline for Reddit via S3. Implemented robust FormData field parsing, corrected `Content-Length` missing errors that triggered AWS 400 violations, and correctly fed raw S3 payload URLs back to `api/submit` to prevent "Invalid image URL" traps from Reddit's unpopulated CDN.
- **The Disappearing Preview Race Condition**: Implemented selective reset logic inside the WebView message handlers. Differentiates "intermediate" success (file upload complete) from "terminal" success (post completely shared) to prevent erasing user inputs prematurely.
- **Reddit UI Integration**: Fixed HTML field mismatches in `platform-post.html` and `app.ts` (`redditSubreddit`, `redditTitle`, `redditFlairId`, `redditPostType`, `redditSpoiler`) that caused the `PostHandler` to drop the actual text payload.
- **Variable Cleanup**: Scoured and removed unused UI variables like `btnSchedule` to pass strict ESLint criteria.
- **NPM Package Updates**: Resolved multiple Critical/High security alerts across development packages by bumping `flatted`, `handlebars`, `picomatch`, and other dev dependencies via npm auditing.

## [3.0.1] - 2026-04-05

### Added
- **Medium API Notice**: Added a prominent warning notice in the Medium settings and publish views regarding their recent API restrictions and the manual activation process via email.
- **Improved UX**: Updated "Integration Token" labels and placeholders for clarity.
- **Telegram Fix**: Network and TLS stability improvements for Telegram posting.

## [3.0.0] - 2026-04-04 — "The Publishing Suite"

### Added
- **Dev.to Integration**: Publish markdown articles to Dev.to via API. Supports title, tags (max 4), canonical URL, description, cover image URL, series, and draft/publish toggle. Auth via `api-key` header stored in VS Code SecretStorage.
- **Medium Integration**: Publish articles to Medium via API. Supports markdown/HTML content format, tags (max 5), canonical URL, and publish status (`public` | `draft` | `unlisted`). Auth via Bearer token. Normalizes `published` → `public` automatically.
- **Blog Publish Page**: Dedicated long-form publishing UI separated from social post logic. Features: Title, Tags (chip input), Description, Cover Image URL, Canonical URL, Series, and Draft vs. Publish toggle per platform.
- **Active File Reader**: "Load Current File" button reads the active `.md` file from VS Code editor and populates the publish form automatically.
- **YAML Frontmatter Parser**: Auto-extracts `title`, `tags`, `canonical_url`, `description`, `cover_image`, `series` from markdown frontmatter to pre-fill the publishing form.
- **Platform-First Navigation**: Sidebar redesigned with platform icons as primary navigation. Selecting a platform auto-switches the workspace (Threads / Social / Blogs) based on `PLATFORM_CONFIGS`.
- **Platform Config System**: New `platform-config.ts` as single source of truth for all platform metadata — `maxChars`, `supportsThreads`, `workspaceType`, `charCountMethod`, `authType`, and more. Shared between extension and WebView.
- **X Premium Toggle**: Premium toggle in the platform header for X — switches character limit from 280 to 25,000.
- **Thread Composer**: Dedicated thread-building UI for X and Bluesky with per-post character counters and media attachments.
- **`PostExecutor` class**: Centralized platform execution engine decoupled from VS Code UI concerns. Used by the scheduler for clean background posting.
- **`CredentialProvider` refactor**: Added `getRedditSubreddit()` method and `redditSubreddit` field. Extracted shared `resolve()` helper to eliminate credential-fetching duplication.
- **Dev.to image policy**: Clarified that Dev.to API does not support direct image uploads — only public URLs are accepted. Local files are skipped with a descriptive logger warning.
- **Medium image policy**: Local files skipped with warning; HTTP/HTTPS URLs embedded directly in markdown body.
- **`countChars()` fix**: Twitter URL counting now always replaces URLs with exactly 23 chars (was incorrectly using `Math.min(url.length, 23)`).
- **`types.ts` v3 overhaul**: Added `BlogPost`, `FrontMatter`, `PublishTarget`, `PublishResult`, `DraftStatus`, `WebViewPage`, `DevToArticle`, `MediumPost`, `WebViewState`, and related response types. Added `devto` and `medium` to `SocialPlatform` union and `AnalyticsSummary`.

### Fixed
- **`PostHandler` handlers**: `handleShareToFacebook`, `handleShareToDiscord`, `handleShareToX`, `handleShareToBlueSky` now correctly read post content from the incoming `message` object instead of relying on `historyService.getLastPost()`.
- **Reddit subreddit hardcode**: Removed hardcoded `subreddit: 'test'` from both `PostHandler` and `PostExecutor`. Subreddit is now read from `CredentialProvider.getRedditSubreddit()` with a clear error if not configured.
- **Discord not-implemented**: `shareToDiscordWithUpdate` now returns a user-facing `'Discord sharing coming soon!'` error instead of silently logging.
- **`handleShareThread` platform validation**: Now uses `PLATFORM_CONFIGS[platform].supportsThreads` instead of a hardcoded `platform !== 'x' && platform !== 'bluesky'` check.
- **`unifiedSharePost` success counter**: Fixed — now correctly increments `successCount` per platform and reports accurate partial-success messages.
- **`devto.ts` ESLint**: Removed unused `FormData` and `fs` imports after image upload feature was removed.
- **`PostExecutor` ESLint**: Removed empty `onSuccess: () => {}` callbacks that triggered `@typescript-eslint/no-empty-function`.

### Changed
- **WebView workspace tabs removed**: Replaced "Threads / Social / Blogs" tab bar with a dynamic `platform-header` element. Workspace switching is now driven by `switchPlatform()` in `app.ts` using `PLATFORM_CONFIGS[platform].workspaceType`.
- **`shareToDevTo` signature**: Extended with `title`, `tags`, `description`, `coverImage`, `published`, `canonicalUrl`, `series` overrides — all respected in the API payload.
- **`shareToMedium` signature**: Extended with `title`, `tags`, `publishStatus`, `canonicalUrl`, `contentFormat` overrides. Added `normalizeMediumPublishStatus()` to handle `published` → `public` mapping.
- **`CredentialProvider`**: Refactored to use private `resolve()` helper — eliminates the `if (credentialsGetter) ... else ...` pattern repeated in every method.
- **`PostHandler` Reddit fallback title**: Now uses `post.text.substring(0, 300)` instead of hardcoded `'Post from DotShare'`.
- **`handleShareBlog` publish status mapping**: `published` → `public` is now applied consistently before passing to Medium.

### Removed
- **`uploadImageToDevTo()`**: Removed — Dev.to has no public image upload API. Replaced with URL-only handling + logger warning for local files.
- **`Share To` card in social workspace**: The multi-platform checkbox grid inside the social composer was removed. Platform is now selected from the sidebar.
- **Old workspace tabs HTML**: `<div class="workspace-tabs">` and `workspace-tab` buttons removed from `index.html`.

---

## [2.4.0] - 2026-03-11

### Added
- **One-Click OAuth Flow**: Full browser-based OAuth for LinkedIn, X (Twitter), Facebook, and Reddit via dedicated auth server (`dotshare-auth-server.vercel.app`) — zero credential input in the extension
- **OAuth UI Polish**: Connected ✓ badges, green connected states, and Disconnect buttons for all OAuth platforms
- **Advanced Accordion**: Manual token inputs collapsed under an "Advanced" section to reduce clutter
- **Direct Platform APIs**: All 4 platforms (LinkedIn, X, Facebook, Reddit) now post directly to their respective APIs using tokens from VS Code SecretStorage
- **Smart Hashtag System**: Intelligent `HashtagService` with 7 auto-detection sources — project name, git commits, tech keywords, content analysis, framework detection, trending topics, and platform-specific tags
- **Custom Hashtags Setting**: Registered `dotshare.customHashtags` and `dotshare.defaultPlatform` in VS Code Settings UI (`contributes.configuration`) — no more manual `settings.json` editing
- **Claude AI Support**: Added Anthropic Claude as a 4th AI provider alongside Gemini, OpenAI, and xAI

### Fixed
- **Reddit Hashtag Bug**: Hashtags are no longer appended to Reddit posts (Reddit does not use functional hashtags); same applies to Discord — controlled via `HASHTAG_UNSUPPORTED_PLATFORMS`
- **Project Name Accuracy**: `HashtagContext.projectName` now sourced from `package.json → name` or `Cargo.toml → name`, falling back to workspace folder basename — no longer guessed from random keywords like `test` or `lint`
- **Content Term Detection**: Simplified word-split regex in `getContentBasedHashtags` from `/[^a-zA-Z0-9.\-/]/` to `/[^a-zA-Z0-9]/`; updated `techTerms` to alphanumeric-only (`cicd`, `nodejs`)

### Changed
- **`extractKeywords()`**: Refactored to return `{ keywords, projectName }` instead of a flat `string[]`; project name is no longer mixed into the keywords array
- **All 4 AI Providers**: Now check `HashtagService.supportsHashtags(platform)` before appending hashtags
- **Build Optimization**: Updated `.vscodeignore` to exclude `__tests__/`, `src/`, and dev config files — significantly reduced `.vsix` bundle size

### Technical Details
- Auth server deployed on Vercel; all secrets server-side only via `process.env`
- Deep link handler `vscode://freerave.dotshare/auth` registered in `package.json` `uriHandlers`
- `HashtagService.supportsHashtags()` is the single source of truth for platform hashtag support

---

## [2.3.0] - 2026-03-04

### Added
- **Smart AI Hashtags**: Automatic hashtag generation using 7 context sources — project type, keywords, git commit history, post content, detected frameworks, trending topics, and platform-specific tags
- **`HashtagService`**: New dedicated service (`src/services/HashtagService.ts`) encapsulating all hashtag logic with relevance scoring (0–1 scale), deduplication, and a configurable limit
- **`HashtagContext`**: Structured context interface passing project type, keywords, active file, git changes, and post content to the hashtag engine
- **Analytics Dashboard**: Visual analytics panel tracking post history, per-platform success rates, and share counts
- **`AnalyticsService`**: New service for cross-platform engagement metric aggregation and calculation
- **Context-Aware Prompts**: AI prompts updated to instruct models NOT to include hashtags (the system appends them automatically based on real project context)
- **`contextBuilder.ts`**: Centralized project context builder — single source of truth for all AI providers, scanning `package.json`, `Cargo.toml`, `README.md`, `CHANGELOG.md`, and git history

### Fixed
- **AI Hallucination Reduction**: Prompts now include explicit project files and git info, instructing the AI to only mention technologies and features actually present in the codebase

### Changed
- **AI Providers (Gemini, OpenAI, xAI)**: All refactored to use shared `buildProjectContext()` from `contextBuilder.ts` instead of each building their own context
- **Post Generation Flow**: `postContent` is set on `hashtagContext` after AI text is generated, enabling content-based hashtag detection

---

## [2.2.0] - 2026-01-22

### Added
- **Clean Architecture Refactoring**: Complete transformation from single Monolithic Class (2000+ lines) to 9 focused files with clear separation of concerns
- **Services Layer**: New HistoryService, AnalyticsService, and MediaService for modular functionality
- **Handler Pattern**: Specialized handlers including ConfigHandler, RedditHandler, and PostHandler with MessageHandler routing
- **Premium UI Design System**: Modern glassmorphism effects, gradient accents, smooth animations, and professional modal designs
- **Hybrid Scheduling System**: Server-side scheduling for Telegram, client-side for other platforms with intelligent post type handling
- **Critical Security Enhancement**: Migrated from insecure globalState to VSCode SecretStorage for API credential encryption
- **Advanced Scheduler Features**: Atomic file operations, intelligent retry logic with exponential backoff, stuck posts recovery system
- **Enhanced Type Safety**: Comprehensive TypeScript interfaces replacing all 'any' types, proper error handling with 'unknown' types
- **Modern Platform Cards**: Transformed checkbox-based selection to professional grid cards with hover animations and platform branding
- **Global Logger System**: Structured logging for webview JavaScript files with colored console output and debug modes
- **What's New Feature**: Auto-open changelog panel on extension updates with VSCode-native styling
- **API Key Persistence**: Automatic loading and saving of AI model API keys in secure storage
- **Platform-Specific Scheduling**: Server-scheduled posts for Telegram, client-side execution for other platforms

### Fixed
- **Critical Security Vulnerability**: Resolved insecure API configuration storage using plain JSON files
- **Scheduler Race Conditions**: Fixed posts getting stuck in 'processing' state with atomic operations and lock mechanisms
- **Configuration Loading**: Fixed extension startup configuration loading issues
- **Modal Functionality**: Resolved saved APIs modal 'Add New' button and schedule modal event handlers
- **Platform Selection Logic**: Fixed Schedule Post button platform counting and content validation
- **UI Button States**: Corrected inverted logic where schedule button was enabled without content
- **Message Routing**: Fixed 'schedulePost' command routing to PostHandler instead of ConfigHandler
- **ESLint Warnings**: Eliminated all TypeScript errors and ESLint warnings throughout codebase
- **Import Organization**: Cleaned up imports and dependencies across all modules
- **Timezone Handling**: Fixed scheduled post timing issues with proper UTC storage
- **Storage Consistency**: Aligned storage paths between PostHandler and scheduler components
- **Post Status Tracking**: Implemented comprehensive status tracking with platform-specific results

### Changed
- **Architecture**: Applied SOLID principles with Single Responsibility, Dependency Inversion, and Interface Segregation
- **UI Provider**: Streamlined DotShareProvider with clean dependency injection and focused responsibilities
- **Scheduler Reliability**: Enhanced with retry mechanisms, error recovery, and performance optimizations
- **File Organization**: Improved maintainability with 160-250 lines per file vs previous 2000+ line Monolithic Class
- **Error Handling**: Comprehensive error handling and user notifications throughout the application
- **Code Quality**: 100% TypeScript coverage with zero errors and warnings

---

## [2.1.0] - 2025-12-24

### Added
- **NPM Publishing**: Official release of `dotshare-cli` on NPM registry
- **Single Source of Truth**: Implemented centralized `constants.ts` for managing Server URL configuration across all modules (CLI & Extension)
- **Production Default**: Configured default server URL to point to live Railway instance for seamless out-of-the-box experience

### Fixed
- **Linter Cleanup**: Resolved all ESLint warnings in `src/reddit.ts` and `src/telegram.ts` regarding unused imports
- **Type Safety**: Fixed `no-explicit-any` warnings in `src/cli/commands.ts`
- **CLI Authentication**: Fixed `open` library compatibility issues (CommonJS/ESM)
- **Connection Fallback**: Fixed default connection logic to ensure CLI connects to production server when no local config exists

---

## [2.0.0] - 2025-10-28

### Added
- **Manual Post Creation**: Support for creating posts manually without AI generation
- **Enhanced Media Upload**: Drag-and-drop and click-to-browse functionality for attachments
- **Reddit Subreddit Selection**: Modal for subreddit/title/flair selection when sharing to Reddit
- **Reddit User Profile Support**: Ability to post to user profiles (u/) in addition to communities (r/)
- **Real-time UI Feedback**: Platform selector now shows configured platforms dynamically
- **Multi-language Support Improvements**: Language translations update without restart

### Fixed
- Fixed duplicate currentLang variables causing language translations to not update
- Fixed VS Code API multiple acquisition error preventing webview from loading
- Fixed vscode undefined error in modal handlers
- Fixed Saved APIs modal close button event listener missing
- Fixed analytics dashboard showing zeros with tab click refresh logic
- Fixed automatic configuration loading when extension opens
- Fixed Schedule Post and Share Now buttons not activating when platforms selected
- Fixed media attachment click handler to work on entire area
- Fixed Reddit sharing errors by removing hardcoded subreddit

---

## [1.0.0] - 2025-10-18

### Added
- **Expanded Platform Support**: X/Twitter, Facebook, Discord, Reddit, BlueSky
- **Enhanced AI Capabilities**: Multiple AI providers (Gemini, OpenAI, xAI), model selection
- **Advanced Analytics & Tracking**: Dashboard, per-platform metrics, post history
- **Enhanced Scheduling System**: Multi-platform scheduling, advanced status tracking
- **API Configuration Management**: Saved configurations, quick switching, named configs
- **Media Support**: Multi-file attachments, cross-platform media optimization
- **Reddit-specific Features**: Post types, flair selection, spoiler support, post management
- **User Interface Enhancements**: Activity Bar integration, multi-language support, responsive design

---

## [0.0.1] - 2025-10-03

### Added
- Initial release of DotShare VS Code extension
- AI-powered social media post generation using Gemini and other models
- Share posts to LinkedIn and Telegram directly from VS Code
- Scheduled posting feature for CLI
- Multi-language support (English, Arabic, Russian)
- Integrated webview UI for managing posts