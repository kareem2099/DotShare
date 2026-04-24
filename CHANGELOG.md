# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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