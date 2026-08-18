# What's New in DotShare

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