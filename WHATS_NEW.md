# What's New in DotShare v2.4.0

*"OAuth Suite & Smart Hashtags"*

---

## One-Click OAuth — No More Pasting Tokens!

**Connect your platforms with a single browser click**

- Click **Connect** on any platform card → your browser opens automatically
- You approve the permissions → the extension receives your token silently
- Done. No tokens to copy, no forms to fill.

**Supported platforms:**
- LinkedIn
- X (Twitter)
- Facebook
- Reddit

All secrets live exclusively on our auth server — **zero credentials stored in your extension**.

---

## Smart Hashtag Engine

**Context-aware hashtags generated automatically on every post**

The new `HashtagService` analyzes **7 sources** before picking the best 5 tags:

| Source | Example |
|--------|---------|
| Your custom tags (Settings) | `#MyProject` |
| Project name (package.json) | `#DotShare` |
| Project type & keywords | `#JavaScript #NodeJS` |
| Recent git commits | `#Feature #Fix` |
| Frameworks in post text | `#React #Express` |
| Tech terms detected | `#Docker #Api` |
| Trending topics | `#OpenSource #AI` |

**Platform-aware:** Reddit and Discord get **no hashtags** (they don't use them as functional tags).

**Add your own permanent tags:**
`VS Code Settings → DotShare → Custom Hashtags`

---

## Claude AI — 4th AI Provider Added

Anthropic Claude joins Gemini, OpenAI, and xAI Grok as a supported AI provider for post generation.

---

## Cleaner Platform UI

- **Connected ✓ badges** — green state shown when a platform is authenticated
- **Disconnect buttons** — clear tokens without digging into settings
- **Advanced accordion** — manual token fields collapsed by default, shown only when needed
- **Direct-to-API posting** — all 4 OAuth platforms now post directly to their own APIs, no middleman

---

## Bug Fixes

- **Reddit hashtag spam fixed** — posts to Reddit no longer end with `#Programming #Technology` clutter
- **Correct project name hashtag** — `#projectname` now always comes from `package.json → name` or the workspace folder, never from random keywords like `#test` or `#lint`
- **Smaller extension bundle** — `.vsix` size reduced by excluding test and source files from the package

---

## New Settings (visible in VS Code Settings UI)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `dotshare.customHashtags` | string[] | `[]` | Your own hashtags always included in every post |
| `dotshare.defaultPlatform` | enum | `twitter` | Platform used to tailor hashtag suggestions |

---

## Also in v2.3.0 (if you're upgrading from v2.2.0)

- **Analytics Dashboard** — track post history, per-platform success rates, and share counts
- **Smart hashtags** first introduced — `HashtagService` with relevance scoring and deduplication
- **Centralized context builder** — all AI providers share one `buildProjectContext()` function
- **Hallucination-resistant prompts** — AI only mentions technologies actually present in your project files

---

*Thank you for using DotShare! Questions or feedback? [Open an issue →](https://github.com/kareem2099/DotShare/issues)*
