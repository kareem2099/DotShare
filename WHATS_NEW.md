# What's New in DotShare

---

## 🛡️ v3.2.3 — "Aegis"

*Released: April 16, 2026*

### 🛡️ Aegis: Proactive Token Intelligence

DotShare now shields you from silent authentication failures with the new **Aegis** protocol integration.

- **Visual Health Badges** — Look for the new status badges on each platform card. A 🛡️ Stable (green) badge means your connection is healthy, while a ⚠️ Warning (orange) badge indicates your token is nearing expiry.
- **Smart Refresh Buttons** — When a platform is nearing expiry (like Facebook’s 60-day window or a scheduled X rotation), a **"Refresh Connection"** button will appear. Renew your session with one click before it breaks.
- **Absolute Expiry Tracking** — Hover over any platform badge to see the exact date and time your connection will expire.
- **X (Twitter) Rotation Guard** — Improved detection for X rotation failures. The extension will now proactively warn you if a background refresh fails, preventing mysterious post errors.

---

## 🆕 v3.2.0 — "The Media Expansion" (2026-04-12)

*Released: April 2026*

### 🖼️ Multi-Image Media Grid

The biggest UI update yet — you can now attach **up to 4 images per post**, just like Twitter/X and Bluesky natively support.

- **Dynamic Thumbnail Grid** — Images appear as a live CSS-grid preview inside the composer the moment you select them. No more guessing what you're posting.
- **Individual Remove Buttons** — Each thumbnail has its own ✕ button to remove it without clearing all your selections.
- **"Remove All" Bulk Action** — One click to clear the entire media selection from the post composer.
- **Real-time State Sync** — The `activeMediaPaths` array is the single source of truth; the grid always reflects exactly what will be sent.
- **`renderMainMediaGrid()`** — A new central re-render function that rebuilds the grid from state on every change, ensuring UI and data are always in sync.

---

### 📤 True Multi-Image Upload on Bluesky & X

Both platforms now correctly handle multi-image posts instead of sending only the first image.

**Bluesky (`bluesky.ts`)**
- Fixed the `embed` builder to **upload all images as Blobs** (up to 4), collect their `ref` objects, and attach them as a proper `app.bsky.embed.images` array in a single post request.
- Previously only `media[0]` was used — now the full array is iterated.

**X / Twitter (`x.ts`)**
- Updated the media upload flow to call `uploadMedia()` for **each image sequentially**, then pass all resulting `media_id` values together in the final tweet payload.
- This enables proper multi-image tweets matching the native X experience.

---

### 🧵 Thread Multi-Image Support

Each thread post in the Threads Composer now independently supports up to 4 images:

- Thread-level `mediaFilePaths[]` arrays are tracked separately per post.
- The `wireThreadPostEvents()` function manages per-post file inputs and preview state.
- The `shareThread` payload correctly serializes each post's media for the backend.

---

### ⚠️ Smart File Size Warning

- Files over **2 MB** now trigger an inline toast warning: *"This file will be automatically optimized for Bluesky."*
- The warning fires at selection time (before upload) so users are informed upfront — no surprises.
- Compression itself happens **Just-In-Time on the backend** (`MediaService.ts`) at share time, preserving quality as long as possible and keeping the frontend fast.

---

### 🔗 Secure Webview URI Thumbnails

- `MessageHandler.ts` now converts local file system paths into **`vscode.Uri` webview-safe URIs** using `webview.asWebviewUri()`.
- The frontend receives a proper `vscode-resource://` URI alongside the raw `mediaPath`, enabling real `<img src>` thumbnail previews that work within VS Code's sandboxed webview CSP.

---

### 🧹 Bug Fixes & Cleanup

- Fixed `activeMediaPath` → `activeMediaPaths` typo (TS error `2552`) that caused the share payload to send an undefined variable.
- Media state (`activeMediaPaths`) is correctly reset to `[]` after a successful post or when the user clears the composer.
- Thread post removal (`data-remove-index`) now correctly splices the `threadPosts` array and re-indexes the DOM to prevent stale index references.

---

## v3.1.0 — "The Polish Pass"

*Released: Early 2026*

### ✨ Professional UI & Feedback

- **New Toast System** — Beautiful notifications with progress bars and auto-dismiss.
- **Loading States** — Buttons now show spinners while performing actions (sharing, generating AI, reading files).
- **Onboarding Banner** — A helpful guide for new users to get started with settings.
- **Improved Empty States** — Clearer instructions and quick-action buttons when there's no history or analytics.

### ⌨️ Productivity Keyboard Shortcuts

- **`Ctrl + Enter`** — Instantly share your post/thread.
- **`Ctrl + L`** — Load the current Markdown file into the Article Publisher.
- **Shortcut Hints** — Visual badges in the UI to help you learn the shortcuts.

### 📱 Responsive & Native Design

- **Dynamic Layouts** — The UI now adapts gracefully to narrow sidebars (down to 280px).
- **Theme Sync** — Enhanced support for VS Code light/dark and high-contrast themes.
- **Native Tokens** — Deeper integration with VS Code's design system for a seamless look.

### 🔧 Polish & Fixes

- **Error Boundaries** — Catching and displaying errors gracefully instead of failing silently.
- **Unified Messaging** — Standardized communication between the editor and the UI.
- **Performance** — Removed redundant re-renders for a snappier experience.

---

*Thank you for using DotShare! Questions or feedback? [Open an issue →](https://github.com/kareem2099/DotShare/issues)*