# What's New in DotShare

---

## v3.8.2 — Skilled Agents

*November 14, 2026*

- **Your agent writes better posts.** The DotShare skill now teaches your AI agent the right shape for each platform: a thread on X and Bluesky, one strong post on LinkedIn with the link in the first comment, CamelCase hashtags on Mastodon, and well-structured Dev.to articles.
- **Easy choices.** Options and previews come as small side-by-side tables, with a recommendation first, and your agent says plainly what it can't do.
- **It talks at your level.** Just the result if you want it done; what each step does if you ask how it works.
- **Installed for you.** `dotshare-agent setup` puts the skill where your agent loads it: Claude Code, Codex, Cursor and now Antigravity, or any agent with `--skills-dir`. Run setup again after upgrading, and `doctor` tells you if it's out of date.

---

## v3.8.1 — Fair X

*November 14, 2026*

- **You pay what X actually takes.** The most a post can cost is held while it's pending; once X's deduction shows up, that's what you're charged and the rest of the hold goes back to your budget. A reply with a link is charged $0.01, not $0.20.
- **Previews say what's held** and the least that will be left of this month's X budget.

---

## v3.8.0 — Fair X

*November 12, 2026*

- **X posts go through DotSuite.** X charges per post, so posts through DotShare's X app are published by DotSuite and counted against your plan's monthly X budget. Your X token stays on DotSuite.
- **See the cost before you post.** Agents show the exact X charge and what's left; the extension shows it after each post, and the DotSuite dashboard lists every charge.
- **Fair charges.** Prices follow X's list, and you're charged what X actually took when it can be measured.
- **Your own X app** still works with the CLI if you'd rather pay X directly.

---

## v3.7.0 — Connect

*November 12, 2026*

- **Sign in to LinkedIn and X on dotsuite.dev.** Same buttons, now hosted on DotSuite with the whole exchange on the server.
- **Agents sign in through the browser.** `dotshare-agent accounts connect` replaces copying tokens, and X sign-ins renew themselves.
- **Schedule a saved draft.** `schedule_draft` sends each platform its own version through DotSuite, images included.
- **Videos and GIFs from agents** on X, LinkedIn, Mastodon, Telegram and Discord, plus clickable Bluesky mentions.
- **See how a post is doing.** `get_post_stats` reads likes, reposts, replies and views.
- **One-command setup for Claude Code and Cursor.**

---

## v3.6.1 — Field Fixes

*November 9, 2026*

- **Bluesky links and hashtags are clickable.** Before, both showed as plain text and hashtags didn't appear in Bluesky search.
- **LinkedIn first comment.** Agents can post a link as the first comment instead of in the post body.
- **No more stuck locks.** A crash or power cut no longer leaves the MCP unable to save drafts or publish, and several MCP clients can share one library.
- **More forgiving setup.** Relative image paths resolve inside your media folders, `doctor` names the Mastodon `profile` scope it needs, and the extension activates even with `NODE_TLS_REJECT_UNAUTHORIZED=0` (credential requests are still refused).

---

## v3.6.0 — MCP & Publishing Library

*November 7, 2026*

- **DotShare for AI agents.** Connect Codex or another local MCP client to preview and publish through named accounts.
- **A shared Publishing Library.** Start a draft in your agent, review the same draft in VS Code, and publish its saved preview. Reuse templates and customize the version for each account.
- **Encrypted local records.** Drafts, custom templates and publication receipts use AES-256-GCM with a key stored in the OS credential store.
- **CLI 3.0.0.** Switch legacy relay scripts to direct publishing with named accounts. Existing local libraries can be migrated with `dotshare-agent security protect`.

---

## 🐘 v3.5.3 — "Mastodon"

*Released: November 2, 2026*

### Post to the Fediverse from VS Code

DotShare now publishes to **Mastodon**. Add your instance URL and an access token on the new Mastodon card, then share posts, threads and up to 4 images to any Mastodon server.

**Key Highlights**
- **Any instance**: DotShare reads your server's character and media limits and splits long posts into threads automatically.
- **Cloud scheduling**: schedule Mastodon posts through DotSuite. You'll be asked once before your Mastodon token is synced.
- **Thread images fixed**: images attached to thread posts on X, Bluesky and Mastodon are now published with the post. If an image can't be sent, the post fails with an error instead of going out without it.
- **Security updates**: patched 8 dependency vulnerabilities.

**Get a Mastodon token**: on your server, open *Preferences → Development → New application*, enable `write:statuses` and `write:media`, and copy *Your access token*.

---

## 📰 v3.5.2 — "Blog Pilot (Dev.to) & Workspace Context Search"

*Released: October 4, 2026*

### 🚀 Technical Blog Publishing & Intelligent Context Retrieval

DotShare 3.5.2 introduces full technical blog article generation tailored for Dev.to, strict pure Markdown output with automated YAML Frontmatter parsing, sanitized live preview rendering, and transforms workspace context extraction into an on-demand, query-driven code and Git search engine.

#### Release engine improvements

Choose the release version or tracked local changes explicitly. Articles now read a consistent commit snapshot, complete multiline changelog notes, release verification documents and verified source excerpts. Generated code must come from the supplied evidence. Detectable quality problems trigger at most one repair. Any remaining unverifiable code examples are omitted with a visible notice asking you to review the surrounding explanation; other unresolved errors and empty or incomplete provider responses are rejected. Quick social posts use the same context collector.

These checks improve grounding; prose claims and documented verification limits still need editorial review.

#### Key Highlights

**📰 Dev.to Technical Article Generation & Live Preview**
- **One-Click Technical Articles**: Generate structured, in-depth technical release articles from workspace context via the dedicated `Full Article (Dev.to)` tone.
- **Strict Pure Markdown Output**: Standard GitHub Flavored Markdown with clean code fences, language tags, and structured sections without HTML wrapper artifacts.
- **Smart Frontmatter Parsing**: Parses generated YAML metadata into `blog-title`, `blog-tags` (max 4 lowercase alphanumeric tags), and `blog-description`.
- **Strict URL Fidelity**: Automatically excludes repository URLs from `canonical_url` to protect article SEO and prevent link hallucinations.
- **Sanitized Live Markdown Preview**: Dual-mode segmented toggle (`✏️ Raw Markdown` / `👁️ Live Preview`) powered by `marked` and sanitized with `DOMPurify`.
- **Real-Time Reading Stats**: Word counter, character counter, and estimated reading time.

**🔍 Query-Driven Topic Search Engine**
- **Smart Git Search**: Queries your Git history with `git log --grep` (with `--all-match` precision) and pickaxe `git log -S` based on your custom topic or prompt to pull matching commits directly into context.
- **Verified Sources**: Supplies actual commit records; generated claims still require review.

**💻 Semantic Diff & Code Snippet Extraction**
- **Real Code Implementation Truth**: Reads function excerpts at the selected commit with real line ranges, including supporting lifecycle/helper methods where available.
- **Noise Filtration**: Automatically excludes lockfiles, minified bundles, binary files, and unit test suites from prompt context.

**📦 Dependency Diff & Ecosystem Tracking**
- **Working-Tree Dependency Tracking**: Uses the same release boundary for dependency changes in Node, Rust, Python and Go manifests, with explicit opt-in for local changes.
- **Ecosystem Diversity**: Full auto-detection for Rust (`Cargo.toml`), Python (`pyproject.toml`), Go (`go.mod`), and Node.js (`package.json`).

**📄 Active Editor Working Context**
- **Editor-to-Prompt Bridge**: Captures the active file path, language identifier, and selected code focus snippet directly from `vscode.window.activeTextEditor`.
- **Docs & Architecture Search**: Scans workspace markdown files (`docs/**`, `*.md`) for topic-relevant technical sections.

**🛡️ Security & Zero Shell Invocation**
- **Safe Git Execution**: Switched entirely to `execFile` with array arguments to prevent shell injection and Windows pathspec quoting errors.
- **Automated Secret Redaction**: Sanitizes API keys, GitHub tokens, Google API keys, AWS credentials, Bearer tokens, and private keys from code snippets before LLM transmission.
- **Single-Release Scope**: Enforces strict prompt rules keeping articles focused exclusively on current release changes.
- **UI Release Boundary Alerts**: Visual badges (`🏷️ tag → HEAD`, `⚠️ Uncommitted`, `⚠️ No tags`) and guidance banners keeping developers informed of their Git workspace state.

---
- **Real-Time Metrics**: Word count, character count, and estimated reading time update as you write or preview.

**🛡️ UI Hardening & HTML Escaping**
- **Injection Protection**: Comprehensive HTML escaping across thread composer textareas (`populateThreadFromParts`), media grid thumbnails, drafts, and scheduled post attributes.
- **Label Preservation**: Custom publish button text is preserved across all dynamic state updates.
- **Engine Modernization**: Upgraded VS Code engine target to `^1.90.0` with exact pinned `@types/vscode: 1.90.0`.

---

## 🔗 v3.5.1 — "Smart CTA Hub & Pure Dynamic AI Discovery"

*Released: August 18, 2026*

### 🚀 Smart Link Management & Zero-Hardcoding AI Engine

DotShare 3.5.1 brings persistent call-to-action link management, real-time multi-panel sync, and a completely modernized, dynamic AI discovery architecture across Google Gemini, OpenAI, Anthropic Claude, DeepSeek, and xAI Grok.

#### Key Highlights

**🔗 Smart User CTA & Links Hub**
- **Persistent Links**: Save and manage personal, project, and community links (`UserCtaLink`) with custom labels, URLs, and emojis.
- **Repository Detection**: Auto-detects your workspace git remote URL with a dedicated runtime toggle.
- **Multi-Panel Sync**: Real-time cross-tab synchronization (`userCtaLinksUpdated`) keeps X, LinkedIn, and BlueSky composer panels in harmony.
- **Strict URL Fidelity**: AI prompts enforce verbatim link output with zero hallucination and platform-specific URL safety budgeting (23-char X `t.co`, thread-end placement).

**✨ Pure Dynamic AI Model Discovery**
- **Live Provider Discovery**: Provider APIs are the sole source of truth for available models with zero static hardcoded fallbacks.
- **Official Modern SDKs**: Official `@google/genai` integration for Gemini, `responses.create` for OpenAI, `/v1/language-models` for xAI, and `thinking: { type: 'disabled' }` for DeepSeek.
- **SecretStorage Auto-Fetch**: Instant live model discovery on modal open using encrypted OS Keychain storage.
- **UI Security Hints**: Added Security Vault banner and dynamic status badges (`🔒 Key Saved & Active`).

---

## 🧠 v3.5.0 — "DotShare AI Core"

*Released: August 18, 2026*

### 🚀 Transform Your Codebase Updates into Compelling Social & Blog Posts

Meet **DotShare AI** — an intelligent release and update copilot built directly into your editor. Instead of writing release announcements from scratch, DotShare AI reads your real project files (`CHANGELOG.md`, `README.md`, Git commits, and diffs) and crafts authentic, tailored posts across multiple tones and languages.

#### Key Features

**📂 Automatic Codebase Context Extraction**
- Analyzes your latest release notes from `CHANGELOG.md` or `WHATS_NEW.md`
- Pulls project descriptions and tech stack from `README.md` and `package.json`
- Analyzes recent Git commits and precise diff statistics (`git diff --stat HEAD~1 HEAD`) in parallel

**🎭 5 Tailored Writing Tones**
- **👔 Professional & Formal**: Executive, business-centric, highlights impact and stability for LinkedIn.
- **🚀 Build in Public / Casual**: Friendly, energetic, sharing developer milestones on 𝕏 and BlueSky.
- **🧠 Technical Deep-Dive**: In-depth analysis of code architecture, refactoring, and benchmarks.
- **⚡ Quick TL;DR**: Clean, scannable bullet points for instant consumption.
- **📝 Full Markdown Article**: Generates **strict pure Markdown** with YAML Frontmatter for Dev.to.

**🌍 Bilingual Technical Writing**
- Native support for both developer-focused English and fluent technical Arabic (العربية الفصحى التقنية السلسة).

**🔍 Inspect Release Context Command**
- Run `DotShare: 🧠 Inspect AI Release Context` from the Command Palette (`Ctrl+Shift+P`) to see exactly what context was extracted from your project.

**⚡ Standardized AI Provider Engine**
- Seamless integration across Google Gemini, Anthropic Claude, OpenAI (with `max_completion_tokens` reasoning models support for `o1`/`o3`), and xAI Grok.
