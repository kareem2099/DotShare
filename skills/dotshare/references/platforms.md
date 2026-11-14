# Platform limits

Preview enforces all of these, so you don't need to count perfectly, but writing
within them avoids a round of fixes. `list_accounts` returns each account's
capabilities, and a Mastodon account's limits come from its own instance.
A test keeps these tables in sync with DotShare's code.

## Text and threads

| Platform | Text limit | Threads | Media per post | Notes |
|---|---|---|---|---|
| X | 280 | yes | 4 | URLs count as 23 characters. |
| Bluesky | 300 | yes | 4 | Links, #hashtags and @handle.domain mentions become clickable; unknown handles stay plain text. |
| Mastodon | 500 | yes | 4 | 500 is the default; the instance's own limit applies. URLs count as 23. |
| LinkedIn | 3000 | no | 1 | `firstComment` up to 1250 characters, posted right after. |
| Telegram | 4096 | no | 10 | 1024 as a caption with media; extra images go as separate messages. No Markdown. |
| Discord | 2000 | no | 10 | Renders Markdown. |
| Dev.to | 100000 | no | 50 | Markdown article; images must be public HTTPS URLs. Needs `article` metadata. |

Dev.to `article`: `title` ≤128, `tags` ≤4 (lowercase letters and digits),
`description` ≤500, `series` ≤100, optional `canonicalUrl` and `coverImage`
(HTTPS), `published` (false saves a Dev.to draft).

## Media sizes

Local files only (inside the media folders allowed at setup), checked by their
content, not their extension. Sizes in MB are MiB (1 MB = 1,048,576 bytes).

| Platform | Images (PNG, JPEG) | WebP | GIF | Video (MP4, MOV) | WebM |
|---|---|---|---|---|---|
| X | 8 MB | no | 15 MB | 512 MB | no |
| Bluesky | 1,000,000 bytes | yes | no | no | no |
| Mastodon | 8 MB | yes | 16 MB | 99 MB | yes |
| LinkedIn | 8 MB | no | no | 200 MB | no |
| Telegram | 8 MB | no | 50 MB | 50 MB | no |
| Discord | 8 MB | yes | 10 MB | 10 MB | yes |

On X and Mastodon a video or GIF must be the post's only media. Changing a file after
preview needs a new preview.

## X through DotSuite: what it costs

X charges for every post made through DotShare's X app, so an X account connected
through DotSuite has a monthly X budget on the user's plan. It works like a card
payment:

1. **Held:** preview shows the most the posts can cost, for example "up to $0.215 …
   will be held for 2 post(s), 1 with a link", and how much of the month's budget
   will be left at least. A post the budget can't cover is refused before anything
   is sent.
2. **Charged:** after posting, the user pays what X actually deducted, and the rest
   of the hold goes back to the budget. Replies often cost less than the hold.

What to tell the user, before they approve: the "up to" amount in one short line.
Only go into how the hold works if they ask.

Saving budget, if they ask: a link makes a post cost much more to hold (about 13
times a plain post), so offer, as a comparison, to keep the link out of the first
post or leave it out. Don't change where the link goes without asking.

X through DotSuite supports images and GIFs, not videos, and post stats aren't
available for those accounts. Only one X account per request can post through
DotSuite.
