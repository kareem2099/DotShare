<div align="center">

# 🚀 DotShare

### *Share Your Code Journey, Amplify Your Voice*

[![Version](https://img.shields.io/badge/version-3.4.1-blue.svg)](https://github.com/kareem2099/DotShare)
![Codename](https://img.shields.io/badge/codename-Cleanup-10b981?style=flat-square&labelColor=0f0f0f)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.74%2B-007ACC?logo=visual-studio-code)](https://code.visualstudio.com/)
[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)](https://nodejs.org/)
<a href="https://www.buymeacoffee.com/freerave"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=flat&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee"></a>

**Transform your development updates into compelling social media content—right from your IDE.**

[Installation](#-installation) • [Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Support](#-support)

</div>

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

- **Explicit Security Consent**: Before any platform API key is synced to the cloud, DotShare now shows a **mandatory one-time consent dialog** clearly explaining encryption (AES-256-GCM), data usage, and how to revoke access. Your keys never leave your machine without your approval.
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

- **Gemini AI**: Google's latest language model for nuanced technical content
- **OpenAI GPT**: Industry-leading conversational AI
- **xAI Grok**: Innovative AI with real-time awareness
- **Anthropic Claude**: Advanced reasoning and long-form content generation

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
| 💻 **GitHub Gist** | Code | Snippets, public/secret, auto-populate | ✅ **New in v3.3.2** |

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

DotShare takes your credentials seriously. Here is exactly what happens when you enable Cloud Scheduling:

#### One-Time Explicit Consent
Before any of your platform API keys are ever sent to the DotSuite server, the extension displays a **mandatory consent dialog** explaining:

- What data will be synced
- How it is protected
- How to revoke access

**You must click "I Agree" before any key ever leaves your machine.** This consent is stored locally and only asked once.

#### How Your Keys Are Protected

| Layer | Protection |
|---|---|
| **In Transit** | HTTPS/TLS — all traffic is encrypted end-to-end |
| **At Rest** | AES-256-GCM encryption with a server-side key |
| **Access Control** | Keys are scoped to your user ID; no other user can read them |
| **Third Parties** | Your keys are **never** shared with, sold to, or accessible by any third party |
| **Purpose Limitation** | Keys are used **exclusively** for post scheduling on your behalf |

#### Your Rights

- ✅ **Revoke at any time** — Visit the DotSuite Dashboard → Settings → Connected Accounts and remove any platform key instantly.
- ✅ **Delete your data** — Contact us to permanently purge all stored credentials from our servers.
- ✅ **Transparency** — The server-side encryption and storage code is open source at [dotsuite-core](https://github.com/kareem2099/dotsuite-core).

> **Note**: DotShare is open source. You can review exactly how credentials are handled in [`src/handlers/PostHandler.ts`](./src/handlers/PostHandler.ts) and [`src/services/SchedulerClient.ts`](./src/services/SchedulerClient.ts).

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