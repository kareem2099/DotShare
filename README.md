<div align="center">

# 🚀 DotShare

### *Share Your Code Journey, Amplify Your Voice*

[![Version](https://img.shields.io/badge/version-3.5.2-blue.svg)](https://github.com/kareem2099/DotShare)
![Codename](https://img.shields.io/badge/codename-DotShare--AI-10b981?style=flat-square&labelColor=0f0f0f)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.90%2B-007ACC?logo=visual-studio-code)](https://code.visualstudio.com/)
[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)](https://nodejs.org/)
<a href="https://www.buymeacoffee.com/freerave"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=flat&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee"></a>

**Transform your development updates into compelling social media content—right from your IDE.**

[Installation](#-installation) • [Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Support](#-support)

</div>

---

## 🆕 What's New — v3.5.2 "Blog Pilot (Dev.to) & Workspace Context Search"

- **Release evidence and article quality**:
  - Select the latest tagged release, a specific tag, committed HEAD work, or tracked uncommitted changes. All release sources use one immutable commit.
  - Complete multiline changelog entries and version-specific `docs/releases` documents supply reported verification and remaining checks.
  - Articles use supplied source excerpts, with a code toggle and at most one automatic repair for detectable problems. Remaining unverifiable code is omitted with a visible review notice; other unresolved errors still block generation.
  - Incomplete or empty responses are detected across all five AI providers. Quick social posts share the same evidence collection.
  - Quality checks cover code provenance, selected URLs, supported scope statistics, frontmatter and code-fence completeness; they do not prove every prose claim.
- **📰 Dev.to Technical Article Generator & Live Markdown Preview**:
  - One-click article generation directly from workspace release context using the dedicated `Full Article (Dev.to)` tone.
  - Strict **Pure Markdown Rule**: AI writes standard GitHub Flavored Markdown with clean code fences, language tags, and structured technical sections.
  - Smart YAML Frontmatter auto-parsing into `blog-title`, `blog-tags` (max 4 lowercase alphanumeric tags), and `blog-description`.
  - Dual-mode segmented toggle (`✏️ Raw Markdown` / `👁️ Live Preview`) powered by `marked` and sanitized with `DOMPurify`.
  - Real-time article reading metrics: word counter, character counter, and estimated reading time.
- **🔍 Query-Driven Git Topic Search**:
  - Automatically queries Git commit history using `git log --grep` (with `--all-match` precision) and pickaxe `git log -S` matching the user's custom topic or prompt.
  - Dynamically extracts high-relevance commits instead of relying solely on generic recent logs.
- **💻 Semantic Diff & Code Snippet Extraction**:
  - Reads verified function excerpts around changed executable code, with real file paths and line ranges, prioritized by topic relevance and implementation coverage.
  - Supplies the AI with ground-truth code implementation details while excluding binaries, lockfiles, minified bundles, and tests.
- **📦 Working-Tree Dependency Diff Engine**:
  - Compares Node, Rust, Python and Go dependency manifests within the selected release boundary; local edits are included only in Uncommitted changes mode.
  - Informs the AI of newly installed, upgraded, or removed libraries with exact version numbers.
- **🌐 Multi-Ecosystem Manifests**:
  - Extended project metadata, version, repository, and tech stack auto-detection to **Rust (`Cargo.toml`)**, **Python (`pyproject.toml`)**, **Go (`go.mod`)**, and **Node.js (`package.json`)**.
- **📄 Active Editor Working Context**:
  - Seamlessly captures the currently open file path, language identifier, and selected code focus snippet directly from `vscode.window.activeTextEditor`.
- **📚 Workspace Docs & Architecture Search**:
  - Scans workspace markdown documentation (`docs/**`, `*.md`) for topic-relevant paragraphs to inject real architecture context into articles.
- **🛡️ Security, Zero Shell Invocation & Secret Redaction**:
  - Switched subprocess execution to `execFile` with structured array arguments, eliminating shell injection risks and Windows pathspec quoting errors.
  - Automated secret redaction (`sanitizeSnippetSecrets`) protecting sensitive API keys (`sk-`, `ghp_`, `AIza`, `AKIA`, bearer tokens, private keys) from code snippets.
  - Dynamic UI badges (`🏷️ tag → HEAD`, `⚠️ Uncommitted`, `⚠️ No tags`) and guidance banners keeping developers informed of their Git workspace state.

---

## 🆕 What's New — v3.5.1 "Smart CTA Hub & Pure Dynamic AI Discovery"

- **🔗 Smart User CTA & Links Hub**:
  - Save, edit, and manage persistent personal/community links with custom labels, URLs, and emojis stored securely in `globalState`.
  - Automatic detection of your Workspace Repository URL with separate runtime toggle.
  - Real-time multi-panel broadcast synchronization (`userCtaLinksUpdated`) keeping all open composer tabs in sync.
  - Authoritative `Set<string>` selection state maintaining checkbox selections across multi-panel link additions and re-renders.
  - Race-condition elimination on repository checkbox during background extraction.
  - Strict URL Fidelity and zero-hallucination prompt rules ensuring exact verbatim URL output with platform-specific URL budgeting.
- **✨ Pure Dynamic AI Model Discovery**:
  - 100% dynamic live model discovery: Provider APIs are the sole source of truth with zero static hardcoded model fallbacks.
  - **Google Gemini**: Migrated to official `@google/genai` SDK with `GoogleGenAI` and `pageSize=1000` discovery.
  - **OpenAI**: Migrated generation engine to the modern `Responses API` (`responses.create({ model, input, max_output_tokens })`).
  - **xAI Grok**: Integrated dedicated `/v1/language-models` endpoint with `output_modalities: ['text']` filtering.
  - **DeepSeek**: Integrated live model discovery and optimized social generation with `thinking: { type: 'disabled' }`.
  - **Anthropic Claude**: Integrated live model discovery via `client.models.list()`.
- **🔐 SecretStorage Hardening & Auto-Fetch**:
  - Automatic background live model fetch upon opening `Select AI Model` modal using secure keys stored in `SecretStorage`.
  - Safely updates model selection without re-typing API key when a valid key already exists in `SecretStorage`.
  - Added UI Security Vault banner, dynamic provider key status badges (`🔒 Key Saved & Active` / `⚠️ Not Configured`), and status-only saved-key displays with empty replacement fields.
- **🛡️ Strict Compile-Time & Runtime Model Verification**:
  - Enforced `GenerateContentOptions.model: string` (required) across the entire engine, preventing runtime regressions or missing model arguments.
- **🎨 Platform Post Header Clean-up**: Consolidated AI actions into the unified DotShare AI modal and streamlined platform headers.

---

## 🆕 What's New — v3.5.0 "DotShare AI Release Copilot"

- **🧠 DotShare AI Context Engine**: Automatically parses your project's `CHANGELOG.md`, `README.md`, `package.json`, Git commits, and diffs (`git diff --stat HEAD~1 HEAD`) in parallel to understand what actually changed in your codebase.
- **🎭 5 Distinct Writing Tones**:
  - 👔 **Professional & Formal**: Corporate and polished, optimized for LinkedIn.
  - 🚀 **Build in Public / Casual**: Friendly, authentic developer journey for 𝕏 and BlueSky.
  - 🧠 **Technical Deep-Dive**: In-depth code changes, architecture, and performance analysis.
  - ⚡ **Quick TL;DR**: Rapid, scannable bullet points for instant reading.
  - 📝 **Full Markdown Article**: Strict pure Markdown with YAML Frontmatter for Dev.to and technical blogs.
- **🌍 Fluent Bilingual Generation**: Native AI prompt support for both developer-focused English and technical Arabic (العربية الفصحى التقنية السلسة).
- **🔍 Inspect Release Context Command**: Use `DotShare: 🧠 Inspect AI Release Context` (`dotshare.inspectReleaseContext`) to inspect extracted workspace context directly in VS Code.
- **⚡ Unified AI Engine**: Standardized custom content generation across Gemini, Claude, OpenAI (with `max_completion_tokens` reasoning models support), and Grok with tone-aware token budgets.

---

## 🆕 What's New — v3.4.1 "Cleanup"

- **🧹 Platform Purge**: Facebook, Reddit, and Medium have been fully removed from DotShare. All backend adapters, OAuth flows, UI components, secret management, and CSS styles related to these platforms are gone.
- **🔧 TypeScript Cleanup**: Resolved all `noUnusedLocals` errors across `src/` and `media/src/`. Unused constructor parameters, dead imports, and leftover null constants from removed platforms are cleaned up.
- **🐛 Type Fixes**: Corrected `ScheduledPost` property names (`scheduledTime` → `scheduled_at`, `postData` → `text_preview`/`has_media`), fixed `getProviderEmoji` to accept `claude`, and fixed `saved-apis.ts` module resolution path.
- **📦 Zero Dead Code**: All `unused variable` and `unused import` warnings silenced without suppression hacks — unused constructor params are now proper plain params or have accessor methods.

---

## 🆕 What's New — v3.4.0 "CodeSnap"

- **📸 CodeSnap Panel**: Create beautiful, syntax-highlighted code snapshots directly from your editor with full customization controls (themes, font size, padding, line numbers, watermark, background color).
- **🎨 9+ Professional Themes**: Choose from Atom One Dark, GitHub Dark, Monokai, Dracula, Nord, VS2015, Tokyo Night, GitHub Light, Catppuccin Mocha, and more—with accurate syntax highlighting via Highlight.js.
- **📱 Share to All Platforms**: Export your CodeSnap directly to LinkedIn, X (Twitter), BlueSky, Telegram, Discord, Dev.to, and more—with the Composer automatically loading your snapshot.
- **💾 Local Save**: Download CodeSnap images as PNG files to your computer with one click.

---

## [3.3.3] - 2026-05-27 — "Auth Hotfix"

- **Critical Fix**: Resolved an issue where the production version was incorrectly pointing to `localhost:3000` for authentication callbacks instead of the live Vercel URL.
- **URI Handler Update**: Fixed the `vscode://freerave.dotshare` URI scheme handler to properly intercept production tokens.

---

## [3.3.2] - 2026-05-25 — "GitHub Gists & Developer Workflows"

- **🪄 1-Click Gist Creation**: Highlight code in your VS Code editor, click "Create Gist", and DotShare instantly opens with your code snippet and current filename auto-populated.
- **💾 Universal Drafts Integration**: Gists are now a first-class citizen inside the global Drafts System. Save your snippets and resume them anytime alongside your social and blog drafts.

---

## 🔐 Security Patch — v3.3.1

- **Explicit Cloud Consent**: Platform credentials are synced to the DotSuite scheduler only after a one-time consent dialog. Local publishing and AI requests send credentials to their respective services as needed.
- **Security & Privacy Documentation**: New README section fully documents the consent mechanism, encryption layers (in-transit and at-rest), and your rights as a user.

---

## 🎯 Why DotShare?

Building in public shouldn't be hard. DotShare bridges the gap between your code editor and your audience, letting you share achievements, updates, and insights across **7 platforms** with AI-powered assistance—all without leaving VS Code.

### The Problem We Solve

- ⏰ **Time Drain**: Manually crafting posts for multiple platforms
- 🎨 **Writer's Block**: Struggling to articulate technical achievements
- 🔄 **Context Switching**: Jumping between editor and social media
- 📅 **Consistency**: Forgetting to share progress regularly

### Our Solution

A unified, intelligent posting experience that understands your code and speaks your audience's language.

---

## ✨ Features

### 🤖 AI-Powered Content Creation

Leverage cutting-edge AI to transform code updates into engaging narratives:

- **Google Gemini**: Nuanced, high-context technical updates
- **OpenAI GPT**: Industry-leading conversational and reasoning models (`o1`, `o3`, `o4`, `gpt-4o`)
- **Anthropic Claude**: Advanced reasoning, structured analysis, and long-form articles
- **DeepSeek**: Ultra-efficient coding and reasoning models (`deepseek-chat`, `deepseek-reasoner`)
- **xAI Grok**: Real-time awareness and developer-focused summaries

### 📱 Platform Integrations

Share seamlessly across your entire professional network:

| Platform | Type | Features | Status |
|----------|------|----------|---------|
| 🔗 **LinkedIn** | Social | Profile posts, rich media | ✅ Full Support |
| 📱 **Telegram** | Social | Channels, groups, scheduling | ✅ Full Support |
| 𝕏 **X (Twitter)** | Social | Tweets, threads, X Premium (25K chars), **up to 4 images** | ✅ Full Support |
| 💬 **Discord** | Social | Webhooks, embeds | ✅ Full Support |
| 🦋 **BlueSky** | Social | Threads, facets, **up to 4 images**, JIT compression | ✅ Full Support |
| 👨‍💻 **Dev.to** | Blog | Articles, series, drafts | ✅ Full Support |
| 💻 **GitHub Gist** | Code | Snippets, public/secret, auto-populate | ✅ Full Support |

### 📰 The Publishing Suite (v3.0 New!)

DotShare is no longer just a social poster — it's a full **publishing suite**:

- **Blog Publish Page**: Dedicated UI for long-form article publishing
- **Active File Reader**: Load your `.md` file directly from VS Code editor
- **YAML Frontmatter Parser**: Auto-fills title, tags, canonical URL from your markdown
- **Draft vs. Publish Toggle**: Per-platform draft / publish.
- **Platform-First Navigation**: Click a platform icon → workspace adapts automatically
- **Universal Drafts System**: Save any social post or blog article as a draft and resume later across all supported platforms. *(New in v3.2.6)*

### 🖼️ Multi-Image Media Grid *(New in v3.2)*

Attach up to **4 images per post**, just like native platform clients:

- **Live Thumbnail Previews** — See exactly what you're posting before you hit share
- **Individual Remove Buttons** — Remove a single image without clearing everything
- **"Remove All" Bulk Action** — One click resets the entire media selection
- **Smart File Size Warning** — Files over 2 MB get an inline warning; compression is handled automatically at post time
- **Secure Webview URIs** — Thumbnails load instantly using VS Code's sandboxed `vscode-resource://` protocol

### 🧵 Thread Composer

Build and share threads natively:
- Multi-post thread builder for X and Bluesky
- Per-post character counters with platform limits
- **Up to 4 images per thread post** *(New in v3.2)*
- X Premium mode (25,000 chars)

### ☁️ Cloud Scheduling with Secure Media (v3.2.7)

When you schedule a post with images, DotShare now:

1. **Uploads each image** to Cloudflare R2 via `POST /v1/media/upload` (authenticated with your session JWT)
2. **Replaces local paths** with permanent CDN URLs in the schedule payload
3. **Sends the payload** to the Rust scheduler — which can always reach the assets at dispatch time

> **Why this matters**: Previously, if a post was scheduled for tomorrow and your local file was moved or deleted, the scheduler would fail silently. Now the asset lives in the cloud from the moment you schedule.

---

### 🔐 Security, Privacy & Your API Keys

Saved extension credentials use VS Code `SecretStorage`. The webviews receive boolean saved status, not credential values. A saved key is displayed as **🔒 Key Saved & Active** with no masked value; choose **Change saved key** to open an empty replacement field. This status means a local key is configured, rather than a guarantee that its remote permissions are still valid.

- Empty replacement fields keep the saved value. Publishing and AI generation read keys on the extension host.
- Saved API lists expose configuration metadata only. Loading a saved configuration activates its credentials on the host.
- **Clear All Credentials** removes local platform, AI, GitHub and DotShare account secrets, saved configurations and cloud consent. It does not delete credentials previously uploaded to a server.
- Legacy Saved APIs in ordinary extension state are moved to SecretStorage; stale plaintext copies are removed after a secure copy exists.
- Credential values and OAuth callback queries are excluded from logs, with redaction for known secrets and common token formats.

#### Cloud Scheduling

The extension asks for explicit consent before syncing Telegram, Dev.to, Bluesky, LinkedIn and X credentials to the DotSuite server. This applies to manual credentials and OAuth callback sync. The credential upload requires HTTPS and a signed-in DotShare account. Consent is remembered locally until credentials are cleared.

Cloud scheduling requires the server to receive and use your platform credentials. Server-side encryption, access controls and retention must be verified in the separately maintained [dotsuite-core](https://github.com/kareem2099/dotsuite-core) deployment; local SecretStorage does not establish those guarantees. Revoke cloud copies separately through the DotSuite Dashboard.

#### CLI Storage

CLI Telegram and LinkedIn credentials use the native OS credential store through `@napi-rs/keyring`; `~/.dotshare/config.json` stores preferences only. Legacy plaintext credentials are moved before the file is rewritten. If the OS store fails, migration retains the original file for retry and new credentials are never saved to plaintext. On headless systems, configure an available system credential store first.

---

### ⏰ Automation & Scheduling

Never miss your posting rhythm:

```bash
# Schedule posts for maximum engagement
dotshare schedule --time "09:00" --platforms "linkedin,twitter"

# Automated cross-posting
dotshare "New release v3.0.0 🎉" --all-platforms
```

### 🌐 Multilingual Support

- 🇬🇧 English
- 🇸🇦 Arabic
- 🇷🇺 Russian

### 📊 Analytics Dashboard

Track your reach and engagement across platforms:
- Post performance metrics per platform
- Per-platform success rates and share counts
- Post history with AI model and timestamp

### #️⃣ Smart Hashtag Engine

Context-aware hashtags generated automatically:
- Reads your project name, type, and `package.json` keywords
- Scans recent git commit messages for intent
- Detects tech terms and frameworks in generated post
- Platform-aware: hashtags **skipped** for Discord
- Add permanent tags via **VS Code Settings → DotShare → Custom Hashtags**

---

## 🚀 Quick Start

### For VS Code Users

**Step 1: Install the Extension**

```bash
# Via VS Code Marketplace
1. Press Ctrl+Shift+X (Cmd+Shift+X on Mac)
2. Search "DotShare"
3. Click Install

# Or via command line
code --install-extension freerave.dotshare
```

**Step 2: Configure Your Platforms**

```bash
# Open Command Palette (Ctrl+Shift+P)
> DotShare: Open Platform Hub

# Navigate to Settings tab
# Add credentials for your platforms
```

**Step 3: Share Your First Post**

```bash
# Click a platform icon in the sidebar
# Compose your post or Generate with AI
# Hit Share!
```

### For CLI Power Users

**Step 1: Install Globally**

```bash
npm install -g dotshare-cli
```

**Step 2: Initialize & Authenticate**

```bash
dotshare init
dotshare login linkedin
dotshare login telegram
dotshare whoami
```

**Step 3: Start Posting**

```bash
# Simple text post
dotshare "🚀 Just deployed v3.0 with Dev.to support!"

# With media
dotshare "Check out our new UI! 🎨" --media ./screenshot.png

# Specific platforms
dotshare "Backend optimization complete ⚡" --platforms linkedin,twitter
```

---

## 📖 Documentation

### Getting API Tokens

<details>
<summary><b>👨‍💻 Dev.to API Key</b></summary>

1. Go to [Dev.to Settings → Extensions](https://dev.to/settings/extensions)
2. Under "DEV API Keys", generate a new key
3. Add to DotShare Settings

**Note**: Dev.to does not support image file uploads via API. Use publicly hosted image URLs (Cloudinary, GitHub, Imgur) in your markdown or as cover image.
</details>

<details>
<summary><b>🔗 LinkedIn Access Token</b></summary>

1. Create an app at [LinkedIn Developers](https://www.linkedin.com/developers/)
2. Request access to **Sign In with LinkedIn**
3. Generate token with `w_member_social` scope
4. Add to DotShare settings
</details>

<details>
<summary><b>📱 Telegram Bot Setup</b></summary>

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Create new bot with `/newbot`
3. Copy the bot token
4. Get your chat ID from [@FreeID](https://github.com/kareem2099/FreeID)
5. Add both to DotShare settings
</details>

<details>
<summary><b>𝕏 X (Twitter) Authentication</b></summary>

1. Apply for developer access at [Twitter Developers](https://developer.twitter.com/)
2. Create an app with Read & Write permissions
3. Generate OAuth 2.0 access token
4. Add to DotShare settings
</details>



## 🤝 Contributing

We love contributions! Whether it's adding new platforms, fixing bugs, or improving documentation, we welcome your help.
👉 **[Read our Contributing Guidelines](CONTRIBUTING.md)** to get started.

---

## 📈 Roadmap

Our development roadmap and feature tracking has been moved to a dedicated file. 
👉 **[View the full Roadmap here](ROADMAP.md)**

---

## 📜 Changelog

A detailed history of all changes, features, and bug fixes can be found in our CHANGELOG file.
👉 **[Read the Full Changelog here](CHANGELOG.md)**

---

## 💝 Support the Project

DotShare is free and open source. Your support keeps it alive and helps fund the Cloud Scheduling Server.

<div align="center">

<a href="https://www.buymeacoffee.com/freerave" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;">
</a>

<a href="https://github.com/sponsors/kareem2099">
  <img src="https://img.shields.io/badge/Sponsor%20on-GitHub-pink?style=for-the-badge&logo=github-sponsors" height="60">
</a>

<a href="https://paypal.me/freerave1">
  <img src="https://img.shields.io/badge/Donate%20via-PayPal-blue?style=for-the-badge&logo=paypal" height="60">
</a>

</div>

If you can't donate, you can still help:
- ⭐ [Star the repository](https://github.com/kareem2099/DotShare)
- 📢 Share with your network
- 🐛 Report bugs and suggest features

---

## 👏 Acknowledgments

- [VS Code Extension API](https://code.visualstudio.com/api) — Microsoft
- [Gemini AI](https://deepmind.google/technologies/gemini/) — Google DeepMind
- [Anthropic Claude](https://www.anthropic.com/) — Anthropic
- [Dev.to / Forem API](https://developers.forem.com/api)

- All our [contributors](https://github.com/kareem2099/DotShare/graphs/contributors) ❤️

---

## 📄 License

DotShare is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

<div align="center">

**Made with ❤️ by developers, for developers**

[⬆ Back to Top](#-dotshare)

</div>
