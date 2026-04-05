# What's New in DotShare v3.0.1

*"The Publishing Suite & UX Polish"*

---

## 📰 Dev.to & Medium Integration — Update

Publish long-form articles directly from VS Code.

- **Medium API Notice** — Added instructions for manual API activation if missing from settings.
- **Improved Labels** — Clarified token terminology for Medium integration.
- **Load Current File** — reads your active `.md` file from the editor
- **YAML Frontmatter Parser** — auto-fills title, tags, canonical URL, cover image, series
- **Draft vs. Publish toggle** — per-platform, independently
- **Dev.to**: title, tags (max 4), series, canonical URL, description
- **Medium**: markdown format, public / draft / unlisted status

---

## 🧭 Platform-First Navigation — New!

The sidebar now shows platform icons as primary navigation. Click any platform and the workspace switches automatically:

- **X / Bluesky** → Thread Composer
- **LinkedIn, Telegram, Facebook, Discord, Reddit** → Social Composer
- **Dev.to, Medium** → Article Publisher

---

## 🧵 Thread Composer + X Premium — New!

- Build threads post-by-post with per-post character counters
- Media attachment per post
- **X Premium toggle** — switches character limit from 280 to **25,000 chars**
- Supports X and Bluesky

---

## ⚙️ Platform Config System — New!

New `platform-config.ts` shared between the extension and WebView — single source of truth for all platform rules (character limits, thread support, workspace routing, auth type, and more).

---

## 🔧 Bug Fixes

- **Reddit subreddit** was hardcoded to `'test'` — now reads from Settings
- **PostHandler** was reading post content from history — now reads from message correctly
- **Dev.to image upload** removed — API doesn't support file uploads, URLs only
- **Twitter char counter** — URLs now always count as 23 chars (was incorrect)
- **Discord** now shows a clear "coming soon" error instead of silently doing nothing
- **Thread validation** now uses `supportsThreads` from platform-config instead of hardcoded check

---

## 📦 Also in This Release

- `types.ts` updated with v3.0 Blog/Publisher types (`BlogPost`, `FrontMatter`, `PublishTarget`, etc.)
- `CredentialProvider` refactored — added `getRedditSubreddit()` method
- `PostExecutor` decoupled from VS Code UI for clean background execution
- `SECURITY.md`, `CODE_OF_CONDUCT.md`, and GitHub issue templates added

---

*Thank you for using DotShare! Questions or feedback? [Open an issue →](https://github.com/kareem2099/DotShare/issues)*