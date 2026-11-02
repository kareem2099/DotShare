<div align="center">

<img src="https://raw.githubusercontent.com/kareem2099/DotShare/master/assets/icons/icon.png" alt="DotShare logo" width="96" height="96">

# DotShare — Share Code Updates to LinkedIn, X, Bluesky, Mastodon & Dev.to from VS Code

**Write, generate with AI, and publish developer updates, threads, code snapshots and Dev.to articles without leaving your editor.**

[![VS Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/freerave.dotshare?label=VS%20Marketplace&logo=visualstudiocode&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=freerave.dotshare)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/freerave.dotshare?color=10b981)](https://marketplace.visualstudio.com/items?itemName=freerave.dotshare)
[![Open VSX](https://img.shields.io/open-vsx/v/freerave/dotshare?label=Open%20VSX&color=a60ee5)](https://open-vsx.org/extension/freerave/dotshare)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/kareem2099/DotShare/blob/master/LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/kareem2099/DotShare?style=flat&logo=github)](https://github.com/kareem2099/DotShare)

[Install](#-install) · [Features](#-features) · [Platforms](#-supported-platforms) · [Pricing](#-free-vs-dotsuite-plans) · [Setup guides](#-platform-setup-guides) · [FAQ](#-faq) · [Website](https://dotsuite.dev/en/product/dotshare)

</div>

---

**DotShare** is a free, open-source **VS Code extension for building in public**. It turns your commits, changelog and code into posts for **LinkedIn, X (Twitter), Bluesky, Mastodon, Telegram, Discord and Dev.to**, then publishes them directly from the editor. Generate drafts with **Gemini, OpenAI, Claude, DeepSeek or Grok**, build threads, attach images, capture **CodeSnap** code screenshots, create **GitHub Gists**, and schedule posts through **[DotSuite](https://dotsuite.dev)** cloud.

> Part of **[DotSuite](https://dotsuite.dev)**, a family of developer tools for VS Code, Next.js and Python.

---

## 🆕 What's New in 3.5.3 — Mastodon

- **🐘 Mastodon support**: publish posts, threads and up to 4 images to **any Mastodon instance**. DotShare reads each server's character and media limits, and splits long posts into threads automatically.
- **☁️ Mastodon cloud scheduling**: schedule Mastodon posts through DotSuite, with a separate consent prompt before your token is synced.
- **🖼️ Thread image fix**: images attached to thread posts on X, Bluesky and Mastodon are now always published, or the post fails with a clear error instead of going out without them.
- **🔐 Security updates**: patched dependency vulnerabilities and aligned plan limits with DotSuite.

👉 [Full changelog](https://github.com/kareem2099/DotShare/blob/master/CHANGELOG.md)

---

## 📦 Install

**From VS Code:** open Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`), search **DotShare**, and click **Install**.

**From the command line:**

```bash
code --install-extension freerave.dotshare
```

Also available on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=freerave.dotshare) and [Open VSX](https://open-vsx.org/extension/freerave/dotshare) (VSCodium, Cursor, Windsurf and other compatible editors). Requires VS Code **1.90** or later.

### Quick start

1. Click the **DotShare** icon in the Activity Bar.
2. On a platform card, add your credentials (see the [setup guides](#-platform-setup-guides)).
3. Click **✨ Create Post**, write or generate your post, and press **Share** (or `Ctrl+Enter`).

---

## ✨ Features

### 🤖 AI release copilot
- Generate posts and full articles with **Google Gemini, OpenAI, Anthropic Claude, DeepSeek or xAI Grok**, using your own API key. Models are discovered live from each provider.
- DotShare reads your **CHANGELOG, README, package manifest, Git commits and diffs** so posts describe what actually changed.
- Five writing tones: Professional, Build in Public, Technical Deep-Dive, Quick TL;DR, and Full Markdown Article.
- Writes in **English or Arabic**. Run **DotShare: 🧠 Inspect AI Release Context** to see exactly what the AI receives.
- Known secret patterns (API keys, tokens, private keys) are redacted from code excerpts before they reach an AI provider.

### 🧵 Thread composer
- Build threads for **X, Bluesky and Mastodon**, with a character counter per post and up to **4 images per post**.
- Long single posts are split into numbered threads automatically.
- **X Premium** mode for posts up to 25,000 characters.

### 📰 Dev.to publishing
- Generate technical articles with YAML frontmatter, or load the Markdown file open in your editor.
- Live sanitized preview with word count and reading time; publish as draft or public, with series support.

### 📸 CodeSnap
- Turn selected code into a polished image with 9+ themes (Dracula, Nord, Tokyo Night, GitHub, Catppuccin and more).
- Send the snapshot straight to the composer, or save it as PNG.

### 💻 GitHub Gists
- Create a public or secret Gist from a selection or a whole file, then share it in one click.

### 📊 Productivity
- **Drafts** for social posts, articles and Gists.
- **Analytics** for share counts and success rates per platform.
- **Smart hashtags** from your project, commits and tech stack (skipped where they don't help, such as Discord).
- **Saved API sets** to switch between accounts.
- Interface available in **English, Arabic and Russian**.

---

## 🌐 Supported Platforms

| Platform | Posts | Threads | Images | Cloud scheduling | Sign-in |
|---|:---:|:---:|:---:|:---:|---|
| 🔗 **LinkedIn** | ✅ | — | 1 | ✅ | OAuth or access token |
| 𝕏 **X (Twitter)** | ✅ | ✅ | 4 | ✅ | OAuth |
| 🦋 **Bluesky** | ✅ | ✅ | 4 | ✅ | Handle + app password |
| 🐘 **Mastodon** | ✅ | ✅ | 4 | ✅ | Instance URL + access token |
| 📱 **Telegram** | ✅ | — | 10 | ✅ | Bot token + chat ID |
| 💬 **Discord** | ✅ | — | 10 | — | Webhook URL |
| 👨‍💻 **Dev.to** | Articles | — | Cover image URL | ✅ | API key |
| ⚡ **GitHub Gist** | Snippets | — | — | — | GitHub sign-in |

---

## 💎 Free vs DotSuite Plans

Everything that runs inside VS Code with your own accounts and AI keys is **free and open source**. Paid plans add cloud services hosted by DotSuite.

| | **Free** | **Pro** | **Max** |
|---|:---:|:---:|:---:|
| Direct publishing to every platform | ✅ | ✅ | ✅ |
| AI generation with your own key | ✅ | ✅ | ✅ |
| Threads, drafts, Gists, analytics | ✅ | ✅ | ✅ |
| Cloud-scheduled posts per month | 100 | Unlimited | Unlimited |
| Scheduled posts with images per month | 10 | Unlimited | Unlimited |
| Scheduler precision | Hourly | Every 5 minutes | Exact time |
| CodeSnap without watermark, custom branding, 3× and JPG/WEBP export | — | ✅ | ✅ |
| Price | **$0** | **$15 / month** | **$30 / month** |

See current plans on the [DotShare page on DotSuite](https://dotsuite.dev/en/product/dotshare).

---

## 🔑 Platform Setup Guides

<details>
<summary><b>🐘 Mastodon</b></summary>

1. On your Mastodon server, open **Preferences → Development → New application** (for example `https://mastodon.social/settings/applications/new`).
2. Enter any name, keep the redirect URI as `urn:ietf:wg:oauth:2.0:oob`, and enable only **`write:statuses`** and **`write:media`**.
3. Save, open the application, and copy **Your access token**.
4. In DotShare's Mastodon card, enter your instance URL (such as `https://mastodon.social`) and the token.

Any instance works. The URL must use HTTPS, and the token is only ever sent to that server.
</details>

<details>
<summary><b>🦋 Bluesky</b></summary>

1. Go to [Bluesky → Settings → App passwords](https://bsky.app/settings/app-passwords) and create an app password (never use your main password).
2. Enter your handle (such as `yourname.bsky.social`) and the app password in DotShare.
</details>

<details>
<summary><b>𝕏 X (Twitter)</b></summary>

Click **Connect** on the X card and authorize DotShare in your browser. Tokens refresh automatically.
</details>

<details>
<summary><b>🔗 LinkedIn</b></summary>

Click **Connect** on the LinkedIn card to sign in with OAuth. You can also paste an access token with the `w_member_social` scope from [LinkedIn Developers](https://www.linkedin.com/developers/) under the advanced options.
</details>

<details>
<summary><b>📱 Telegram</b></summary>

1. Message [@BotFather](https://t.me/botfather), create a bot with `/newbot`, and copy its token.
2. Add the bot to your channel or group, then get the chat ID (for example with [@FreeID](https://github.com/kareem2099/FreeID)).
3. Enter both in DotShare.
</details>

<details>
<summary><b>💬 Discord</b></summary>

In your server, open **Channel settings → Integrations → Webhooks**, create a webhook, and paste its URL into DotShare.
</details>

<details>
<summary><b>👨‍💻 Dev.to</b></summary>

Generate a key under [Dev.to Settings → Extensions](https://dev.to/settings/extensions) and paste it into DotShare. Dev.to's API doesn't accept image uploads, so use publicly hosted image URLs in your article and cover image.
</details>

---

## ⌨️ DotShare CLI

Post to Telegram and LinkedIn from your terminal or CI. Requires Node.js 22.12+.

```bash
npm install -g dotshare-cli

dotshare init
dotshare login telegram
dotshare login linkedin
dotshare whoami

dotshare "🚀 Just shipped v3.5.3!"
dotshare "New UI 🎨" --media ./screenshot.png --platforms telegram,linkedin
```

CLI credentials are kept in your operating system's credential store via `@napi-rs/keyring`; `~/.dotshare/config.json` holds preferences only.

---

## 🔐 Security & Privacy

- **Your keys stay in VS Code SecretStorage.** Webviews only receive whether a key is saved, never its value, and saved keys show as **🔒 Key Saved & Active**.
- **Direct publishing** sends each credential only to its own platform. AI prompts go only to the provider you choose.
- **Cloud scheduling is opt-in.** Before any credential is synced to DotSuite, DotShare asks for explicit consent (Mastodon has its own prompt). Sync requires HTTPS and a signed-in DotSuite account.
- **Logs are redacted**: credential values and OAuth callback queries are excluded, and known secret formats are masked.
- **Clear All Credentials** removes local platform, AI, GitHub and DotSuite secrets and cloud consent. Copies already synced to DotSuite are revoked from the DotSuite Dashboard.

Server-side handling is implemented in the separately maintained DotSuite backend; local SecretStorage does not protect copies held there.

---

## ❓ FAQ

**Is DotShare free?**
Yes. The extension is open source under Apache 2.0, and direct publishing with your own accounts and AI keys is free. Only DotSuite cloud services, such as higher scheduling limits, are paid.

**Do I need my own server to post to Mastodon?**
No. You only need an account on any Mastodon instance and an access token. DotShare talks to your instance directly.

**Which AI models can I use?**
Any text model your key can access from Google Gemini, OpenAI, Anthropic Claude, DeepSeek or xAI Grok. DotShare lists them live from each provider.

**Can I schedule posts for later?**
Yes, with a free DotSuite account. Scheduled posts run on DotSuite servers, so your computer doesn't need to stay on.

**Does DotShare work in VSCodium, Cursor or Windsurf?**
Yes, install it from [Open VSX](https://open-vsx.org/extension/freerave/dotshare).

**Where are my API keys stored?**
In VS Code's encrypted SecretStorage on your machine. See [Security & Privacy](#-security--privacy).

---

## 🤝 Contributing

Bug reports, platform ideas and pull requests are welcome. Read the [contributing guide](https://github.com/kareem2099/DotShare/blob/master/CONTRIBUTING.md) to get started, and see the [roadmap](https://github.com/kareem2099/DotShare/blob/master/ROADMAP.md) for what's planned.

## 💝 Support the Project

If DotShare saves you time, you can help keep it alive:

<div align="center">

<a href="https://www.buymeacoffee.com/freerave"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee"></a>
<a href="https://github.com/sponsors/kareem2099"><img src="https://img.shields.io/badge/Sponsor%20on-GitHub-ea4aaa?style=for-the-badge&logo=github-sponsors" alt="Sponsor on GitHub"></a>
<a href="https://paypal.me/freerave1"><img src="https://img.shields.io/badge/Donate-PayPal-00457C?style=for-the-badge&logo=paypal" alt="Donate via PayPal"></a>

</div>

Or ⭐ [star the repository](https://github.com/kareem2099/DotShare), share DotShare with your network, and [report issues](https://github.com/kareem2099/DotShare/issues).

## 📄 License

DotShare is licensed under the [Apache License 2.0](https://github.com/kareem2099/DotShare/blob/master/LICENSE).

<div align="center">

**Made with ❤️ by [FreeRave](https://dotsuite.dev) for developers who build in public.**

</div>
