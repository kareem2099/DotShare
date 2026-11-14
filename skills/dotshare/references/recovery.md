# Timeouts, failures and duplicates

Every publish, schedule and cancel is recorded on disk by its `requestId`. That
record is how you find out what happened without posting twice.

| What happened | Do | Never |
|---|---|---|
| Timeout or disconnect | `get_operation { requestId }`, or retry with the **same** `requestId` and content: it returns the existing result without posting again | retry with a new ID |
| `needs_review` / `NeedsReview` / a `running` that stays | show the user which parts went out (their links) and ask them to check those accounts | retry, or start a new ID on your own |
| Error before publishing (preview errors, missing credentials, budget) | fix the cause, preview again, ask again | publish without a new preview |
| Some accounts posted, one failed | report each account; offer to post only the failed one, as a new draft for that account | re-post to the accounts that succeeded |
| Reusing an ID with different content | it fails by design; use a new ID only for a new approved action | change the ID to force it through |

After a restart, `list_history` and `list_drafts` show what happened.

Posting the same content again on purpose needs a new `requestId` **and** the user's
explicit request.

When you explain a failure, say what was posted, what wasn't, and the one next step.
Give technical detail (operation status, request ID) only if the user wants it.
