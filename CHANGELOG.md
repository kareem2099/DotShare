# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.8.2] - 2026-11-14 — "Skilled Agents"

VS Code extension 3.8.2 and `dotshare-cli` 3.2.2. A rewritten agent skill that setup installs for every agent, and Antigravity support.

### Added
- **A rewritten agent skill.** `skills/dotshare` now teaches agents to write strong, native posts for each platform: hooks, thread shape, LinkedIn's link in the first comment, hashtags, Dev.to article structure and a worked example of one source adapted everywhere. Agents compare choices and previews in small tables, talk at the user's level (plain results for most people, what each step does for those who ask), stay brief about costs and say what DotShare can't do (reply to others, edit or delete posts, publish a Dev.to draft). `SKILL.md` is a third shorter, with details in `references/` (writing, platforms, tools, scheduling, recovery, setup, CLI) loaded only when needed. A test checks its limit tables against the code.
- **`setup` installs the agent skill.** `dotshare-agent setup` now copies the `skills/dotshare` folder to where the client loads skills: `~/.claude/skills/dotshare` for Claude Code, `$CODEX_HOME/skills/dotshare` for Codex, `~/.cursor/skills/dotshare` for Cursor and `~/.gemini/config/skills/dotshare` for Antigravity. `--skills-dir <dir>` installs it for any other agent that reads `SKILL.md` skills (for example `~/.agents/skills`). Running setup again after an upgrade updates it. An older copy is replaced as a whole, in one rename. A different skill named `dotshare` is kept unless `--replace` is given (then backed up to `~/.dotshare/skill-backups`), a symlinked skill is never written through, and `--no-skill` skips it.
- **Antigravity.** `setup --client antigravity` merges DotShare into `~/.gemini/config/mcp_config.json` (shared by the Antigravity app and CLI), keeping other servers and saving a backup. `doctor --client antigravity` checks it.
- `doctor` checks the skill for the chosen client (or `--skills-dir`) and warns when it's missing, from another DotShare version, or replaced by a different skill.

## [3.8.1] - 2026-11-14

VS Code extension 3.8.1 and `dotshare-cli` 3.2.1. X posts are now charged what X actually deducts.

### Changed
- **X charges work like a card payment.** DotSuite holds the most a post can cost while it's pending, then charges exactly what X deducted (read from DotSuite's X balance after the post) and releases the rest of the hold. A reply with a link, priced as a $0.20 link post, is charged the $0.01 X actually took. If the deduction can't be confirmed, the hold is charged; nothing is added later. This takes effect on DotSuite for every client version.
- Previews say what will be held: "up to $X of your X budget will be held… You pay what X actually deducts and the rest is released", along with the least that will be left this month. The DotShare agent skill describes X costs the same way.

## [3.8.0] - 2026-11-12 — "Fair X"

VS Code extension 3.8.0 and `dotshare-cli` 3.2.0. X charges per post, so X posts through DotShare's X app now go through DotSuite and count against each plan's monthly X budget.

### Added
- **X through DotSuite, metered.** X charges DotSuite per post made through DotShare's X app, so X posts can go through DotSuite (`POST /v1/x/posts`) and count against the plan's monthly X budget. Previews show the exact charge and what's left. Prices follow X's list, anything that might be a link is priced as one, and if X deducts more than the estimate (measured from DotSuite's X balance around each post) the actual amount is charged. Publishing is idempotent, so retries never post or charge twice.
- The extension posts to X through DotSuite when X is connected there (`via=dotsuite`), and shows the charge and remaining budget after each post. The CLI stores such accounts as `{"via": "dotsuite"}` and `doctor` reports the budget.

### Changed
- With DotSuite's `X_SERVER_ONLY` setting, X sign-ins are saved to the DotSuite account and X tokens never reach the device; the X token refresh endpoint is retired.

## [3.7.0] - 2026-11-12 — "Connect"

VS Code extension 3.7.0 and `dotshare-cli` 3.1.0. LinkedIn and X sign-in moves to dotsuite.dev, and AI agents can sign in, schedule saved drafts, post videos and read engagement.

### Added
- **Browser sign-in for agents.** `dotshare-agent accounts connect <id> --platform linkedin|x` opens the browser to approve DotShare, with no token to copy. The result returns to a `127.0.0.1` listener encrypted to a key held only by that CLI process (X25519 + HKDF + AES-256-GCM). A nonce ties it to this sign-in, and anything else sent to the port is ignored.
- **X sign-ins renew themselves.** Agent X accounts connected in the browser get a fresh token when the current one has under five minutes left, before publishing or `doctor` checks. The rotated pair is saved first, and refreshing doesn't invalidate saved previews. `doctor --check-accounts` warns a week before a LinkedIn sign-in expires.
- **`schedule_draft`** (CLI: `drafts schedule`). Schedules a previewed draft through DotSuite: one cloud post per platform with that platform's own text, and local images uploaded first. The draft becomes `Scheduled`. Threads, LinkedIn first comments, videos, Discord and Dev.to are refused with the reason.
- **`get_post_stats`** (CLI: `stats`). Read-only likes, reposts, replies and quotes for published posts on X, Bluesky, Mastodon, LinkedIn and Dev.to, plus impressions on X and views on Dev.to. When a platform withholds metrics, the result explains why.
- **Video and GIF for agents.** MP4/MOV on X, LinkedIn, Mastodon, Telegram and Discord (WebM on Mastodon and Discord), and GIFs on X, Mastodon, Telegram and Discord. Files are checked by content, with each platform's size limit shown at preview.
- **Bluesky mentions.** `@handle.domain` becomes a real mention when the handle resolves; unknown handles stay plain text.
- **Setup for Claude Code and Cursor.** `setup --client claude` registers DotShare through `claude mcp add-json`. `--client cursor` merges it into `~/.cursor/mcp.json`, keeping other servers and saving a backup. `doctor --client cursor` checks the entry.
- **DotShare agent skill.** `skills/dotshare/SKILL.md` teaches agents the draft → preview → approval → publish workflow, per-platform writing rules and safe recovery.
- **Clear all credentials**, as a button in Settings (new Privacy section) and as the **DotShare: Clear All Credentials** command. It removes every local platform, AI, GitHub and DotSuite secret and the cloud-sync consent after a native confirmation. The cleanup code already existed, but nothing could run it.
- **[DotShare Privacy Policy](https://dotsuite.dev/en/dotshare/privacy)** on dotsuite.dev covers what the extension, CLI, sign-in and cloud scheduling store and send, and how to delete it.

### Changed
- **Sign-in runs on dotsuite.dev.** The extension's LinkedIn/X sign-in, X token refresh and sign-in health check use `https://dotsuite.dev/api/connect`. The exchange happens on the server, with state and PKCE in a signed cookie. X now also asks for `media.write`. The CLI moves saved `dotshare-auth-server.vercel.app` URLs to dotsuite.dev.

### Fixed
- **X videos and GIFs upload again.** They used the v1.1 upload, which doesn't accept OAuth 2 tokens. They now use the v2 chunked upload and wait for X to finish processing.
- **Live CodeSnap embeds work.** "Copy Dynamic CodeSnap Markdown" pointed at `codesnap.dotsuite.dev`, which never existed. It now uses `dotsuite.dev/api/codesnap/gist/{id}`, which draws the gist and follows its edits.
- **Scheduled post IDs are recorded.** DotSuite returns `post_id`, which the CLI ignored, so cancelling a scheduled post required looking up its ID.
- **Sign-in security** (old server, fixed on November 11): the editor scheme is checked against known editors, LinkedIn sign-in requires state, and tokens are no longer saved to a DotSuite account named by the request.

## [3.6.1] - 2026-11-09 — "Field Fixes"

VS Code extension 3.6.1 and `dotshare-cli` 3.0.1. Found while publishing the first DotShare article through the MCP to Bluesky and LinkedIn.

### Added
- **LinkedIn first comment.** Agents can pass `firstComment`, for the whole post or per account, and DotShare posts it as the first comment right after the LinkedIn post, so a link can stay out of the post body. If the post goes out but the comment fails, the error says the post is already public so it isn't republished. Other platforms ignore it with a preview warning.

### Fixed
- **Bluesky links and hashtags are clickable.** Posts now mark URLs and hashtags as rich-text facets with UTF-8 byte offsets; before, both showed as plain text and hashtags didn't appear in Bluesky search.
- **Locks left by a crash no longer block the MCP.** Draft, template, encrypted-store and setup locks record their owner. A lock whose process has exited, or that is older than any real commit, is removed automatically; previously a crash or power cut left `security.write.lock` behind and every later write failed until it was deleted by hand.
- **Several MCP clients can share one library.** Writers now wait up to 10 seconds for a lock instead of failing at once, so a second client saving a draft no longer interrupts another client's publication mid-thread.
- **`doctor` explains the Mastodon `profile` scope.** A token without it can't read its own identity; doctor now names the missing scope. The README and extension card list `profile` alongside `write:statuses` and `write:media`.
- **The extension activates with `NODE_TLS_REJECT_UNAUTHORIZED=0`.** Disabled TLS verification is still refused for every credential request, but no longer stops the whole extension from loading.
- **A damaged record no longer hides the others.** `list_history` and `list_drafts` show it as unreadable and list the rest; a missing vault key is still reported once.
- **Fingerprints no longer depend on the process locale.** Request, preview and account fingerprints sort keys by code point. Records written by earlier versions still match.
- **Relative image paths resolve inside `DOTSHARE_MEDIA_ROOTS`** instead of the server's install directory, so an agent can send `launch.png`.

## [3.6.0] - 2026-11-07 — MCP & Publishing Library

The VS Code extension and CLI have separate version numbers. The [GitHub release](https://github.com/kareem2099/DotShare/releases/tag/v3.6.0) contains `dotshare-3.6.0.vsix` for VS Code and `dotshare-cli-3.0.0.tgz` for the CLI and MCP server. See the [MCP quick start](README.md#quick-start-for-ai-agents) and [Publishing Library guide](docs/PUBLISHING_LIBRARY.md).

### Added
- VS Code Publishing Library connected to the configured local MCP installation and its existing draft/template store. Visual draft, thread, article and per-account editors, template discovery/filling/customization, saved previews and per-target publication receipts use the same tools as agents and the CLI.
- Live library refresh with preservation of unsaved edits, revision-conflict handling, stable publication request IDs across webview reloads, read-only publication recovery and disabled-tool policy enforcement. Existing composer drafts remain available without silent migration or credential copying.
- Versioned local publishing templates with five read-only starter recipes, custom create/replace/delete, inferred required variables, defaults, HTTPS URL fields and literal, bounded rendering. Missing values, stale revisions and invalid placeholders fail without creating a draft.
- Template-to-draft creation with source revision metadata and platform/account variants. Account-version inspection, replacement and reset preserve other targets and invalidate publication previews; existing drafts remain independent when a recipe changes or is deleted.
- Persisted agent drafts with create/get/list/update/preview/publish tools and matching `drafts` CLI commands. Content updates invalidate preview snapshots and require a new preview ID before publication.
- Explicit Draft, Preview, Publishing, Published, NeedsReview and SavedRemotely states, per-target delivery receipts, revision conflict detection and operation-journal recovery after a restart.
- Draft publishing revalidates the saved platform plan, account bindings and image fingerprints, then uploads private temporary copies of the previewed local image bytes. Repeated draft publications reuse the original operation and never resend completed/uncertain actions.
- `setup` verifies the local MCP server and registers it in Codex with private backups, preserved unrelated settings/comments, idempotent updates, dry-run mode, explicit image directories and generic-client snippets.
- `doctor` diagnoses runtime, build output, keyring binding, client settings, image directories and real MCP connectivity, with human-readable/JSON reports and optional read-only platform identity checks.
- Local stdio MCP server with twenty-three tools for templates, account variants, saved drafts, account discovery, preview, publication, operation recovery, history and DotSuite cloud scheduling/cancellation.
- Named OS-keyring accounts across all seven platforms, including multiple accounts per platform; hidden terminal setup and JSON stdin configuration.
- Shared headless platform adapters, structured per-account results and per-thread-part publication receipts.
- Validated images, per-account content overrides, explicit threads and automatic long-post splitting for X, Bluesky and Mastodon.
- Durable atomic request claims to prevent duplicate publications on retries or reconnects; uncertain/partial operations retain receipts for manual review.
- Dedicated `dotshare-agent` and `dotshare-mcp` binaries, agent integration documentation, real stdio verification and a staged CLI packaging command.

### Fixed
- Text-only account overrides inherit shared images when media is omitted; an explicit empty media array still removes images. Account-version views and publication planning use the same content resolver.
- LinkedIn and Telegram publishing errors now propagate to callers instead of being presented as successful execution.
- X accepts a supplied headless token and uploads static images using the v2 media endpoint; X and Bluesky abort if an attached image cannot be uploaded.
- Discord uploads local attachments, returns a persisted message receipt and validates webhooks without posting a test message.
- Mastodon rejects excess attachments instead of silently discarding them.
- Telegram sends text literally and directs scheduling requests to DotSuite instead of sending unsupported scheduling parameters.
- `accounts remove` deletes the credential from the OS keyring instead of overwriting it with an empty value.
- Command titles no longer contain emoji.

### Security
- Require Linux Secret Service explicitly for every CLI/MCP keyring entry; refuse automatic backend fallback and verify new credential writes before advertising accounts.
- Encrypt shared drafts, custom templates and operation journals using AES-256-GCM with a random OS-keyring master key, per-write nonce, fixed authentication tag, record-bound associated data and key confirmation. Missing/mismatched keys and tampering fail closed.
- Add `security status`/`security protect`, private ownership/link checks, cross-process encrypted-write locks and verified in-place migration without plaintext backups. Doctor reports legacy/unreadable storage and optional master-key access checks.
- Disable the legacy credential-forwarding CLI relay/login path. Reject credential redirects/insecure TLS settings and untrusted LinkedIn/Discord upload destinations; strengthen secret-safe logs/JSON errors and block known secrets in publication content.
- Agent image access requires `DOTSHARE_MEDIA_ROOTS` with absolute directories. It previously defaulted to the server's working directory, so a client started from the home folder let the agent publish any image there. Unset or invalid values now disable local images; text posts still work.

### CLI 3.0.0 upgrade

1. Stop active publications and install `dotshare-cli-3.0.0.tgz` with `npm install -g ./dotshare-cli-3.0.0.tgz`.
2. Run `dotshare-agent security protect` to migrate existing drafts, custom templates and operation journals in place.
3. If the launcher path changed, review the new configuration with `dotshare-agent setup --dry-run --replace`, then apply it with `dotshare-agent setup --replace`. Restart the DotShare MCP clients and VS Code windows, then run `dotshare-agent doctor --check-accounts` to verify keyring access and account identity.
4. Update scripts that used the legacy CLI login or relay. Connect accounts with `dotshare-agent accounts add` and use direct publishing with named accounts. For local image uploads, configure absolute directories with `dotshare-agent setup --media-root /absolute/path/to/images`.

[Upgrade and recovery details](SECURITY.md#upgrading-an-existing-library) · [CLI commands and examples](docs/AGENT_INTEGRATION.md)

## [3.5.3] - 2026-11-02 — "Mastodon"

### Added
- **🐘 Mastodon platform**: publish posts, threads and up to 4 images to any Mastodon instance from a new Mastodon card and Thread Composer.
  - Reads character and media limits from the instance (`/api/v2/instance`), falling back to 500 characters and 4 attachments.
  - Counts URLs as 23 characters, as Mastodon does, and splits long posts into numbered threads.
  - Waits for media that the server is still processing before posting.
  - Requires an HTTPS instance URL without embedded credentials and refuses redirects, so the access token only reaches the configured server.
  - If a media upload fails, the post is not published. If a thread stops partway, the error says how many posts were already published.
  - Saved API sets, analytics, hashtags, AI prompts and Arabic, English and Russian labels include Mastodon.
- **☁️ Mastodon cloud scheduling**: Mastodon credentials sync to DotSuite for scheduled posts. Users who consented to cloud sync before Mastodon existed are asked separately, and a refusal leaves the other platforms unaffected.

### Fixed
- **🖼️ Thread images**: images attached to thread posts were uploaded to cloud storage but then dropped before publishing, so threads on X, Bluesky and Mastodon went out without them. Uploaded images are now downloaded for publishing, and a post fails with an error rather than publishing without its media.
- **💎 Plan alignment**: removed the Basic tier, which DotSuite does not offer, and show Pro scheduled posts on the server's 5-minute interval.
- **⌨️ CLI packaging**: restored the `dotshare` CLI entrypoint, esbuild bundle and npm packaging, and excluded `bin/` from the VSIX.

### Security
- Fixed 8 Dependabot alerts: `dompurify` 3.4.17, `follow-redirects` 1.16.2 and `handlebars` 4.7.10.
- Overrode `minimatch` and `glob` for dev-only audit findings, and refreshed dependencies including `@anthropic-ai/sdk` 1.x, `openai`, `@google/genai`, `axios` and `marked`.

### Documentation
- Rewrote the README with platform setup guides (including Mastodon), a Free/Pro/Max comparison and an FAQ, and corrected CLI examples to the commands that exist.

## [3.5.2] - 2026-10-04 — "Blog Pilot (Dev.to) & Workspace Context Search"

### Release engine hardening
- Pin metadata, changelog, dependency diffs, commits, documents and implementation excerpts to the selected release commit.
- Separate published releases, committed HEAD work and explicitly selected tracked local changes; refresh evidence before generation.
- Preserve multiline release notes and include version-specific verification documents and their remaining checks.
- Extract source functions with line ranges, Python-test filtering, identifier-aware ranking and supporting lifecycle/helper evidence.
- Enforce optional code excerpts, bounded article depth, source attribution and narrow security claims.
- Validate detectable code, URL, statistic and formatting problems; attempt at most one repair, omit remaining unverifiable code with a visible review notice, and reject other unresolved errors.
- Detect empty and truncated responses across OpenAI, Claude, Gemini, DeepSeek and xAI; collect all Claude text blocks.
- Share evidence collection with legacy quick-post generation and improve VS Code context inspection.

### Added
- **📰 Dev.to Technical Article Generator**:
  - One-click article generation directly from workspace release context using the dedicated `Full Article (Dev.to)` tone.
  - Strict **Pure Markdown Rule**: AI writes standard GitHub Flavored Markdown with clean code fences, language tags, and structured technical sections.
- **🏷️ Automated YAML Frontmatter Builder & URL Fidelity**:
  - Automatically parses YAML frontmatter headers generated by AI or loaded from markdown files.
  - Auto-fills `blog-title`, `blog-tags` (sanitized to max 4 lowercase alphanumeric tags), and `blog-description`.
  - Strictly adheres to the **URL Fidelity Rule**: Stops auto-injecting repository URL as `canonical_url` to protect article SEO and prevent link hallucinations.
  - Seamlessly separates YAML frontmatter metadata from the article body to eliminate duplication in the editor.
- **👁️ Sanitized Live Markdown Preview & Reading Stats**:
  - Dual-mode segmented toggle (`✏️ Raw Markdown` / `👁️ Live Preview`) powered by `marked`.
  - Article preview displays the live title, description and tags above the Markdown body, with blue web links opened through VS Code; declined openings stop without a fallback.
  - Live preview sanitized with `DOMPurify` to ensure complete XSS and HTML injection protection while supporting code syntax, tables, and blockquotes.
  - Real-time article reading metrics: word counter, character counter, and estimated reading time.
- **🔍 Query-Driven Topic Search Engine (`searchGitByTopic`)**:
  - Automatically queries Git commit history using `git log --grep` (with `--all-match` precision) and Pickaxe `git log -S` matching the user's focus topic or prompt.
  - Dynamically extracts high-relevance commits instead of relying solely on generic recent logs.
- **💻 Semantic Diff & Code Snippet Extraction (`extractRelevantCodeSnippets`)**:
  - Reads verified function excerpts around changed executable code, with file paths, line ranges and explicit partial-excerpt labels.
  - Supplies the AI with ground-truth code implementation details while excluding binaries, lockfiles, minified bundles, and tests.
- **📦 Dependency Diff Engine (`getDependencyChanges`)**:
  - Compares Node, Rust, Python and Go dependency manifests within the selected release boundary; local edits are included only in Uncommitted changes mode.
  - Informs the AI of newly installed, upgraded, or removed libraries with exact version numbers.
- **🌐 Multi-Ecosystem Manifests**:
  - Extended project metadata, version, repository, and tech stack auto-detection to **Rust (`Cargo.toml`)**, **Python (`pyproject.toml`)**, **Go (`go.mod`)**, and **Node.js (`package.json`)**.
- **📄 Active Editor Working Context (`getActiveEditorContext`)**:
  - Seamlessly captures the currently open file path, language identifier, and selected code focus snippet directly from `vscode.window.activeTextEditor`.
- **📚 Workspace Docs & Architecture Search (`searchWorkspaceDocs`)**:
  - Scans workspace markdown documentation (`docs/**`, `*.md`) for topic-relevant paragraphs to inject real architecture context into articles.
- **⚡ Automatic Context Enrichment & Inspection**:
  - Auto-enriches prompt context with topic search results upon clicking generate in `PostHandler`.
  - Expanded `dotshare.inspectReleaseContext` output channel to display dependency changes, active editor context, and extracted code snippets in real time.

### Security & Hardening
- **🛡️ Zero Shell Invocation & Windows Safety (`runGit`)**:
  - Switched all Git subprocess execution from `exec` to `execFile` with structured array arguments.
  - Completely eliminates shell injection vectors and resolves Windows pathspec quoting errors with exclusion patterns (e.g. `:!package-lock.json`).
- **🔐 Automated Secret Redaction (`sanitizeSnippetSecrets`)**:
  - Automatically redacts sensitive credentials, tokens, and API keys (`sk-`, `ghp_`, `AIza`, `AKIA`, Slack tokens, Bearer headers, private keys, passwords) from editor selections and diff snippets before transmission to external AI providers.
- **🎯 Smart Keyword Extraction (`extractSearchKeywords`)**:
  - Intelligently extracts core technical terms from natural language queries in English and Arabic, filtering stop words so topic searches never fail on conversational sentences.
- **⚖️ Change-Weight Diff Prioritization**:
  - Ranks changed functions by normalized release terms and change relevance, then balances file coverage and supporting implementation evidence.
- **🏷️ Release Boundary Badges & Working Tree Alerts**:
  - Dynamic UI badges (`🏷️ tag → HEAD`, `⚠️ Uncommitted`, `⚠️ No tags`) and warning banner in the Webview alerting developers to commit and tag releases for accurate context scoping.
- **📜 Single-Release Scope Prompt Hardening**:
  - Added strict prompt enforcement preventing the AI from rehashing past releases or legacy topics.
- **🛡️ UI Hardening & HTML Escaping**:
  - Comprehensive HTML escaping across thread composer textareas (`populateThreadFromParts`), media grid thumbnails, local/remote draft cards, and scheduled posts.
  - Preserved custom publish button labels across state refreshes.
- **💡 Dev.to Guidance & Engine Modernization**:
  - Added Dev.to Article Guidance banner with actionable publishing and formatting tips.
  - Integrated `✨ DotShare AI Article` button inside the Dev.to Article Publisher workspace.
  - Upgraded extension engine to VS Code `^1.90.0` with exact `@types/vscode: 1.90.0`.

---

## [3.5.1] - 2026-08-18 — "Smart CTA Hub & Pure Dynamic AI Discovery"

### Added
- **🔗 Smart User CTA & Links Hub**:
  - Save, edit, and manage persistent personal/community links (`UserCtaLink`) with custom labels, URLs, and emojis stored in `globalState`.
  - Automatic detection of Workspace Repository URL with separate runtime toggle.
  - Real-time multi-panel broadcast synchronization across all open composer tabs (X, LinkedIn, BlueSky) via `userCtaLinksUpdated`.
  - Authoritative `Set<string>` selection state maintaining checkbox selections across multi-panel link additions and re-renders.
  - Race-condition elimination on repository checkbox during background extraction.
  - Strict URL Fidelity and zero-hallucination prompt rules guaranteeing exact verbatim URL output and platform-specific URL budgeting.
- **✨ Pure Dynamic AI Model Discovery**:
  - 100% dynamic live model discovery: Provider APIs are the sole source of truth with zero static hardcoded model fallbacks.
  - **Google Gemini**: Migrated to official `@google/genai` SDK with `GoogleGenAI` and `pageSize=1000` discovery.
  - **OpenAI**: Migrated generation engine to the modern `Responses API` (`responses.create({ model, input, max_output_tokens })`).
  - **xAI Grok**: Integrated dedicated `/v1/language-models` endpoint with `output_modalities: ['text']` filtering.
  - **DeepSeek**: Integrated live model discovery and optimized social generation with `thinking: { type: 'disabled' }`.
  - **Anthropic Claude**: Integrated live model discovery via `client.models.list()`.
- **🔐 SecretStorage Hardening & Auto-Fetch**:
  - Automatic background live model fetch upon opening `Select AI Model` modal using secure keys stored in `SecretStorage`.
  - Safely updates model selection without re-typing API key when a valid key already exists in `SecretStorage`.
  - Added UI Security Vault banner, dynamic provider key status badges (`🔒 Key Saved & Active` / `⚠️ Not Configured`), and smart input placeholders.
- **🛡️ Strict Compile-Time & Runtime Model Verification**:
  - Enforced `GenerateContentOptions.model: string` (required) across the entire engine, preventing runtime regressions or missing model arguments.

### Changed
- **🎨 Platform Post Header Clean-up**: Consolidated AI actions into the unified DotShare AI modal and streamlined platform headers.
- **📦 Dependencies Modernized**: Replaced deprecated `@google/generative-ai` with official `@google/genai`.

---

## [3.5.0] - 2026-08-18 — "DotShare AI Release Copilot"

### Added
- **🧠 DotShare AI Context Engine (`ProjectContextService`)**: Automatically extracts and parses project release context from `CHANGELOG.md`, `README.md`, `package.json`, and Git commit history/diffs (`git diff --stat HEAD~1 HEAD`) in parallel.
- **🎭 Multi-Tone Content Generation (`ReleasePromptBuilder`)**: Added support for 5 tailored writing styles:
  - 👔 **Professional & Formal**: Polished, corporate, impact-oriented for LinkedIn.
  - 🚀 **Build in Public / Casual**: Friendly, authentic developer journey for 𝕏 and BlueSky.
  - 🧠 **Technical Deep-Dive**: In-depth code changes, architecture, and performance.
  - ⚡ **Quick TL;DR**: Rapid, scannable bullet points for instant reading.
  - 📝 **Full Markdown Article**: Strict pure Markdown with YAML Frontmatter for Dev.to and technical blogs.
- **🌍 Bilingual Support**: Full AI prompt engineering support for both fluent developer-focused English and technical Arabic (العربية الفصحى التقنية السلسة).
- **🔍 Inspect Release Context Command**: Added `dotshare.inspectReleaseContext` (`DotShare: 🧠 Inspect AI Release Context`) to view extracted workspace context directly in the VS Code Output panel.
- **⚡ Unified AI Adapters**: Standardized `generateCustomContent` across Google Gemini, Anthropic Claude, OpenAI, and xAI Grok with tone-aware dynamic token allocation and reasoning model (`o1`, `o3`, `o4`) compatibility.

### Changed
- **📦 Dynamic Token Allocation**: Configured custom token limits per tone (up to 4,000 tokens for full Markdown articles, 2,500 for deep-dives, and 1,000 for social updates).
- **🌳 Git Context Extraction**: Upgraded Git analysis to parallelized `Promise.allSettled` and precise `git diff --stat HEAD~1 HEAD` comparison.

---

## [3.4.1] - 2026-06-05 — "Cleanup"

### Removed
- **🧹 Facebook Platform**: Fully removed — all backend adapters (`PostHandler`, `PostExecutor`), OAuth flows (`MessageHandler`, `TokenManager`), Rust core routes, secret keys (`storage-manager.ts`), UI components (`platform-post.html`, CSS), and event listeners (`event-handlers.ts`).
- **🧹 Reddit Platform**: Fully removed — same scope as Facebook. This includes the Reddit Settings Card UI (subreddit/title/flair/spoiler inputs), `redditMetadata` payload logic, `reddit-disclaimer` CSS, and the `reddit-options-card` DOM element.
- **🧹 Medium Platform**: Fully removed — all blog publishing integration, API adapters, and type references.
- **🧹 Legacy CSS & Variables**: Removed old `.theme-toggle` logic, `body.dark` overrides, and unused `themeChanged` listeners. Webviews now natively use VS Code CSS variables (`--vscode-*`).

### Fixed
- **🔧 TypeScript: `ScheduledPost` property names**: Corrected stale references to `scheduledTime` → `scheduled_at`, `postData.text` → `text_preview`, and `postData.media` → `has_media` in `scheduled-posts.ts` to match the updated `ScheduledPost` interface in `src/types.ts`.
- **🔧 TypeScript: `getProviderEmoji` signature**: Updated the parameter type from `'gemini' | 'openai' | 'xai'` to `string` and added a `claude` case — preventing a `TS2345` type error in `post-history.ts`.
- **🔧 TypeScript: `saved-apis.ts` module path**: Fixed broken import (`../../types` → `../../../src/types`) and added explicit `string` cast for `credentials` values to resolve `Property 'trim' does not exist on type '{}'` errors.
- **🔧 TypeScript: `noUnusedLocals` clean**: All files now pass `tsc --noUnusedLocals --noEmit` with zero errors.
  - `MessageHandler.ts` / `PostHandler.ts`: Removed `private` shorthand from services that were only passed-through — they are now plain constructor params.
  - `DotShareAuth.ts`: Added `getContext()` accessor so the static `_context` field is considered read.
  - `AnalyticsPanel.ts`: Added `get extensionUri()` accessor; restored accidentally-removed `this._update()` call.
  - `DotShareWebView.ts`: Converted `private constructor(private readonly _context)` to a plain param that assigns to the static field.
  - `event-handlers.ts`: Removed dead `const shareFacebookBtn = null` and `const loadRedditPostsBtn = null` stubs.
  - `post-history.ts`: Removed unused `successRateValue` variable declaration and initialization.
  - `scheduled-posts.ts`: Removed unused `currentEditingPostId` and `setCurrentEditingPostId` imports.
  - `event-handlers.ts`: Removed unused `themeToggle` declaration and related UI event listeners.

### Enhancements
- **🚀 Dev.to Integration**: Polished and enhanced the Dev.to article publishing flow for better reliability and consistency with the remaining blogging platforms.

### Changed
- **`MAX_CHARS_MAP`** in `media/webview/app.ts`: Removed `facebook: 63206` and `reddit: 40000` entries.
- **Platform count**: DotShare now supports **7 platforms** — LinkedIn, X (Twitter), Telegram, Discord, BlueSky, Dev.to, and GitHub Gist.

---

## [3.4.0] - 2026-05-31 — "CodeSnap"

### Added
- **📸 CodeSnap Feature**: Capture syntax-highlighted code snapshots from your active editor
  - Auto-captures selected code or full file content
  - Smart indentation normalization to avoid wasted space
  - Supports 40+ programming languages with proper syntax coloring
- **🎨 Rendering Engine**: HTML Canvas-based rendering (no native dependencies)
  - Offline-first with local Highlight.js and theme CSS via `vendor/` directory
  - Webview Asset URIs for secure local resource loading
- **🎨 Professional Theme Support**: 9+ built-in themes with accurate color palettes
  - Atom One Dark, GitHub Dark, Monokai, Dracula, Nord, VS2015, Tokyo Night, GitHub Light, Catppuccin Mocha
  - Each theme includes background, code background, and syntax color definitions
- **🎛️ Customization Controls**: Real-time preview with adjustable settings
  - Font size slider (8px–24px)
  - Padding slider (4px–48px)
  - Toggle: Window chrome, line numbers, DotShare watermark
  - Background color picker
- **📱 Platform Integration**: QuickPick platform selector to share CodeSnap to all platforms
  - Works with: LinkedIn, X (Twitter), BlueSky, Telegram, Discord, Dev.to
  - Automatically opens Composer with snapshot attached via internal messaging
- **💾 Local Save**: Download CodeSnap as PNG via native Save dialog
- **🔄 Singleton Panel**: One CodeSnap panel at a time, reuses existing panel if already open
- **🔗 Two-Way Integration**: 
  - CodeSnap panel has a "Share" button that opens the Composer
  - Composer has a "📸 Add CodeSnap" button that opens the CodeSnap panel
  - Pending snap image is held until Composer fires webviewReady, then automatically attached
- **⌨️ Command Registration**:
  - `dotshare.codeSnap`: Opens CodeSnap panel
  - `dotshare.attachSnapToComposer`: Internal command to attach snap to Composer
  - `dotshare._composerReady`: Monitors Composer readiness and injects pending snap

### Technical Details
- **CodeSnapService**: Captures editor state with language detection and indentation normalization
- **CodeSnapPanel**: Manages WebView lifecycle with race-condition-safe webviewReady handshake
- **codesnap.html**: Standalone HTML UI with embedded Canvas rendering logic and theme system
- **messaging**: Base64 PNG encoding/decoding for snap data transfer between panels

---


## [3.3.5] - 2026-05-27 — "Open Privacy Hotfix"

### Fixed
- **Local Publishing Bug**: We apologize for a bug introduced in v3.3.4 where the "Share Thread" and "Publish Article" buttons were incorrectly disabled if you weren't logged into DotSuite Cloud. DotShare remains a privacy-first tool: standard local publishing via manual API keys is fully supported and does **not** require a DotSuite Cloud account. Only Cloud Scheduling requires the dashboard connection. This has been fully resolved.
- **UI Clarification**: Added explicit "OPTIONAL" tagging to the DotSuite Cloud section to clarify that it is solely for scheduling and sync features.

---

## [3.3.4] - 2026-05-27 — "Unified Cloud Auth"

### Added
- **🌐 Unified DotSuite Cloud Authentication**: We've completely overhauled the authentication experience. The old, intrusive manual API key popup is gone. It's been replaced by a sleek, unified "DotSuite Cloud" section directly inside the sidebar. 
- **⚡ Seamless Browser OAuth**: Connect to DotShare securely via your browser (dashboard) and watch the VS Code sidebar instantly update in real-time. No copy-pasting required.
- **💼 Rich Profile Insights**: Once connected, your cloud card now displays your active tier (Pro/Max), used quotas, and profile details straight from the backend.

### Removed
- Removed the old redundant "Profile Modal" and `dotshare.login` command popups to streamline the user experience into a single sidebar component.

---

## [3.3.3] - 2026-05-27 — "Auth Hotfix"

### Fixed
- **Critical Fix**: Resolved an issue where the production version was incorrectly pointing to `localhost:3000` for authentication callbacks instead of the live Vercel URL.
- **URI Handler Update**: Fixed the `vscode://freerave.dotshare` URI scheme handler to properly intercept production tokens.

---

## [3.3.2] - 2026-05-25 — "GitHub Gists & Developer Workflows"

### Added
- **1-Click Gist Creation (Auto-Populate)**: Select any code snippet in your active VS Code editor, hit "Create Gist" from the command palette or sidebar, and the Webview will open with the exact code snippet and current file name automatically populated.
- **Universal Drafts System for Gists**: Gists are now fully integrated into DotShare's global `DraftsService`. You can save, load, edit, and delete Gist drafts seamlessly alongside your other social media and blog drafts from the unified "Saved Drafts" tab.

### Fixed
- **OAuth Connect/Disconnect State Bug**: Fixed a bug where the GitHub "Disconnect" button would fail to appear correctly in the UI. The extension now relies on its internal `TokenManager` as the absolute source of truth instead of checking the global VS Code session, ensuring the sidebar Connect/Disconnect UI accurately reflects your DotShare authentication status.
- **Type Safety**: Ensured strict TypeScript casting for draft data when loading isolated Gist drafts into the Webview.

---

## [3.3.1] - 2026-05-24 — "Security Patch"

### Added
- **🔐 Explicit Security Consent** (`src/handlers/PostHandler.ts`): Added a mandatory one-time consent dialog before any platform API key is synced to the DotSuite server. The dialog clearly states:
  - What data is being synced
  - That keys are encrypted with **AES-256-GCM** at rest
  - That access can be revoked at any time from the Dashboard
  - That keys are never shared with third parties
  - User consent is persisted in VS Code `globalState` (`dotshare.cloudCredentialsConsentGiven`) — asked only once per machine. If the user declines, no credentials are ever uploaded.
- **🛡️ README Security Section**: Added a full `Security, Privacy & Your API Keys` section documenting the consent mechanism, encryption layers, and user rights.

---

## [3.3.0] - 2026-05-24 — "Production Bridge"

### Added
- **`src/constants.ts`**: New centralized constants file for all external URLs.
  - `DOTSUITE_CORE_API_URL` — points to the production Rust backend on Railway (`dotsuite-core-production.up.railway.app`).
  - `DOTSUITE_WEB_URL` — points to the production Next.js frontend on Vercel (`dotsuite.vercel.app`), with an automatic `localhost:3000` fallback in development.
- **Cover Image Upload for Blog Posts**: Added a dedicated **Upload** button to the blog composer's Cover Image field. Users can now select a local image file and upload it directly to Cloudflare R2, receiving a permanent CDN URL that is auto-filled into the cover image input — without leaving VS Code.

### Changed
- **`DotShareAuth.ts`**: Default API base URL updated from `http://127.0.0.1:8080` (local dev) to `DOTSUITE_CORE_API_URL` (production Railway). The local override via `DOTSUITE_API_URL` environment variable is still supported.
- **`MessageHandler.ts`** and **`PostHandler.ts`**: All hardcoded `localhost:3000` / production URL ternaries replaced with a single import of `DOTSUITE_WEB_URL` from `constants.ts`.
- **`SchedulerClient.ts`**: Replaced `native fetch` with `axios` for `multipart/form-data` uploads to fix a Node.js boundary-piping bug that caused `Bad Request` errors from the Rust backend.

### Fixed
- **Composer Wipe on Image Upload**: The `status: success` message handler was incorrectly calling `resetAllComposers()` for *any* success event (including image uploads), erasing the user's title, tags, description, and content. Fixed by decoupling informational success toasts from workflow-completion resets. Only `shareComplete` and `blogShareComplete` events now trigger a composer reset.

---

## [3.2.7] - 2026-05-14 — "Cloud Anchor"

### Added
- **Cloud Media Upload Pipeline** (`src/services/SchedulerClient.ts`): Images attached to scheduled posts are now uploaded to **Cloudflare R2** via `POST /v1/media/upload` before the schedule payload is sent. The returned CDN URL replaces the local file path in `media_urls`, ensuring the Rust scheduler can always access the asset at dispatch time — even if the local file is gone.
  - Upload is authenticated with the user's Bearer JWT (same token used for scheduling).
  - Each file is sent as `multipart/form-data` to `dotsuite-core`.
  - Local paths in `media_urls` are detected and uploaded automatically; already-remote URLs are passed through unchanged.
- **Missing OAuth Credentials UX** (`src/handlers/PostHandler.ts`): Cloud scheduling now intercepts the new `MISSING_OAUTH_CREDENTIALS` error code returned by `dotsuite-core`. Instead of a generic error toast, VS Code shows an actionable alert: **"Open Dashboard"** — deep-linking the user directly to `dotsuite.dev/en/login?intent=vscode` to connect their accounts.
- **Upload Progress Indicator** (`media/webview/app.ts` + `media/webview/style.css`): A per-image upload progress bar appears in the media grid while images are being pushed to R2. Each thumbnail shows a spinner overlay and transitions to a ✓ checkmark on success. Upload failures display an inline ✗ with a retry hint.
- **`uploadMediaFiles()` helper** (`media/webview/app.ts`): New async function that resolves all local media paths to CDN URLs before the schedule payload is constructed, keeping `handleSchedulePost()` clean.

### Changed
- **`SchedulerClient.schedulePost()`**: Now accepts and forwards `media_urls: string[]` (CDN URLs) instead of raw local file paths. Callers are responsible for resolving paths before calling this method.
- **`MessageHandler.ts`**: Refactored `cloud_schedule` command handler to await media upload resolution before forwarding to `SchedulerClient`. Error surface is now split: upload errors bubble as `upload_error`, OAuth errors as `oauth_error`, quota errors as `quota_error`.
- **`media/main.ts`**: Unified the media-path serialisation to always use the resolved CDN URL array when building the outgoing `schedulePost` WebView message.

### Fixed
- **Scheduler sending local paths**: Previously, `media_urls` could contain absolute local filesystem paths (e.g. `/home/user/photo.jpg`). The Rust scheduler has no access to the client's filesystem, so those posts would always fail silently at dispatch. The new upload step eliminates this failure class entirely.

---

## [3.2.6] - 2026-04-25 — "Patch"

### Fixed
- **Markdown File Load — Fields Empty Bug**: Fixed `handleReadMarkdownFile` incorrectly calling `sendSuccess()` which triggered `resetAllComposers()` and erased all just-populated fields (title, tags, description, body). Now uses `status` type `'info'` so the reset is not triggered.
- **Remote Drafts — Showing All Articles**: `handleFetchDevToDrafts` was returning all articles (published + drafts). Now filters to `published === false` only, showing drafts exclusively.
- **Blog Publish — Error and Success Toast Simultaneously**: When pre-publish validation failed, `shareToDevToWithUpdate` / `shareToMediumWithUpdate` used `return` (silent) instead of `throw`, causing `handleShareBlog` to count it as a success and fire a success toast alongside the error toast. Now throws so `handleShareBlog` correctly records the failure.
- **Blog Publish Button Stuck After Validation Error**: The `finally { shareComplete }` block fired even after validation failures, triggering `resetAllComposers()` which wiped article content and left the button in a broken state. Replaced `shareComplete` with a new `blogShareComplete` message that only resets publish buttons — article content is preserved.

### Added
- **Pre-Publish Blog Validator** (`src/utils/blog-validator.ts`): New validation layer that runs before every Dev.to and Medium publish:
  - **Errors (block publish)**: missing title, title > 128 chars (Dev.to) / > 100 chars (Medium), empty body, boilerplate body placeholder.
  - **Warnings (non-blocking toasts)**: article < 50 words, missing description (SEO), no tags, tags > 4 (Dev.to) / > 5 (Medium), duplicate tags, invalid tag characters, tags > 30 chars.
  - Tags are **auto-sanitized** (lowercase, dedup, invalid char strip, length trim, count clamp) before the API call.
- **`blogShareComplete` WebView Message**: New message type for blog platforms that resets only the publish buttons on success — preserves article body/title/tags/description so the user can review what was published. Includes the published article URL in the success toast (8s display).

## [3.2.5] - 2026-04-24 — "Nexus"
### Added
- **Universal Drafts System**: Expanded the drafts architecture to support all platforms (LinkedIn, X, Bluesky, Facebook, Telegram, Reddit) in addition to Dev.to and Medium.
- **Deep Draft Integration**: Drafts are now accessible directly within the Social Composer, allowing you to save and resume progress across any social platform seamlessly.
- **Enhanced Drafting UI**: Improved the drafting experience with clear platform badges, better metadata preservation, and a more responsive grid layout.
- **Two-Way Markdown Sync**: Click "Load" on any Draft to immediately rewrite the currently open `.md` editor file with the draft's exact YAML frontmatter and body, ensuring the Webview and Editor are always 100% in sync.
- **Full Meta-Data Draft Preservation**: Saving Local/Remote drafts from the Blogging Workspace now correctly captures and preserves Title, Tags, Description, Cover Image, Canonical URL, and Series metadata, not just the body text.
- **Blog Reset Boilerplate Button**: Added a new "🧹 Reset Boilerplate" ghost button in the blog publisher view. With one click, it wipes the UI and the active markdown editor back to the clean, default frontmatter block, avoiding manual deletion.
- **Split-Editor Workflow Optimization**: Pressing "Create Post" for Dev.to or Medium now automatically creates/opens the required platform `.md` file in a Side-by-Side Split Editor, ensuring the Webview never obscures the active writing file.

### Changed
- **Major Codebase Cleanup**: Removed over 500 lines of legacy CSS and unused JavaScript components, significantly reducing the extension's memory footprint.
- **Webview Optimization**: Refactored the internal messaging and state management for a snappier, more reliable UI response time.

### Fixed
- **Escape HTML Reference Fix**: Resolved a critical `ReferenceError: escapeHtml is not defined` bug that caused Local Drafts to fail to render if they contained non-escaped character sequences.

## [3.2.4] - 2026-04-19
### Fixed
- **Temporary Reddit Disablement**: Temporarily disabled Reddit OAuth functionality due to third-party authorization issues to ensure security. Reddit connection features will be restored soon.
- **Type Safety**: Improved type safety and fixed unreachable code evaluation warnings in backend API handlers.

## [3.2.3] - 2026-04-16 — "Aegis"
### Added
- **Aegis 1.4.0 Integration**: Full integration with the DotShare Auth v1.4.0 "Aegis" protocol for proactive token lifecycle management.
- **Visual Token Intelligence**: Added Aegis Status Badges (Stable 🛡️ / Warning ⚠️) to the platform cards in the sidebar. Users can now see their exact token health at a glance.
- **Proactive Refresh Button**: A new "Refresh Connection" button appears when a token is nearing expiry (e.g., Facebook's 60-day window or X's rotation), allowing manual renewal before a failure occurs.
- **Absolute Expiry Tooltips**: Hovering over the platform badge now shows the exact date and time the connection will expire.
- **Unified Auth Broker Pattern**: Refactored `TokenManager.ts` to use a unified response handler for all OAuth platforms, improving reliability and reducing code duplication.

### Fixed
- **X (Twitter) Rotation Warnings**: Added UI-level detection for X rotation failures. The extension now explicitly asks the user to reconnect if a secret rotation fails during a refresh.
- **Reddit Token Permanence**: Fixed Reddit auth flow to always request `duration=permanent`, ensuring refresh tokens are correctly issued.

## [3.2.2] - 2026-04-13
### Fixed
- **Character Limit Validation**: Fixed a bug where thread posts did not turn red when exceeding platforms' character limits and the "Share" button remained enabled. Corrected missing validation logic in the thread composer's character counter.

## [3.2.1] - 2026-04-12
### Added
- **Frontend Image Compression**: Migrated image compression logic from the backend to the frontend using HTML5 Canvas. This eliminates the heavy `sharp` dependency and improves processing speed.

## [3.2.0] - 2026-04-12 — "The Media Expansion" (2026-04-12)

### Added
- **Multi-Image Media Grid**: Users can now attach up to 4 images per single post, matching platform-native behaviour for both Bluesky and X/Twitter.
  - Dynamic CSS-grid thumbnail preview rendered inside the composer on file selection.
  - Per-thumbnail ✕ remove buttons for granular selection management.
  - "Remove All" bulk action button to clear the entire media selection in one click.
  - `renderMainMediaGrid()` — central re-render function acting as the single source of truth; rebuilds the grid DOM from `activeMediaPaths[]` on every state change.
- **True Multi-Image Bluesky Posts**: Fixed `bluesky.ts` embed builder — now uploads every selected image as a separate Blob, collects all `ref` objects, and attaches them as a proper `app.bsky.embed.images` array in one post request (previously only `media[0]` was used).
- **True Multi-Image X / Twitter Posts**: Updated `x.ts` media upload flow — calls `uploadMedia()` sequentially for each image and passes all resulting `media_id` values together in the final tweet payload.
- **Thread Multi-Image Support**: Each post in the Thread Composer now independently supports up to 4 images. Per-post `mediaFilePaths[]` arrays are tracked separately and serialised correctly in the `shareThread` payload.
- **Smart File Size Warning**: Files over 2 MB trigger an inline toast warning at selection time (before upload), informing users that automatic optimisation will occur at post time.
- **Just-In-Time Compression**: Image compression is applied in `MediaService.ts` at share time (backend), preserving quality as long as possible and keeping the frontend snappy.
- **Secure Webview URI Thumbnails**: `MessageHandler.ts` now converts local filesystem paths into `vscode-resource://` safe URIs via `webview.asWebviewUri()`, enabling real `<img src>` thumbnail previews within VS Code's sandboxed webview CSP.

### Fixed
- **`activeMediaPath` typo** (TS error `2552`): Renamed all stale references to the correct `activeMediaPaths` array — the share payload was sending `undefined` before this fix.
- **Media state reset**: `activeMediaPaths` is now correctly cleared to `[]` after a successful post and when the user discards the composer.
- **Thread post re-indexing**: Removing a thread post now correctly splices the `threadPosts` array and calls `reIndexThreads()` to prevent stale `data-*` index references causing media attachment bugs.

---

## [3.1.0] - 2026-04-07 — "The Polish Pass"


### Added
- **WebView Toast Engine**: Replaced intrusive VS Code popups with custom, non-intrusive notifications (progress bars, auto-dismiss, contextual colors).
- **Global Loading States**: Buttons switch to "Spinning/⏳" state and disable themselves automatically during async posting operations.
- **Character Limit Validation**: Integrated max-chars verification system (`MAX_CHARS`) into the UI, offering visual highlights (warning at 80% limit, error styling over 100%, button disabled).
- **UI Aesthetics**: Substantial UI/UX visual upgrade employing glassmorphism effects (`backdrop-filter: blur(8px)`) and CSS animations on modals/cards.

### Fixed
- **Reddit Native Image Upload (S3 Boss Fight)**: Fixed the complex native image upload pipeline for Reddit via S3. Implemented robust FormData field parsing, corrected `Content-Length` missing errors that triggered AWS 400 violations, and correctly fed raw S3 payload URLs back to `api/submit` to prevent "Invalid image URL" traps from Reddit's unpopulated CDN.
- **The Disappearing Preview Race Condition**: Implemented selective reset logic inside the WebView message handlers. Differentiates "intermediate" success (file upload complete) from "terminal" success (post completely shared) to prevent erasing user inputs prematurely.
- **Reddit UI Integration**: Fixed HTML field mismatches in `platform-post.html` and `app.ts` (`redditSubreddit`, `redditTitle`, `redditFlairId`, `redditPostType`, `redditSpoiler`) that caused the `PostHandler` to drop the actual text payload.
- **Variable Cleanup**: Scoured and removed unused UI variables like `btnSchedule` to pass strict ESLint criteria.
- **NPM Package Updates**: Resolved multiple Critical/High security alerts across development packages by bumping `flatted`, `handlebars`, `picomatch`, and other dev dependencies via npm auditing.

## [3.0.1] - 2026-04-05

### Added
- **Medium API Notice**: Added a prominent warning notice in the Medium settings and publish views regarding their recent API restrictions and the manual activation process via email.
- **Improved UX**: Updated "Integration Token" labels and placeholders for clarity.
- **Telegram Fix**: Network and TLS stability improvements for Telegram posting.

## [3.0.0] - 2026-04-04 — "The Publishing Suite"

### Added
- **Dev.to Integration**: Publish markdown articles to Dev.to via API. Supports title, tags (max 4), canonical URL, description, cover image URL, series, and draft/publish toggle. Auth via `api-key` header stored in VS Code SecretStorage.
- **Medium Integration**: Publish articles to Medium via API. Supports markdown/HTML content format, tags (max 5), canonical URL, and publish status (`public` | `draft` | `unlisted`). Auth via Bearer token. Normalizes `published` → `public` automatically.
- **Blog Publish Page**: Dedicated long-form publishing UI separated from social post logic. Features: Title, Tags (chip input), Description, Cover Image URL, Canonical URL, Series, and Draft vs. Publish toggle per platform.
- **Active File Reader**: "Load Current File" button reads the active `.md` file from VS Code editor and populates the publish form automatically.
- **YAML Frontmatter Parser**: Auto-extracts `title`, `tags`, `canonical_url`, `description`, `cover_image`, `series` from markdown frontmatter to pre-fill the publishing form.
- **Platform-First Navigation**: Sidebar redesigned with platform icons as primary navigation. Selecting a platform auto-switches the workspace (Threads / Social / Blogs) based on `PLATFORM_CONFIGS`.
- **Platform Config System**: New `platform-config.ts` as single source of truth for all platform metadata — `maxChars`, `supportsThreads`, `workspaceType`, `charCountMethod`, `authType`, and more. Shared between extension and WebView.
- **X Premium Toggle**: Premium toggle in the platform header for X — switches character limit from 280 to 25,000.
- **Thread Composer**: Dedicated thread-building UI for X and Bluesky with per-post character counters and media attachments.
- **`PostExecutor` class**: Centralized platform execution engine decoupled from VS Code UI concerns. Used by the scheduler for clean background posting.
- **`CredentialProvider` refactor**: Added `getRedditSubreddit()` method and `redditSubreddit` field. Extracted shared `resolve()` helper to eliminate credential-fetching duplication.
- **Dev.to image policy**: Clarified that Dev.to API does not support direct image uploads — only public URLs are accepted. Local files are skipped with a descriptive logger warning.
- **Medium image policy**: Local files skipped with warning; HTTP/HTTPS URLs embedded directly in markdown body.
- **`countChars()` fix**: Twitter URL counting now always replaces URLs with exactly 23 chars (was incorrectly using `Math.min(url.length, 23)`).
- **`types.ts` v3 overhaul**: Added `BlogPost`, `FrontMatter`, `PublishTarget`, `PublishResult`, `DraftStatus`, `WebViewPage`, `DevToArticle`, `MediumPost`, `WebViewState`, and related response types. Added `devto` and `medium` to `SocialPlatform` union and `AnalyticsSummary`.

### Fixed
- **`PostHandler` handlers**: `handleShareToFacebook`, `handleShareToDiscord`, `handleShareToX`, `handleShareToBlueSky` now correctly read post content from the incoming `message` object instead of relying on `historyService.getLastPost()`.
- **Reddit subreddit hardcode**: Removed hardcoded `subreddit: 'test'` from both `PostHandler` and `PostExecutor`. Subreddit is now read from `CredentialProvider.getRedditSubreddit()` with a clear error if not configured.
- **Discord not-implemented**: `shareToDiscordWithUpdate` now returns a user-facing `'Discord sharing coming soon!'` error instead of silently logging.
- **`handleShareThread` platform validation**: Now uses `PLATFORM_CONFIGS[platform].supportsThreads` instead of a hardcoded `platform !== 'x' && platform !== 'bluesky'` check.
- **`unifiedSharePost` success counter**: Fixed — now correctly increments `successCount` per platform and reports accurate partial-success messages.
- **`devto.ts` ESLint**: Removed unused `FormData` and `fs` imports after image upload feature was removed.
- **`PostExecutor` ESLint**: Removed empty `onSuccess: () => {}` callbacks that triggered `@typescript-eslint/no-empty-function`.

### Changed
- **WebView workspace tabs removed**: Replaced "Threads / Social / Blogs" tab bar with a dynamic `platform-header` element. Workspace switching is now driven by `switchPlatform()` in `app.ts` using `PLATFORM_CONFIGS[platform].workspaceType`.
- **`shareToDevTo` signature**: Extended with `title`, `tags`, `description`, `coverImage`, `published`, `canonicalUrl`, `series` overrides — all respected in the API payload.
- **`shareToMedium` signature**: Extended with `title`, `tags`, `publishStatus`, `canonicalUrl`, `contentFormat` overrides. Added `normalizeMediumPublishStatus()` to handle `published` → `public` mapping.
- **`CredentialProvider`**: Refactored to use private `resolve()` helper — eliminates the `if (credentialsGetter) ... else ...` pattern repeated in every method.
- **`PostHandler` Reddit fallback title**: Now uses `post.text.substring(0, 300)` instead of hardcoded `'Post from DotShare'`.
- **`handleShareBlog` publish status mapping**: `published` → `public` is now applied consistently before passing to Medium.

### Removed
- **`uploadImageToDevTo()`**: Removed — Dev.to has no public image upload API. Replaced with URL-only handling + logger warning for local files.
- **`Share To` card in social workspace**: The multi-platform checkbox grid inside the social composer was removed. Platform is now selected from the sidebar.
- **Old workspace tabs HTML**: `<div class="workspace-tabs">` and `workspace-tab` buttons removed from `index.html`.

---

## [2.4.0] - 2026-03-11

### Added
- **One-Click OAuth Flow**: Full browser-based OAuth for LinkedIn, X (Twitter), Facebook, and Reddit via dedicated auth server (`dotshare-auth-server.vercel.app`) — zero credential input in the extension
- **OAuth UI Polish**: Connected ✓ badges, green connected states, and Disconnect buttons for all OAuth platforms
- **Advanced Accordion**: Manual token inputs collapsed under an "Advanced" section to reduce clutter
- **Direct Platform APIs**: All 4 platforms (LinkedIn, X, Facebook, Reddit) now post directly to their respective APIs using tokens from VS Code SecretStorage
- **Smart Hashtag System**: Intelligent `HashtagService` with 7 auto-detection sources — project name, git commits, tech keywords, content analysis, framework detection, trending topics, and platform-specific tags
- **Custom Hashtags Setting**: Registered `dotshare.customHashtags` and `dotshare.defaultPlatform` in VS Code Settings UI (`contributes.configuration`) — no more manual `settings.json` editing
- **Claude AI Support**: Added Anthropic Claude as a 4th AI provider alongside Gemini, OpenAI, and xAI

### Fixed
- **Reddit Hashtag Bug**: Hashtags are no longer appended to Reddit posts (Reddit does not use functional hashtags); same applies to Discord — controlled via `HASHTAG_UNSUPPORTED_PLATFORMS`
- **Project Name Accuracy**: `HashtagContext.projectName` now sourced from `package.json → name` or `Cargo.toml → name`, falling back to workspace folder basename — no longer guessed from random keywords like `test` or `lint`
- **Content Term Detection**: Simplified word-split regex in `getContentBasedHashtags` from `/[^a-zA-Z0-9.\-/]/` to `/[^a-zA-Z0-9]/`; updated `techTerms` to alphanumeric-only (`cicd`, `nodejs`)

### Changed
- **`extractKeywords()`**: Refactored to return `{ keywords, projectName }` instead of a flat `string[]`; project name is no longer mixed into the keywords array
- **All 4 AI Providers**: Now check `HashtagService.supportsHashtags(platform)` before appending hashtags
- **Build Optimization**: Updated `.vscodeignore` to exclude `__tests__/`, `src/`, and dev config files — significantly reduced `.vsix` bundle size

### Technical Details
- Auth server deployed on Vercel; all secrets server-side only via `process.env`
- Deep link handler `vscode://freerave.dotshare/auth` registered in `package.json` `uriHandlers`
- `HashtagService.supportsHashtags()` is the single source of truth for platform hashtag support

---

## [2.3.0] - 2026-03-04

### Added
- **Smart AI Hashtags**: Automatic hashtag generation using 7 context sources — project type, keywords, git commit history, post content, detected frameworks, trending topics, and platform-specific tags
- **`HashtagService`**: New dedicated service (`src/services/HashtagService.ts`) encapsulating all hashtag logic with relevance scoring (0–1 scale), deduplication, and a configurable limit
- **`HashtagContext`**: Structured context interface passing project type, keywords, active file, git changes, and post content to the hashtag engine
- **Analytics Dashboard**: Visual analytics panel tracking post history, per-platform success rates, and share counts
- **`AnalyticsService`**: New service for cross-platform engagement metric aggregation and calculation
- **Context-Aware Prompts**: AI prompts updated to instruct models NOT to include hashtags (the system appends them automatically based on real project context)
- **`contextBuilder.ts`**: Centralized project context builder — single source of truth for all AI providers, scanning `package.json`, `Cargo.toml`, `README.md`, `CHANGELOG.md`, and git history

### Fixed
- **AI Hallucination Reduction**: Prompts now include explicit project files and git info, instructing the AI to only mention technologies and features actually present in the codebase

### Changed
- **AI Providers (Gemini, OpenAI, xAI)**: All refactored to use shared `buildProjectContext()` from `contextBuilder.ts` instead of each building their own context
- **Post Generation Flow**: `postContent` is set on `hashtagContext` after AI text is generated, enabling content-based hashtag detection

---

## [2.2.0] - 2026-01-22

### Added
- **Clean Architecture Refactoring**: Complete transformation from single Monolithic Class (2000+ lines) to 9 focused files with clear separation of concerns
- **Services Layer**: New HistoryService, AnalyticsService, and MediaService for modular functionality
- **Handler Pattern**: Specialized handlers including ConfigHandler, RedditHandler, and PostHandler with MessageHandler routing
- **Premium UI Design System**: Modern glassmorphism effects, gradient accents, smooth animations, and professional modal designs
- **Hybrid Scheduling System**: Server-side scheduling for Telegram, client-side for other platforms with intelligent post type handling
- **Critical Security Enhancement**: Migrated from insecure globalState to VSCode SecretStorage for API credential encryption
- **Advanced Scheduler Features**: Atomic file operations, intelligent retry logic with exponential backoff, stuck posts recovery system
- **Enhanced Type Safety**: Comprehensive TypeScript interfaces replacing all 'any' types, proper error handling with 'unknown' types
- **Modern Platform Cards**: Transformed checkbox-based selection to professional grid cards with hover animations and platform branding
- **Global Logger System**: Structured logging for webview JavaScript files with colored console output and debug modes
- **What's New Feature**: Auto-open changelog panel on extension updates with VSCode-native styling
- **API Key Persistence**: Automatic loading and saving of AI model API keys in secure storage
- **Platform-Specific Scheduling**: Server-scheduled posts for Telegram, client-side execution for other platforms

### Fixed
- **Critical Security Vulnerability**: Resolved insecure API configuration storage using plain JSON files
- **Scheduler Race Conditions**: Fixed posts getting stuck in 'processing' state with atomic operations and lock mechanisms
- **Configuration Loading**: Fixed extension startup configuration loading issues
- **Modal Functionality**: Resolved saved APIs modal 'Add New' button and schedule modal event handlers
- **Platform Selection Logic**: Fixed Schedule Post button platform counting and content validation
- **UI Button States**: Corrected inverted logic where schedule button was enabled without content
- **Message Routing**: Fixed 'schedulePost' command routing to PostHandler instead of ConfigHandler
- **ESLint Warnings**: Eliminated all TypeScript errors and ESLint warnings throughout codebase
- **Import Organization**: Cleaned up imports and dependencies across all modules
- **Timezone Handling**: Fixed scheduled post timing issues with proper UTC storage
- **Storage Consistency**: Aligned storage paths between PostHandler and scheduler components
- **Post Status Tracking**: Implemented comprehensive status tracking with platform-specific results

### Changed
- **Architecture**: Applied SOLID principles with Single Responsibility, Dependency Inversion, and Interface Segregation
- **UI Provider**: Streamlined DotShareProvider with clean dependency injection and focused responsibilities
- **Scheduler Reliability**: Enhanced with retry mechanisms, error recovery, and performance optimizations
- **File Organization**: Improved maintainability with 160-250 lines per file vs previous 2000+ line Monolithic Class
- **Error Handling**: Comprehensive error handling and user notifications throughout the application
- **Code Quality**: 100% TypeScript coverage with zero errors and warnings

---

## [2.1.0] - 2025-12-24

### Added
- **NPM Publishing**: Official release of `dotshare-cli` on NPM registry
- **Single Source of Truth**: Implemented centralized `constants.ts` for managing Server URL configuration across all modules (CLI & Extension)
- **Production Default**: Configured default server URL to point to live Railway instance for seamless out-of-the-box experience

### Fixed
- **Linter Cleanup**: Resolved all ESLint warnings in `src/reddit.ts` and `src/telegram.ts` regarding unused imports
- **Type Safety**: Fixed `no-explicit-any` warnings in `src/cli/commands.ts`
- **CLI Authentication**: Fixed `open` library compatibility issues (CommonJS/ESM)
- **Connection Fallback**: Fixed default connection logic to ensure CLI connects to production server when no local config exists

---

## [2.0.0] - 2025-10-28

### Added
- **Manual Post Creation**: Support for creating posts manually without AI generation
- **Enhanced Media Upload**: Drag-and-drop and click-to-browse functionality for attachments
- **Reddit Subreddit Selection**: Modal for subreddit/title/flair selection when sharing to Reddit
- **Reddit User Profile Support**: Ability to post to user profiles (u/) in addition to communities (r/)
- **Real-time UI Feedback**: Platform selector now shows configured platforms dynamically
- **Multi-language Support Improvements**: Language translations update without restart

### Fixed
- Fixed duplicate currentLang variables causing language translations to not update
- Fixed VS Code API multiple acquisition error preventing webview from loading
- Fixed vscode undefined error in modal handlers
- Fixed Saved APIs modal close button event listener missing
- Fixed analytics dashboard showing zeros with tab click refresh logic
- Fixed automatic configuration loading when extension opens
- Fixed Schedule Post and Share Now buttons not activating when platforms selected
- Fixed media attachment click handler to work on entire area
- Fixed Reddit sharing errors by removing hardcoded subreddit

---

## [1.0.0] - 2025-10-18

### Added
- **Expanded Platform Support**: X/Twitter, Facebook, Discord, Reddit, BlueSky
- **Enhanced AI Capabilities**: Multiple AI providers (Gemini, OpenAI, xAI), model selection
- **Advanced Analytics & Tracking**: Dashboard, per-platform metrics, post history
- **Enhanced Scheduling System**: Multi-platform scheduling, advanced status tracking
- **API Configuration Management**: Saved configurations, quick switching, named configs
- **Media Support**: Multi-file attachments, cross-platform media optimization
- **Reddit-specific Features**: Post types, flair selection, spoiler support, post management
- **User Interface Enhancements**: Activity Bar integration, multi-language support, responsive design

---

## [0.0.1] - 2025-10-03

### Added
- Initial release of DotShare VS Code extension
- AI-powered social media post generation using Gemini and other models
- Share posts to LinkedIn and Telegram directly from VS Code
- Scheduled posting feature for CLI
- Multi-language support (English, Arabic, Russian)
- Integrated webview UI for managing posts
