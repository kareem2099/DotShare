# What's New in DotShare

---

## � v3.4.0 — "CodeSnap"

*Released: May 31, 2026*

### 📸 Create Beautiful Code Snapshots Right from Your Editor

Meet **CodeSnap** — your new favorite way to share code visually. Highlight any code in VS Code, hit the CodeSnap command, and watch your code transform into a gorgeous, ready-to-share image.

#### Key Features

**🎨 9+ Professional Themes**
- Atom One Dark (default), GitHub Dark, Monokai, Dracula, Nord, VS2015, Tokyo Night, GitHub Light, Catppuccin Mocha
- Each theme includes authentic color palettes for all syntax elements
- Real-time preview as you switch themes

**🎛️ Full Customization**
- **Font Size**: Adjust from 8px to 24px to make code readable at any scale
- **Padding**: Control spacing around your code (4px–48px)
- **Line Numbers**: Toggle on/off to show or hide line numbers
- **Window Chrome**: Add a macOS-style window frame around your snapshot
- **DotShare Watermark**: Include or exclude the DotShare badge
- **Background Color**: Custom background via color picker

**🚀 One-Click Platform Sharing**
1. Customize your snapshot
2. Click "🚀 Share"
3. Select a platform from the QuickPick (LinkedIn, X, BlueSky, Telegram, Facebook, Discord, Reddit, Dev.to, Medium)
4. Composer opens automatically with your snapshot attached
5. Add caption, adjust settings, and post directly

**💾 Local Save**
- Download your CodeSnap as PNG to your computer for use anywhere
- Native macOS/Windows/Linux save dialogs

#### Smart Code Capture
- **Selection**: If you've highlighted code, CodeSnap captures exactly that
- **Full File**: If nothing is selected, CodeSnap captures your entire file
- **40+ Languages**: Full syntax highlighting support for TypeScript, JavaScript, Python, Rust, Go, Java, C++, C#, HTML, CSS, and more
- **Smart Indentation**: Automatically strips common leading whitespace so deep nesting doesn't waste space
- **Tab Normalization**: Tabs are converted to spaces for proper rendering

#### Integration with the Composer
- **Seamless Workflow**: CodeSnap panel stores pending images until the Composer is ready, then automatically attaches them
- **Two-Way**: CodeSnap has a "Share" button; Composer has an "📸 Add CodeSnap" button
- **Race-Condition Safe**: Uses webviewReady handshake instead of timeouts

#### Zero Dependencies for Rendering
- No native image libraries—all rendering happens in the webview via HTML Canvas
- Offline-first: Highlight.js and theme CSS are served locally from the `vendor/` directory
- No external API calls during rendering

---

## �🔐 v3.3.5 — "Open Privacy Hotfix"

*Released: May 27, 2026*

### 🛠️ Local Publishing Restored
We apologize for a bug introduced in v3.3.4 where the "Share Thread" and "Publish Article" buttons were incorrectly disabled if you weren't logged into DotSuite Cloud. 

**DotShare remains a privacy-first tool**: standard local publishing via your own manual API keys is fully supported and does **not** require a DotSuite Cloud account. The UI has been updated to explicitly state that the DotSuite Cloud login is `OPTIONAL` and is only required for Cloud Scheduling.

---

## 🌐 v3.3.4 — "Unified Cloud Auth"

*Released: May 27, 2026*

### ⚡ Seamless Browser OAuth
We've completely overhauled the authentication experience. The old, intrusive manual API key popup is gone. It's been replaced by a sleek, unified "DotSuite Cloud" section directly inside the sidebar. Connect securely via your browser and watch the VS Code sidebar instantly update in real-time. No copy-pasting required.

### 💼 Rich Profile Insights
Once connected, your cloud card now displays your active tier (Pro/Max), used quotas, and profile details straight from the backend.

---

## 🔐 v3.3.1 — "Security Patch"

*Released: May 24, 2026*

### 🛡️ Explicit Security Consent Before Cloud Key Sync

DotShare now displays a **mandatory one-time consent dialog** the first time you open Cloud Scheduling. Before any of your platform API keys ever leave your machine, you will see:

> *"To enable Cloud Scheduling, DotShare needs to securely sync your platform API keys to the DotSuite server.*
> *🔐 Your keys are encrypted with AES-256-GCM before being stored.*
> *🗑️ You can revoke access at any time from the DotSuite Dashboard.*
> *🚫 Your keys are NEVER shared with third parties or used beyond scheduling."*

- **"I Agree"** → keys are synced and consent is saved locally. You won't be asked again.
- **"Cancel"** → nothing is uploaded. Cloud scheduling remains disabled until you agree.

### 🔍 Security & Privacy Documentation

A new **Security, Privacy & Your API Keys** section has been added to the README covering:

| Layer | Protection |
|---|---|
| In Transit | HTTPS/TLS end-to-end |
| At Rest | AES-256-GCM server-side encryption |
| Access Control | Keys scoped to your user ID only |
| Third Parties | Never shared or sold |

---

## 🚀 v3.3.0 — "Production Bridge"

*Released: May 24, 2026*

### ☁️ Live Production Backend

The DotSuite Core Rust backend is now deployed at **`dotsuite-core-production.up.railway.app`** — no more localhost! Cloud scheduling, media uploads, and OAuth connections all route to the live server.

### 🖼️ Cover Image Upload

Upload cover images directly from the blog composer to **Cloudflare R2** and get a permanent CDN URL auto-filled — without leaving VS Code.

### 🐛 Composer Wipe Bug Fixed

Uploading an image no longer wipes your post title, tags, and content. The composer resets **only** after a successful publish, not after any status event.

### 📌 Centralized URL Management

All backend and frontend URLs now live in `src/constants.ts`. Change one line to switch between environments.
