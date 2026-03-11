# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Technical Details
- Hashtag suggestions sorted by relevance score descending; top 5 selected
- Git log scanned for last 3–5 commits to infer hashtags (`#Fix`, `#Feature`, `#Refactor`, `#Docs`, `#Testing`)
- `workspace.getConfiguration('dotshare').get('customHashtags', [])` reads user-defined tags with highest priority (relevance 1.0)

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
- **Developer Experience**: Fast compilation, clear navigation, and self-documenting code structure
- **Security**: Enterprise-grade credential encryption using OS keychain integration
- **User Interface**: Professional design with modern visual effects and responsive interactions
- **Scheduling Performance**: Optimized check intervals and intelligent post execution management

### Technical Details
- **Architecture Quality**: Professional clean architecture with 9 focused files and clear separation of concerns
- **Code Quality**: 100% type safety, zero ESLint warnings, comprehensive error handling
- **Security**: API credentials encrypted using VSCode SecretStorage with automatic migration
- **UI Design**: Premium design system with glassmorphism, gradients, and micro-interactions
- **Scheduler System**: Bulletproof scheduling with atomic operations, retry logic, and hybrid execution
- **Performance**: Fast compilation, optimized intervals, and efficient resource usage
- **Maintainability**: Modular architecture enabling easy feature additions and bug fixes
- **Scalability**: Clean dependency injection supporting platform and functionality expansion

## [2.1.0] - 2025-12-24

### Added
- **NPM Publishing**: Official release of `dotshare-cli` on NPM registry
- **Single Source of Truth**: Implemented centralized `constants.ts` for managing Server URL configuration across all modules (CLI & Extension)
- **Production Default**: Configured default server URL to point to live Railway instance for seamless out-of-the-box experience

### Fixed
- **Linter Cleanup**: Resolved all ESLint warnings in `src/reddit.ts` and `src/telegram.ts` regarding unused imports (`PostData`, `FormData`)
- **Type Safety**: Fixed `no-explicit-any` warnings in `src/cli/commands.ts` by implementing strict typing (`Record<string, any>`) and proper error casting
- **CLI Authentication**: Fixed `open` library compatibility issues (CommonJS/ESM) to ensure browser opens correctly during OAuth login
- **Connection Fallback**: Fixed default connection logic to ensure CLI connects to production server when no local config exists

### Changed
- Refactored `linkedin.ts`, `telegram.ts`, `reddit.ts`, and `commands.ts` to consume `DEFAULT_SERVER_URL` from the shared constant file

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
- Fixed vscode undefined error in modal handlers causing "Choose AI Model" button to fail
- Fixed Saved APIs modal close button event listener missing
- Fixed analytics dashboard showing zeros with tab click refresh logic
- Fixed automatic configuration loading when extension opens
- Removed "Required"/"Optional" badges from platform cards for cleaner UI
- Fixed platform selector not showing configured platforms
- Fixed remaining vscode undefined errors during initialization
- Fixed post-history.ts vscode undefined error
- Fixed Schedule Post and Share Now buttons not activating when platforms selected
- Fixed button enable/disable logic for manual posts
- Fixed 'postMessage undefined' error during initialization
- Fixed media attachment section visibility for manual posts
- Fixed media attachment click handler to work on entire area
- Added null checks for drag and drop handlers
- Fixed vscode.postMessage calls to use safe accessor across multiple files
- Added LinkedIn & Telegram share message handlers
- Fixed individual share buttons to send manual post content
- Implemented multi-platform sharing with manual posts
- Included attached media in all sharing operations
- Fixed Reddit sharing errors by removing hardcoded subreddit

### Changed
- Updated UI to support manual post creation workflow with reorganized layout
- Updated version number to 2.0.0

### Technical Details
- Enhanced webview initialization and event handling
- Improved error recovery and user feedback
- Added comprehensive TypeScript type safety improvements

## [1.0.0] - 2025-10-18

### Added
- **Expanded Platform Support**:
  - 🐦 **X/Twitter Integration**: Complete posting to X (formerly Twitter) with full API support
  - 📘 **Facebook Integration**: Post to Facebook profiles and pages with page management
  - 💬 **Discord Integration**: Webhook-based posting to Discord channels and servers
  - 🟠 **Reddit Integration**: Full Reddit post management including flair, spoilers, link vs self posts
  - 🦋 **BlueSky Integration**: Early adopter support for decentralized social media platform
- **Enhanced AI Capabilities**:
  - 🧠 **Multiple AI Providers**: Support for Gemini, OpenAI, and xAI providers
  - 🎯 **Model Selection**: Choose specific models from each AI provider
  - ✨ **Improved Content Generation**: Enhanced AI-powered post suggestions
- **Advanced Analytics & Tracking**:
  - 📊 **Analytics Dashboard**: Comprehensive tracking of posting performance across all platforms
  - 📈 **Platform-specific Metrics**: Individual success rates and share counts per platform
  - 📋 **Post History**: Complete history with timestamps, AI models used, and success tracking
- **Enhanced Scheduling System**:
  - ⏰ **Multi-platform Scheduling**: Schedule single posts to multiple platforms simultaneously
  - 🎯 **Advanced Status Tracking**: Detailed status updates for each platform in scheduled posts
  - ❌ **Error Handling**: Comprehensive error reporting and retry mechanisms for failed posts
- **API Configuration Management**:
  - 💾 **Saved Configurations**: Save and manage multiple API keys per platform
  - 🔄 **Quick Switching**: Easy switching between different account configurations
  - 🏷️ **Named Configurations**: Label and organize your API settings
- **Media Support**:
  - 📎 **Multi-file Attachments**: Support for uploading images and videos
  - 🎨 **Cross-platform Media**: Media optimization per platform requirements
- **Reddit-specific Features**:
  - 🔗 **Post Types**: Support for both link posts and self posts
  - 🏷️ **Flair Selection**: Choose appropriate flairs for Reddit communities
  - 🚨 **Spoiler Support**: Mark posts as spoilers when needed
  - ✏️ **Post Management**: Edit and delete Reddit posts from within VSCode
- **User Interface Enhancements**:
  - 🖥️ **Activity Bar Integration**: Rich webview interface in VSCode sidebar
  - 🌐 **Multi-language Support**: Arabic and Russian translations
  - 📱 **Responsive Design**: Improved mobile and tablet compatibility
  - 🎨 **Dark/Light Themes**: Multiple theme options including Nebula Dark and Cyber Dark
- **Technical Improvements**:
  - 🔒 **Type Safety**: Comprehensive TypeScript interfaces throughout codebase
  - ⚡ **Performance**: Optimized webview loading and API interactions
  - 🐛 **Error Recovery**: Better error handling and user feedback
  - 📁 **Code Organization**: Modular architecture supporting platform expansion

### Changed
- Updated version number to 1.0.0
- Enhanced VSCode extension manifest with new commands and configurations
- Improved error messages and user guidance

### Technical Details
- Added support for 7 social media platforms (up from 2)
- Comprehensive API integrations with rate limiting and error handling
- Advanced scheduling with platform-specific result tracking
- Full internationalization support for multiple languages

## [0.0.1] - 2025-10-03

### Added
- Initial release of DotShare VS Code extension
- AI-powered social media post generation using Gemini and other models
- Share posts to LinkedIn and Telegram directly from VS Code
- Scheduled posting feature for CLI
- Multi-language support (English, Arabic, Russian)
- Integrated webview UI for managing posts

### Technical Details
- Extension built with TypeScript
- Webview for user interface
- Command-line scheduler tool
- Support for multiple AI providers
