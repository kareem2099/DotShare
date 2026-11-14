# Tool reference

## Contents
- Content fields
- Drafts
- Quick path
- Templates
- History and stats

## Content fields

Used by `create_draft` (under `content`), `preview_post` and `publish_post`:

```
{
  accountIds: ["work-x", "work-linkedin"],     // 1–20 IDs from list_accounts
  text: "…",            media: ["cover.png"],  // a single post, or…
  posts: [{ text, media }, …],                 // …explicit thread parts (X, Bluesky, Mastodon)
  autoSplit: false,     // true: split long `text` into numbered parts mechanically
  firstComment: "…",    // LinkedIn only, ≤1250: posted right after, e.g. the link
  overrides: { "<accountId>": { text?, media?, posts?, firstComment? } },
  article: { title, tags, published, description?, series?, canonicalUrl?, coverImage? }  // Dev.to
}
```

Use either `posts` or `text`/`media`, not both. Prefer `posts` when you wrote the
thread; `autoSplit` only for long text the user wants split as is. Media paths are
local files inside the allowed media folders (relative paths are looked up there);
Dev.to takes public HTTPS image URLs.

## Drafts

| Tool | Does | Publishes? |
|---|---|---|
| `create_draft { title, content }` | saves a draft; returns `draftId`, `revision: 1` | no |
| `get_draft { draftId }` / `list_drafts` | reads drafts, their status and receipts | no |
| `update_draft { draftId, expectedRevision, patch }` | edits the base content; bumps the revision | no |
| `set_draft_variant { draftId, expectedRevision, accountId, variant }` | per-account text, media, thread or first comment; `variant: null` resets it | no |
| `get_draft_variants { draftId }` | the effective content and character counts per account | no |
| `preview_draft { draftId, expectedRevision }` | validates every account; returns `previewId`, or errors | no |
| `publish_draft { draftId, expectedRevision, previewId, requestId }` | posts exactly that preview, once | **yes** |

Draft statuses: `Draft` → `Preview` → `Published` (public), `SavedRemotely` (a Dev.to
draft), `Scheduled`, or `NeedsReview` (see recovery.md). `Published`, `Publishing`
and `NeedsReview` drafts can't be edited.

`requestId`: one per approved action, letters, digits, `.`, `_`, `-`, up to 100
characters, for example `launch-2026-11-11-1`. Reuse it only to retry the same action.

## Quick path

`preview_post { …content }` checks a one-off post without saving it. After approval,
`publish_post { …same content, requestId }`. Never copy a saved draft into
`publish_post` to get around its revision checks.

## Templates

For repeated formats (release notes, weekly updates):
1. `list_templates`, then `get_template { templateId }` for its variables.
2. `render_template { templateId, expectedRevision, values, accountIds }` to try
   values. It doesn't save, publish or contact any platform.
3. `create_draft_from_template` with the same fields (plus an optional `title`), then
   continue with the normal draft workflow.

Built-in, read-only: `builtin-release`, `builtin-progress`, `builtin-launch`,
`builtin-bugfix`, `builtin-article`. To customize one, `save_template` a copy under a
new ID. Updating a custom template needs its `expectedRevision`; `delete_template`
only on the user's request. A missing variable is an error: ask the user, never fill
in facts or URLs.

## History and stats

- `list_history` lists recent publish, schedule and cancel operations;
  `get_operation { requestId }` reads one.
- `get_post_stats { requestId }` or `{ draftId }`: likes, reposts, replies and quotes
  for something already published, per account and thread part, plus impressions on X
  and views, reactions and comments on Dev.to. Read-only. Telegram and Discord have no
  metrics; LinkedIn and X may refuse depending on the app's access, and X accounts
  through DotSuite have none. Numbers change, so say when they were checked.
- Present stats as one small table per post, best-performing first, and only the
  columns that have numbers.
