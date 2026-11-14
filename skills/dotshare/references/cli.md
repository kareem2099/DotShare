# Using the CLI when there are no MCP tools

If you can run commands but the DotShare MCP tools aren't connected, the `dotshare`
CLI does the same draft → preview → publish flow with the same safety checks. Every
command prints JSON (a log line may come first). The approval rules don't change:
show the preview and wait for a clear yes before `publish` or `schedule`.

| Step | Command |
|---|---|
| Accounts | `dotshare accounts list` |
| Save a draft | `dotshare drafts create --input draft.json` |
| Edit it | `dotshare drafts update <draftId> --revision N --input patch.json` |
| One account's version | `dotshare drafts set-variant <draftId> <accountId> --revision N --input variant.json` |
| See each account's text | `dotshare drafts variants <draftId>` |
| Preview | `dotshare drafts preview <draftId> --revision N` |
| Publish (after approval) | `dotshare drafts publish <draftId> --revision N --preview-id P --request-id R` |
| Schedule (after approval) | `dotshare drafts schedule <draftId> --revision N --preview-id P --request-id R --at 2026-12-01T10:00:00+02:00` |
| Read / list drafts | `dotshare drafts get <draftId>` / `dotshare drafts list` |
| What happened | `dotshare operation <requestId>` / `dotshare history` |
| Stats | `dotshare stats --request-id R` or `--draft <draftId>` |

Files:
- `draft.json`: `{ "title": "…", "content": { …the content fields in tools.md… } }`
- `patch.json`: `{ "patch": { "text": "…" } }` (and/or `"title"`)
- `variant.json`: `{ "text"?, "media"?, "posts"?, "firstComment"? }`, or `null` to reset

Notes:
- `--revision` is required on every command that reads or changes a revision: take
  it from the last output.
- Local images need `DOTSHARE_MEDIA_ROOTS` set to the allowed folders (absolute
  paths, separated by `:` on Linux and macOS, `;` on Windows) in the environment that
  runs the command.
- Write the JSON files with a real JSON encoder, not `echo`, so newlines and quotes in
  posts survive.
