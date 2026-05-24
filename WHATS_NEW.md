# What's New in DotShare

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
