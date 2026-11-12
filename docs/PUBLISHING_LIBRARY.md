# Publishing Library

The VS Code Publishing Library works with the **same saved drafts and templates**
as the DotShare MCP server and CLI. Start in an agent conversation and continue
editing the same draft in VS Code, or create a draft visually and ask your agent
to edit/preview it. There is no second copy to synchronize.

## Open it

1. Install CLI 3.0.0 and connect a named account using the [agent setup guide](AGENT_INTEGRATION.md#install-and-set-up).
2. Install DotShare 3.7.0 in VS Code. To install from GitHub, download the
   [VSIX](https://github.com/kareem2099/DotShare/releases/download/v3.7.0/dotshare-3.7.0.vsix)
   and run `code --install-extension ./dotshare-3.7.0.vsix`.
3. Run **DotShare: Open Publishing Library** from the Command Palette, or click
   **Open Publishing Library** in the DotShare sidebar. Platform composers also
   have a library navigation button.

For development, run `npm run compile`, register the local launcher with
`node bin/dotshare-agent.js setup`, and press F5 in this repository.

DotSuite sign-in is not required for this local library. The UI launches the same
local MCP server configured in `CODEX_HOME/config.toml` or `~/.codex/config.toml`,
using its absolute Node/launcher paths, working directory, home, media allowlist
and forwarded desktop session. A different config file can be selected with the
machine setting **DotShare › Library: Client Config Path**. This supports the local
stdio configuration written by `setup`, not a remote MCP URL or arbitrary shell
launcher. The matching CLI/source installation must remain available separately;
the extension does not install or duplicate its credential store.

If the connection fails, use **Settings** to check the config path, run
`dotshare-agent doctor`, then click **Reconnect**. Reconnect after changing setup
or library settings. Your configured `enabled_tools`, `disabled_tools` and per-tool
`enabled:false` policies are honored. A disabled publishing tool is not bypassed
through another publication path.

## Drafts

To try the shared workflow, ask your agent to save a draft for a named account.
Open that draft in the library, select **Prepare preview**, review the exact text
and account, then select **Publish this saved preview** when ready. Check the draft for
`Published` and its saved receipt. A preview stays private until you publish it.

- Open a saved draft, or click **New draft**. New drafts are saved immediately.
- Select local account IDs and edit the shared message. Use **Choose images** for
  local files, or enter public HTTPS image URLs for Dev.to. Selecting a file does
  not upload it or broaden the existing image allowlist. The publishing preview
  checks allowed directories, image formats and limits.
- Use **Write an explicit thread** to add/remove/reorder parts and their images,
  or enable automatic splitting for supported platforms.
- **Dev.to article details** contains shared article metadata and the explicit
  public-article/remote-draft choice.
- **Save changes** (also Ctrl/Cmd+S for shared draft edits) commits the current
  revision. Unsaved edits are marked and block preview/publication.
- **Account versions** shows effective content for each target. Customize one
  account or reset it to the current shared content. Saving an account version
  preserves the other accounts and invalidates the old preview.

Shared text/article edits and account-version edits are separate save actions.
While editing an account version, the shared editor is temporarily inactive so
one save cannot silently discard changes in the other editor.

## Preview and publication

**Prepare preview** uses `preview_draft`, saving the exact target text/thread parts,
character counts, account bindings and image fingerprints. Preview shows attachment
paths/URLs; it does not upload files or load remote image previews. Check every
target before clicking **Publish this saved preview**.

The button publishes the exact saved revision and preview ID through
`publish_draft`. The UI persists one stable request ID before sending, so reloading
the view does not create another publication action. It never automatically retries
an interrupted publication and never uses `publish_post` to bypass draft checks.

- **Draft / Preview:** saved locally; not public.
- **Published:** publication completed; each target has its own receipt/URL.
- **SavedRemotely:** Dev.to accepted a remote draft; it is not public.
- **Publishing / NeedsReview:** inspect the saved outcome and destination accounts.
  Already published parts and their receipts are preserved. The UI offers
  **Check saved outcome**, not a fresh publication request.

Drafts with publication attempts are read-only. Receipt links use the existing
safe HTTP/HTTPS opener and respect VS Code's refusal to open them.

## Templates

The **Templates** tab lists built-ins and custom recipes. Fill the required values,
choose accounts and use **Test fill** to inspect literal substitution without saving
or publishing. **Create saved draft** stores an independent draft and opens it for
review. Required values, HTTPS URL types and revision checks are enforced by the
same MCP template engine used by your agent.

**New template**, **Edit template** and **Save a custom copy** expose shared text,
platform text variants, detected variables, descriptions/defaults and HTTPS types.
Advanced sections support image/thread/article fields and account-specific recipes
as JSON. Built-ins stay read-only; custom copies use a new ID. Deleting a recipe
does not change any previously created draft.

## Changes made elsewhere

The library watches its local draft/template/operation folders and refreshes after
external saves and when the panel is revealed. **Refresh** is also available.
If there are unsaved edits, it keeps them and shows a change banner. Saving against
an outdated revision fails without overwriting the other editor's changes. Choose
**Discard edits and reload** to explicitly load the newer version. Switching items
also requires saving/discarding unsaved changes.

Lists display up to 100 items per section; search/status filters apply to the loaded
items. The library location is available in the sidebar for diagnosing mismatched
installations. The webview retains unsaved form state while hidden; closing it
discards unsaved form edits. Full post bodies are not copied into webview persistence.

## Earlier platform drafts and keys

Earlier extension drafts in VS Code global state stay available under **Earlier
Platform Drafts** in each platform composer. They are not silently moved, deleted
or merged. New shared drafts are created/opened in Publishing Library.

The library never copies extension credentials into the agent keyring or vice
versa. It uses named local agent accounts already configured with `accounts add`.
Platform credentials stay in the required OS keyring. Shared draft, custom template and operation records are encrypted with AES-256-GCM and a separate OS-keyring master key. Run `dotshare-agent security protect` to migrate earlier plaintext records, then reconnect the library. An unlocked keyring is required to open/save shared records. Earlier platform-composer drafts remain in VS Code global state and are outside this shared-store encryption change. Dotenvy and the separate cloud backend are not changed; see [the security model](../SECURITY.md).

## Development verification

```sh
npm run compile
npm run lint
npx tsc --noEmit
npx tsc -p media/library/tsconfig.json
npm run test:all -- --runInBand
node scripts/verify-library.cjs
```

`verify-library.cjs` runs the real library client against an isolated stdio server
and checks cross-process CLI edits, revisions, previews, receipts, partial failures
and replay protection. All accounts/adapters are test fixtures; no real platform is
contacted. For browser layout/manual interaction checks, run
`node scripts/preview-library.cjs` and open its loopback URL. This disposable preview
uses only fake accounts and deletes its temporary store on shutdown. It is not a
production HTTP publishing server.
