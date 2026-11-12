# DotShare for AI agents

Connect Codex or another MCP client to DotShare, then ask it to publish a post,
images, a thread, or a Dev.to article to named accounts. The agent supplies content;
DotShare handles credentials, platform requests and durable publication receipts.
The local MCP server uses stdio and does not require a separate model/API key.

## Install and set up

Requires Node.js 22.12+ and an unlocked OS credential store. On Linux, a working
Secret Service/keyring session is required. There is no plaintext secret fallback.

Install the CLI and MCP server from npm. For an existing library, follow the [upgrade steps](#local-storage-protection) before resuming publication.

```sh
npm install -g dotshare-cli
dotshare-agent setup                     # Codex; or --client claude / --client cursor
dotshare-agent accounts connect work-x --platform x          # LinkedIn and X: browser sign-in
dotshare-agent accounts add personal-mastodon --platform mastodon --name "Personal Mastodon"
dotshare-agent doctor --account personal-mastodon
```

Restart or reconnect your MCP client after setup. In Codex, ask DotShare to list your local
accounts, save a draft for one of them and prepare its preview. To review that draft
in VS Code, follow the [Publishing Library guide](PUBLISHING_LIBRARY.md).

You can also download the tarball and install it with `npm install -g ./dotshare-cli-3.1.0.tgz`. [GitHub release](https://github.com/kareem2099/DotShare/releases/tag/v3.7.0)

To build and configure from source instead:

```sh
npm ci
npm run compile
node bin/dotshare-agent.js setup
node bin/dotshare-agent.js doctor
node bin/dotshare-agent.js accounts add personal-mastodon --platform mastodon --name "Personal Mastodon"
node bin/dotshare-agent.js accounts add work-linkedin --platform linkedin --name "Work LinkedIn"
node bin/dotshare-agent.js accounts list
```

Account setup prompts hide typed credentials. Enter platform secrets in your
terminal prompts. Existing VS Code accounts are not automatically copied.
Multiple accounts on one platform use
different IDs. To replace an account's credentials, run `accounts add` with its ID.
`accounts remove <id>` removes the local account and deletes its credential from the OS keyring.
It does not revoke the token on the platform. Expired/revoked platform tokens must
be replaced using `accounts add`, or `accounts connect` for LinkedIn and X.

### Browser sign-in for LinkedIn and X

`dotshare-agent accounts connect <id> --platform linkedin|x [--name ...] [--no-open]`
opens dotsuite.dev in your browser, where you approve DotShare on LinkedIn or X.
There is no token to copy. The CLI listens on `127.0.0.1` for the result, which
dotsuite.dev encrypts to a key that exists only in that CLI process (X25519 + HKDF +
AES-256-GCM). Tokens never appear readable in a URL or in browser history. A nonce
inside the ciphertext ties the result to this sign-in; anything else sent to the port
is ignored. The wait ends after 5 minutes (`--timeout` changes it).

X access tokens last two hours. For accounts connected this way, DotShare swaps the
refresh token through dotsuite.dev when an X token has under five minutes left,
before publishing or checking the account. The rotated pair is saved to the keyring
first. Refreshing doesn't invalidate saved previews, because a connected account is
identified by its sign-in, not its current token. LinkedIn sign-ins last 60 days;
`doctor --check-accounts` warns a week before they expire. Tokens pasted with
`accounts add` are used as they are and never refreshed.

After packaging/installing the CLI, the same commands are available through
`dotshare`, `dotshare-agent`, and the dedicated `dotshare-mcp` server entrypoint.

The npm package also ships an agent skill at `skills/dotshare/SKILL.md` (in the
installed package directory, e.g. `$(npm root -g)/dotshare-cli/skills/dotshare`). Copy
that folder into your agent's skills directory so it follows DotShare's draft → preview
→ approval → publish workflow and per-platform rules.

### Credential fields

| Platform | Fields entered during setup |
| --- | --- |
| LinkedIn | `accessToken` (user OAuth token with posting access) |
| X | `accessToken` (user OAuth token; media also requires media upload access) |
| Telegram | `botToken`, `chatId` (the bot must be able to post in this chat/channel) |
| Discord | `webhookUrl` (HTTPS `discord.com/api/.../webhooks/...` URL) |
| Bluesky | `identifier`, `password` (use an app password) |
| Mastodon | `instance`, `accessToken` (status/media publishing scopes) |
| Dev.to | `apiKey` |

For automated local setup, `accounts add --input -` reads account JSON from stdin:
`{"id":"personal","name":"Personal","platform":"mastodon","credentials":{"instance":"https://your.instance","accessToken":"..."}}`.
Credentials are saved to the OS keyring. Only account IDs, labels and platform names
are written to `~/.dotshare/accounts.json`. Use stdin or an interactive terminal;
avoid putting credentials in command arguments or committed files.

## Local storage protection

Linux entries require Secret Service explicitly; there is no automatic kernel-keyring
fallback. macOS/Windows use their native OS credential stores. New drafts, custom
templates and operation journals always use authenticated AES-256-GCM encryption.
The master key is generated randomly and stored in the OS keyring only; a locked,
missing or mismatched key fails closed. Restore the original OS key and security.json
instead of generating a replacement key for existing ciphertext.

To upgrade an existing installation, stop active publications and run these commands.

```sh
npm install -g dotshare-cli
dotshare-agent security status
dotshare-agent security protect
```

For a source checkout, substitute `node bin/dotshare-agent.js` for `dotshare-agent`.
If you switched from a source checkout to the installed package, use
`dotshare-agent setup --dry-run --replace` to review the new launcher paths.
Then run `dotshare-agent setup --replace` to replace the existing DotShare entry.
Review the media roots and include `--media-root` for any directory you want to allow.

`protect` verifies existing account access, repairs private permissions and converts
existing plaintext records in place. It verifies preserved content without making
plaintext backups. Restart all DotShare MCP clients and VS Code windows afterwards,
then run `dotshare-agent doctor --check-accounts`. Prior snapshots and backups may
still contain plaintext; the migration does not securely erase old disk pages.

Credential JSON input files must be private (0600 on Unix), regular files owned by
the current user; interactive hidden prompts or stdin are preferred. The old CLI
relay posting/login path is disabled because it forwarded platform keys or echoed
legacy input. Use named local accounts and the direct agent publishing workflow.

See [the security model, recovery and limits](../SECURITY.md). Platform keys are not
stored in draft/template files. Account IDs/labels remain private metadata rather
than encrypted records. Encryption here does not attest the OS provider's own
at-rest encryption, protect an unlocked account from same-user malware, or audit
the separate DotSuite backend.

## Setup and diagnostics

Run these after installing the CLI package (or prefix the commands with
`node bin/dotshare-agent.js` when using this checkout):

```sh
dotshare-agent setup
dotshare-agent doctor
dotshare-agent accounts add personal-mastodon --platform mastodon
dotshare-agent doctor --account personal-mastodon
```

`setup` verifies a real MCP handshake, registers the current installation in Codex,
uses absolute Node/server paths, and forwards the Linux desktop session for keyring
access. It preserves other settings, comments and server entries, creates a private
backup when replacing an existing file, and does not rewrite an unchanged entry.
Restart/reconnect Codex after setup; setup cannot prove a running client has reloaded.

Local images remain disabled on a fresh setup until directories are explicitly
allowed. Existing allowed directories are retained when setup runs again:

```sh
dotshare-agent setup --media-root /absolute/path/to/images
dotshare-agent setup --text-only
dotshare-agent setup --dry-run
dotshare-agent setup --client claude
dotshare-agent setup --client cursor
dotshare-agent setup --client generic
dotshare-agent setup --config /absolute/path/to/config.toml --json
```

`--dry-run` checks the server and prints a configuration preview without writing
settings. `--client claude` adds DotShare to Claude Code's user scope by running
`claude mcp add-json` (with `--dry-run` it prints that command instead).
`--client cursor` merges a `dotshare` entry into `~/.cursor/mcp.json` (or `--config`),
keeping other servers and settings and saving a backup. `--client generic` prints an
`mcpServers` JSON snippet for manual import; adapt the wrapper key to your client's format. A different existing DotShare server
is preserved unless `--replace` is explicitly supplied. Existing inline/dotted-key
DotShare TOML entries must be converted to `[mcp_servers.dotshare]` before automatic
updates; malformed config files are never overwritten. `CODEX_HOME` is honored.

`doctor` checks Node, build output, native keyring binding, client configuration,
image roots, account metadata and a real stdio MCP handshake. It never changes
settings or publishes content. Default checks do not read credentials or contact
platform APIs. Use `--check-accounts` to read credentials and call identity endpoints,
or `--account ID` to check just one account. These checks do not create posts,
uploads, OAuth sessions or refresh tokens. Bluesky only resolves the handle and
reports password validity as unverified. A platform HTTP 403 is a warning about read
scopes/API access, not proof that a publishing token is invalid.

Reports distinguish `PASS`, `WARN`, and `FAIL`, with actionable fixes. `--json`
returns a structured report. Failed checks exit with status 1; warnings alone exit
0. `doctor --skip-mcp` performs local checks and reports `mcpReady: null`, never a
successful connection. Generic-client diagnostics verify the server, not the other
client's configuration. Identity verification does not prove posting permissions
or encrypted-at-rest keyring storage.

## Manual Codex configuration

From this checkout, replace the paths with absolute paths on your machine:

```sh
codex mcp add dotshare -- node /absolute/path/to/DotShare/bin/dotshare-mcp.js
```

Or merge this into your existing `~/.codex/config.toml`:

```toml
[mcp_servers.dotshare]
command = "node"
args = ["/absolute/path/to/DotShare/bin/dotshare-mcp.js"]
cwd = "/absolute/path/to/DotShare"
startup_timeout_sec = 20
tool_timeout_sec = 600
# Forward the desktop session for Linux OS keyring access.
env_vars = ["DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "DISPLAY", "WAYLAND_DISPLAY"]

[mcp_servers.dotshare.env]
DOTSHARE_MEDIA_ROOTS = "/absolute/path/to/your/images"
```

Restart/reconnect the MCP client after adding the server. Configure another client
with the same command/arguments and stdio transport. Official Codex configuration:
<https://learn.chatgpt.com/docs/extend/mcp?surface=cli>.

`DOTSHARE_HOME` optionally changes the metadata/history directory. Credential keys
in the OS keyring are shared between home directories; account IDs should be unique
if using several directories. `DOTSHARE_MEDIA_ROOTS` contains allowed image directories
separated by the OS path delimiter (`:` on Linux/macOS, `;` on Windows). Each entry
must be an absolute path. When it is unset or invalid, local images are disabled and
text-only posts still work. A relative image path such as `launch.png` is looked up
inside each root in order. Real paths are checked, including symlink targets.
The server never downloads arbitrary social-media URLs or reads credentials from
tool arguments. Diagnostics go to stderr; stdout is reserved for MCP JSON.

Example requests after connecting:

> List my DotShare accounts and preview this post for LinkedIn and Mastodon.

> Publish the previewed post to work-linkedin and personal-mastodon, with this image.

> Turn this release announcement into a thread on my Bluesky account and publish it.

The server exposes `list_accounts`, `preview_post`, `publish_post`, `get_operation`,
`list_history`, `list_cloud_connections`, `schedule_post`, `list_scheduled_posts`, and
`cancel_scheduled_post`, plus `create_draft`, `get_draft`, `list_drafts`,
`update_draft`, `preview_draft`, `publish_draft` and `schedule_draft`, plus `list_templates`,
`get_template`, `save_template`, `delete_template`, `render_template`,
`create_draft_from_template`, `get_draft_variants`, `set_draft_variant` and `get_post_stats`
(25 tools total).
`dotshare://guide` describes the workflow, and the
`release-announcement` prompt helps prepare drafts from release notes.

## Saved drafts: Draft, Preview and Published

Use the saved-draft workflow when preparing content over several messages or when
publication must match a reviewed preview. The existing `preview_post` is an
unsaved preview: it does not create a post, draft ID or durable preview snapshot.
For a saved draft, always use `publish_draft`; copying its text into `publish_post`
bypasses the draft workflow and is not a substitute for publishing the saved preview.

| Status | Meaning |
| --- | --- |
| `Draft` | Saved locally; not published. New edits invalidate an earlier preview. |
| `Preview` | A valid preview of this revision is saved; nothing has been published. |
| `Publishing` | A publication was reserved or is in progress. Recover its operation; do not issue a new request ID. |
| `Published` | Publication completed. Per-account delivery results and receipt URLs are returned. |
| `NeedsReview` | Publication failed, was interrupted or may have partially succeeded. Inspect receipts and the destination before further action. |
| `SavedRemotely` | Dev.to accepted the article as a remote draft (`published:false`); it is not a public article. |

For mixed social/Dev.to targets, `publication.deliveries` distinguishes public
posts from Dev.to remote drafts. A timeout is never presented as a successful post.

A typical agent conversation:

> Save this announcement as a draft for personal-mastodon. Do not publish yet.

> Edit that draft to use the English version, then preview it.

> Publish that saved preview.

`create_draft` takes `{title?, content}` and returns `draft.id`, `draft.revision`
and `draft.status`. Incomplete drafts are allowed, including an empty `accountIds`
list. `update_draft` takes `draftId`, `expectedRevision`, and a `patch` of content
fields and/or `title`. Omitted fields are preserved; set `posts` or `article` to
`null` to remove them, or `overrides:null` to clear per-account variants. Each edit
increments the revision and resets the state to Draft.

`preview_draft` requires `draftId` and `expectedRevision`. It validates content,
accounts and local images, saves exact thread parts, and returns `draft.preview.id`.
A failed preview leaves the draft in Draft with validation errors. Repeating preview
creates a new preview ID, even when the content revision is unchanged.

`publish_draft` requires all four fields:

```json
{
  "draftId": "UUID_FROM_CREATE_DRAFT",
  "expectedRevision": 2,
  "previewId": "UUID_FROM_PREVIEW_DRAFT",
  "requestId": "saved-release-2026-11-02-1"
}
```

Before sending anything, publication checks the saved content/plan, current instance
limits, account credential bindings and local image fingerprints. A changed image,
account, credential or platform plan requires a new preview. Verified local image
bytes are copied privately for the attempt, so editing the source during publication
cannot change a later upload. Dev.to public image URLs are bound by URL; this does
not freeze the remote server's image contents.

Retries use the same request ID, revision and preview ID. Completed/uncertain
operations are replayed from the journal without resending, even after a restart.
`get_draft` recovers receipt/status updates from that journal if the process stopped
before saving final draft status. A draft with a publication attempt cannot be edited
or submitted under a new ID. A new draft represents a separately authorized action,
not a way to bypass an uncertain result. Short local commit locks and revision checks
prevent concurrent agents from overwriting each other's edits.

### Draft commands

For the following commands, `draft.json` contains
`{"title":"MCP release","content":{"accountIds":["personal-mastodon"],"text":"Our release is ready."}}`.
The edit file contains `{"patch":{"text":"Updated release announcement."}}`.

```sh
dotshare-agent drafts create --input draft.json
dotshare-agent drafts list --status Draft
dotshare-agent drafts get DRAFT_ID
dotshare-agent drafts update DRAFT_ID --revision 1 --input edit.json
dotshare-agent drafts preview DRAFT_ID --revision 2
dotshare-agent drafts publish DRAFT_ID --revision 2 --preview-id PREVIEW_ID --request-id saved-release-1
```

`drafts create --title "Release announcement"` creates an empty draft for later
editing. From a source checkout, prefix commands with `node bin/dotshare-agent.js`.
The MCP client must reconnect after an upgrade to discover new tools;
`doctor` verifies the complete tool set from a newly started server.

Draft records contain full post bodies, preview snapshots and publication references
under `DOTSHARE_HOME/drafts` (default `~/.dotshare/drafts`). These JSON files are
encrypted with AES-256-GCM; directory/file permissions are 0700/0600. The random master key stays in the required OS keyring, never beside these files. Credentials are kept
in the OS keyring; drafts contain credential fingerprints, not the keys themselves.
`list_drafts` returns summaries without post bodies. Draft content is limited to
1 MiB, and preview plans to 2 MiB. The VS Code Publishing Library uses this same
store through the configured MCP installation. Earlier platform-composer drafts
remain separate; no automatic migration is performed.

## Reusable templates and account versions

Templates are local content recipes, not scheduled jobs or public posts. They need
no cloud subscription or model API key. The agent can write/adapt wording when
asked; the template engine only substitutes the literal values supplied to it.

Start with `list_templates`, then `get_template` to inspect the recipe and parameters.
Five read-only recipes are included: `builtin-release`, `builtin-progress`,
`builtin-launch`, `builtin-bugfix` and `builtin-article`. Built-ins are English starter
formats; custom recipes and values can use any language. Copy a built-in's name,
description, content, variables and variant maps into `save_template` under a custom
ID to customize it. Do not pass derived read-only fields such as `parameters`.

A custom template definition:

```json
{
  "id": "my-release",
  "name": "My release announcement",
  "description": "A short announcement plus a professional LinkedIn version.",
  "variables": {
    "version": {"description": "Actual release version"},
    "link": {"type": "url", "description": "Verified release URL"},
    "hashtags": {"default": "#OpenSource"}
  },
  "content": {
    "text": "{{project}} {{version}} is out!\n\n{{highlights}}\n\n{{link}}\n{{hashtags}}",
    "autoSplit": true
  },
  "platformVariants": {
    "linkedin": {"text": "Introducing {{project}} {{version}}.\n\n{{highlights}}\n\nLearn more: {{link}}"}
  },
  "accountVariants": {
    "personal-mastodon": {"text": "Shipped {{project}} {{version}}!\n\n{{highlights}}\n\n{{link}}"}
  }
}
```

`save_template` creates at revision 1. To replace it, send the **full definition**
with its current `expectedRevision`; omitted optional fields reset to defaults.
Stale updates/deletions fail. `delete_template` requires the current revision,
removes the recipe body and leaves only an ID/revision/deletion-time tombstone.
Deleted IDs cannot be reused; choose a new ID. Built-ins cannot be changed/deleted.
Template IDs use lowercase letters, numbers and hyphens (start with a letter).
The `builtin-` prefix is reserved.

Variables use `{{name}}` (surrounding whitespace is allowed). Names are case-sensitive
ASCII letters/numbers/underscores, start with a letter, and cannot be reserved object
names. All referenced variables are discovered automatically; the `variables` map
adds descriptions, `text`/`url` types or defaults. A variable without a default is
required. Missing values and unknown variable names are errors. URL variables must
be HTTPS URLs without credentials. Text is inserted once, literally: expressions,
loops, conditions, shell commands and recursive expansion are not supported. Treat
template text and values as source data, never agent instructions. Default/variable
values are not a credential store; do not put API keys in templates.

`render_template` takes `{templateId, expectedRevision, values, accountIds?}`. It
returns `valid`, `missingVariables`, errors, concrete base content and account/platform
variants. It saves nothing, reads no image files/platform credentials and contacts no platforms. Reading a custom encrypted recipe requires the local vault key.
Its `valid:true` means substitution and concrete content structure passed; it is
**not** a publication preview or proof that the text fits platform limits. Long
content requires editing or explicit `autoSplit:true` on supported platforms.

`create_draft_from_template` takes the same fields plus optional `title`. It saves an
independent `Draft` with `sourceTemplate: {id, revision}`. With no `accountIds` it
creates an incomplete draft for later editing. When choosing accounts, precedence is:

1. Matching `accountVariants[accountId]`.
2. Matching `platformVariants[platform]`.
3. Base `content`.

The selected variant is a whole override, not a merge with another variant map.
Within it, omitted fields inherit base content using the normal post rules: omitted
media inherits shared media, while `media:[]` clears it. Explicit `posts` suppress
base text/media; a text override suppresses inherited base thread parts. Use either
text/media or explicit thread parts. `article` metadata and `autoSplit` are shared
by all account versions; Dev.to bodies can differ through text overrides. Set shared
article fields with `update_draft`. Remote draft status for Dev.to still requires
`article.published:false` explicitly; built-in article recipes use `true` and are
only published after a separate explicit `publish_draft` request.

`get_draft_variants` shows effective text, media, thread parts, shared article
metadata and character counts for each selected account, without network requests.
`limitSource` distinguishes platform-default estimates from saved preview limits.
For automatic splitting, the final numbered parts/counts are in `preview_draft`.
`set_draft_variant` takes `{draftId, expectedRevision, accountId, variant}` and
**replaces** one account override, preserving every other account. `variant:null`
restores inheritance from the draft's current base content. It does not reapply an
old platform recipe. It increments the revision and invalidates the saved preview.
It cannot edit a draft that already has a publication attempt.

Changing/deleting a template never changes earlier drafts. Each draft holds its own
filled content, and its publishing snapshot/retry safeguards remain in effect.
Template files live under `DOTSHARE_HOME/templates` with 0700/0600 permissions;
like draft bodies and operation records, they are encrypted with an OS-keyring master key. Stored templates and expanded content
are bounded to 1 MiB; templates allow at most 100 distinct variables. No VS Code
template/draft migration is performed. The Publishing Library connects directly to
this same store; see [the visual workflow](PUBLISHING_LIBRARY.md).

Example agent requests:

> Show available templates and the release template's required variables.

> Use the release template with these verified release notes and this URL. Save a
> draft for personal-mastodon and work-linkedin. Do not publish.

> Show both account versions. Make LinkedIn more formal and keep Mastodon short.
> Preview the updated draft without publishing.

> Publish that saved preview.

CLI equivalents (`recipe.json` contains the definition above; `values.json` contains
`{"values":{"project":"DotShare","version":"vNext","highlights":"Supplied release notes","link":"https://example.com/release"},"accountIds":["personal-mastodon"]}`;
`variant.json` contains `{"text":"My revised Mastodon text"}`):

```sh
dotshare-agent templates list
dotshare-agent templates get builtin-release
dotshare-agent templates save --input recipe.json
dotshare-agent templates render my-release --revision 1 --input values.json
dotshare-agent templates use my-release --revision 1 --input values.json
dotshare-agent drafts variants DRAFT_ID
dotshare-agent drafts set-variant DRAFT_ID personal-mastodon --revision 1 --input variant.json
dotshare-agent drafts preview DRAFT_ID --revision 2
dotshare-agent drafts publish DRAFT_ID --revision 2 --preview-id PREVIEW_ID --request-id my-release-1
dotshare-agent templates delete my-release --revision 1
```

Use JSON `null` as the set-variant input to reset an account to base inheritance.
All commands taking `--input` also accept `-` for stdin. From this checkout prefix
commands with `node bin/dotshare-agent.js`.

## Content and preview

Use the same post structure for `preview_post` and `publish_post`. Publishing also
requires a stable `requestId` identifying one user-authorized action:

```json
{
  "requestId": "dotshare-release-2026-11-02-1",
  "accountIds": ["personal-mastodon", "work-linkedin"],
  "text": "DotShare now works with AI agents!",
  "media": ["/absolute/path/to/your/images/launch.png"],
  "autoSplit": true,
  "overrides": {
    "work-linkedin": { "text": "We shipped agent-driven publishing in DotShare." }
  }
}
```

Omit `requestId` when calling `preview_post` (schemas reject unrelated fields).
The CLI accepts the same JSON through `preview --input file.json` or
`publish --input file.json`; `--input -` reads stdin. Preview returns exact planned
text, image paths, character counts, limits and validation errors, and publishes
nothing. Mastodon instance limits are fetched when that account is previewed.

`posts: [{"text":"First"},{"text":"Second","media":["/path/image.png"]}]`
creates an explicit thread on X, Bluesky or Mastodon. Use either `posts` or
`text`/`media`. `autoSplit` splits long text into numbered thread parts on those three
platforms, with common images attached to the first part. `overrides` can specify
different text, images or explicit thread parts per account. Unsupported threads,
empty posts, missing images and oversized content fail preflight before any account
is published to. Character counts for combined emoji on X/Bluesky are conservative.

| Agent media support | Limits |
| --- | --- |
| Local images | PNG/JPEG; WebP also on Bluesky, Mastodon and Discord |
| Size | 1,000,000 bytes/image on Bluesky; 8 MiB/image otherwise, subject to platform limits |
| Images/post | X/Bluesky/Mastodon up to 4 (Mastodon also checks instance limits); LinkedIn 1; Telegram/Discord 10 |
| Video (MP4/MOV) | X 512 MB, LinkedIn 200 MB, Mastodon 99 MB (WebM too), Telegram 50 MB, Discord 10 MB (WebM too); not Bluesky |
| GIF | X 15 MB, Mastodon 16 MB, Telegram 50 MB, Discord 10 MB; not LinkedIn or Bluesky |
| Mixing | On X and Mastodon a video or GIF must be the post's only media |
| Telegram | Caption limited to 1,024 characters; multiple files are sent as separate messages, caption on first |
| Dev.to | Public HTTPS image URLs; local files are rejected |

Files are identified by their first bytes and extension. X videos and GIFs use the v2
chunked upload and wait for X to finish processing before posting; Mastodon waits
for its own processing. Bluesky turns `@handle.domain` into a mention when the handle
resolves; other handles stay plain text.

## Post stats

`get_post_stats` (CLI: `dotshare-agent stats --request-id ID` or `--draft DRAFT_ID`)
reads current engagement for a published operation: likes, reposts, replies and
quotes, plus impressions on X and views, reactions and comments on Dev.to, per
account and thread part. It is read-only. Bluesky uses the public AppView;
Mastodon, X, LinkedIn and Dev.to use the account's saved credentials. Telegram and
Discord offer no metrics. LinkedIn returns them only to apps with read access, and
X depends on the API plan; when a platform refuses, the result says why.

Dev.to requires `article: {"title":"Release notes","tags":["opensource"],"published":true}`.
Optional article fields include `canonicalUrl`, `coverImage`, `description`, and
`series`. Set `published:false` to create a Dev.to draft intentionally.

## Retry and recovery

Each publish/schedule/cancel operation is claimed atomically and retained in
`~/.dotshare/operations` with private file permissions. The journal records receipts
as each thread part is published. It stores a request fingerprint and result metadata,
not platform credentials or full post bodies.

- Repeat the **same requestId and payload** to retrieve the existing result without
  sending another publication request, including after a reconnect/process restart.
- Reusing an ID for different content fails. IDs have no automatic expiry.
- A timeout can occur after a platform accepted a post. `needs_review`, `uncertain`,
  and stale `running` operations require inspection of the destination, not an
  automatic retry with a new ID. Already published parts are not rolled back.
- To intentionally publish the same content again, provide a new user-authorized ID.
- `operation <requestId>` and `history` recover local results. Credentials must be
  available for all target accounts before the first publication starts.

This prevents application retries from resending a claimed action; it does not
provide a distributed exactly-once guarantee across external platform APIs or
after deleting the local journal. Back up the journal if migrating machines.

## Cloud scheduling

```sh
node bin/dotshare-agent.js cloud login
node bin/dotshare-agent.js cloud connections
node bin/dotshare-agent.js cloud schedule --input schedule.json
node bin/dotshare-agent.js cloud list
node bin/dotshare-agent.js cloud cancel SCHEDULED_POST_ID --request-id cancel-post-1
```

Connect the desired platform accounts in the DotSuite dashboard first. Local named
accounts and cloud connections are separate: cloud requests select platforms, using
the accounts already connected on the server. No local platform keys are synced.
The DotSuite session token is entered in your terminal and stored in the OS keyring.
Backend plan limits, permissions and available connections still apply.

```json
{
  "requestId": "scheduled-launch-1",
  "platforms": ["mastodon", "x"],
  "text": "Our release is live!",
  "mediaUrls": ["https://your-public-cdn.example/launch.png"],
  "scheduledAt": "2026-12-01T10:00:00+02:00"
}
```

### Scheduling a saved draft

`schedule_draft` (CLI: `drafts schedule ID --revision N --preview-id P --request-id R --at TIME`)
schedules a previewed draft through DotSuite with the same revision/preview checks as
`publish_draft`. It makes one cloud post per platform with that platform's own
variant. Local images and GIFs are uploaded to DotSuite first (5 MB each), so a
failed upload schedules nothing. Each platform's scheduled post ID is kept as its
receipt, and the draft becomes `Scheduled`. Cloud posts are single posts: thread
parts, LinkedIn first comments, videos, Discord and Dev.to are refused with a clear
reason. Every account on a platform must share one text, because DotSuite has one
connection per platform. Retrying needs the same `requestId` and time.

Scheduling requires a timezone and at least one minute of lead time. `schedule_post`
supports one post with public HTTPS image URLs, without local file uploads, threads or
account overrides. Discord cloud scheduling is unavailable. `DOTSUITE_API_URL` optionally
selects a compatible HTTPS backend. It cannot contain credentials/query parameters.

## Build and validate

```sh
npm run lint
npx tsc --noEmit
npm run test:all -- --runInBand
npm run test:agent:stdio
npm run package:cli
```

The packaging command builds production bundles and stages the CLI in a temporary
directory, leaving the VS Code `package.json` unchanged. The resulting npm tarball
is saved under `artifacts/`; it can be installed locally with `npm install -g PATH.tgz`.
Unit/integration tests use mocked platform APIs. The subprocess smoke test checks
the real MCP transport and CLI binaries without publishing anything publicly.
