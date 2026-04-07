<div align="center">

# 🚀 DotShare

### *Share Your Code Journey, Amplify Your Voice*

[![Version](https://img.shields.io/badge/version-3.1.0-blue.svg)](https://github.com/kareem2099/DotShare)
![Codename](https://img.shields.io/badge/codename-The_Polish_Pass-ffcc00?style=flat-square&labelColor=0f0f0f)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.74%2B-007ACC?logo=visual-studio-code)](https://code.visualstudio.com/)
[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)](https://nodejs.org/)
<a href="https://www.buymeacoffee.com/freerave"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=flat&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee"></a>

**Transform your development updates into compelling social media content—right from your IDE.**

[Installation](#-installation) • [Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Support](#-support)

</div>

---

## 🎯 Why DotShare?

Building in public shouldn't be hard. DotShare bridges the gap between your code editor and your audience, letting you share achievements, updates, and insights across **9 social and blogging platforms** with AI-powered assistance—all without leaving VS Code.

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
|----------|------|----------|--------|
| 🔗 **LinkedIn** | Social | Profile posts, rich media | ✅ Full Support |
| 📱 **Telegram** | Social | Channels, groups, scheduling | ✅ Full Support |
| 𝕏 **X (Twitter)** | Social | Tweets, threads, X Premium (25K chars) | ✅ Full Support |
| 📘 **Facebook** | Social | Profiles, pages | ✅ Full Support |
| 💬 **Discord** | Social | Webhooks, embeds | ✅ Full Support |
| 🟠 **Reddit** | Social | Subreddits, profiles (r/, u/) | ✅ Full Support |
| 🦋 **BlueSky** | Social | Threads, facets, media | ✅ Full Support |
| 👨‍💻 **Dev.to** | Blog | Articles, series, drafts | ✅ **New in v3.0** |
| Ⓜ️ **Medium** | Blog | Articles, draft/publish/unlisted | ✅ **New in v3.0** |

### 📰 The Publishing Suite (v3.0 New!)

DotShare is no longer just a social poster — it's a full **publishing suite**:

- **Blog Publish Page**: Dedicated UI for long-form article publishing
- **Active File Reader**: Load your `.md` file directly from VS Code editor
- **YAML Frontmatter Parser**: Auto-fills title, tags, canonical URL from your markdown
- **Draft vs. Publish Toggle**: Per-platform — draft to Dev.to, publish live to Medium, simultaneously
- **Platform-First Navigation**: Click a platform icon → workspace adapts automatically

### 🧵 Thread Composer

Build and share threads natively:
- Multi-post thread builder for X and Bluesky
- Per-post character counters with platform limits
- Media attachment per post
- X Premium mode (25,000 chars)

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
- Platform-aware: hashtags **skipped** for Reddit and Discord
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
dotshare login reddit
dotshare whoami
```

**Step 3: Start Posting**

```bash
# Simple text post
dotshare "🚀 Just deployed v3.0 with Dev.to + Medium support!"

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
<summary><b>Ⓜ️ Medium Integration Token</b></summary>

1. Go to [Medium Settings](https://medium.com/me/settings)
2. Under "Integration tokens", generate a new token
3. Add to DotShare Settings

**Note**: Medium does not support local image uploads via API. Use publicly hosted URLs.
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

<details>
<summary><b>🟠 Reddit App Creation</b></summary>

1. Go to [Reddit Apps](https://www.reddit.com/prefs/apps)
2. Create app (select "script" type)
3. Note your client ID and secret
4. Use the DotShare UI to generate tokens automatically
5. Set your target subreddit in Settings
</details>

---

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
- [Medium API](https://github.com/Medium/medium-api-docs)
- All our [contributors](https://github.com/kareem2099/DotShare/graphs/contributors) ❤️

---

## 📄 License

DotShare is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

<div align="center">

**Made with ❤️ by developers, for developers**

[⬆ Back to Top](#-dotshare)

</div>