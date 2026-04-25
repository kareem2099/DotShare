# What's New in DotShare

---

## 🔧 v3.2.6 — "Patch"

*Released: April 25, 2026*

### 🐛 Bug Fixes

- **Read Markdown File — Fields Were Empty**: Opening a `.md` file with "Read Current Markdown File" now correctly populates Title, Tags, Description, and Body. A silent reset was wiping all fields immediately after loading.
- **Remote Drafts — Showing Published Articles**: The "Fetch Remote Drafts" button now shows **only unpublished drafts** from Dev.to, not all articles.
- **Blog Publish — Error + Success Toast at the Same Time**: Validation failures now correctly block publishing without triggering a false success notification.
- **Publish Button Stuck After Validation Error**: Fixed the "⏳ Publishing…" button getting stuck when validation fails. Article content is now preserved after errors so you don't lose your work.

---

### ✨ New — Pre-Publish Validator

DotShare now validates your article **before** sending it to Dev.to or Medium:

- ❌ **Blocks publish**: missing title, empty body, boilerplate placeholder still in body
- ⚠️ **Warns but allows**: short article (< 50 words), missing SEO description, no tags
- 🔧 **Auto-fixes silently**: duplicate tags removed, invalid characters stripped, tags trimmed to platform limits (4 for Dev.to, 5 for Medium)

After a **successful** publish, the article URL appears in the success notification and your content stays visible — no more blank composer after publishing.

---

## 📝 v3.2.5 — "Nexus"

*Released: April 24, 2026*

### 📝 Universal Drafts for All Platforms

The drafts system you loved for blogging is now available for **every platform** in DotShare.

- **Social Drafts** — Save your clever tweets, LinkedIn posts, or Telegram updates as drafts and finish them later.
- **Cross-Platform Resumption** — Start a draft for X, switch to Bluesky, and your drafts remain safe and easily accessible.
- **One-Click Loading** — Just like blogging drafts, one click loads your saved content back into the composer.

---

### 🧹 Codebase Cleanup & Performance

We've "polished the gears" to make DotShare faster and lighter than ever.

- **Leaner Webview** — Removed hundreds of lines of legacy CSS and unused components.
- **Faster Startup** — Optimized state loading for a near-instant experience when opening the Platform Hub.
- **Cleaner UI** — Refined the composer layout to be even more focused and distraction-free.

---

*Thank you for using DotShare! Questions or feedback? [Open an issue →](https://github.com/kareem2099/DotShare/issues)*