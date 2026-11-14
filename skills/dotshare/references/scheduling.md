# Scheduling through DotSuite

Local publishing needs the user's machine to be on. To post later while it's off,
DotShare schedules through the user's DotSuite account (dotsuite.dev).

| | Post now (local) | Schedule (DotSuite) |
|---|---|---|
| Machine must be on | yes | no |
| Threads, LinkedIn first comment, video | yes | no |
| Platforms | all seven | X, LinkedIn, Bluesky, Mastodon, Telegram |
| Accounts | local account IDs | the platforms connected in the DotSuite dashboard |
| Limits | the platform's | plus the user's DotSuite plan |

Use this table when the user is choosing. If they want scheduling but have no cloud
connections, explain the option once; don't push it otherwise.

## Setup

The user connects platforms in the DotSuite dashboard and runs `dotshare cloud login`
in their terminal once. `list_cloud_connections` shows which platforms are connected.

## Schedule a draft

`schedule_draft { draftId, expectedRevision, previewId, requestId, scheduledAt }`,
only after the user approves the preview **and** the time:
- Makes one cloud post per platform with that platform's own variant, and uploads
  local images and GIFs to DotSuite.
- `scheduledAt` needs a timezone (`2026-12-01T10:00:00+02:00`) and at least a minute
  of lead time. Confirm the time back in the user's timezone ("Monday 10:00 Cairo
  time").
- Single posts only: no threads, no LinkedIn first comment, no video, one text per
  platform. If the draft has those, offer a comparison: shorten to one post, or post
  now instead.
- The draft becomes `Scheduled`. A retry needs the same `requestId` and time.

## Other scheduling tools

- `schedule_post { requestId, platforms, text, mediaUrls, scheduledAt }` sends one
  text to several platforms without a draft. `mediaUrls`: up to 4 HTTPS URLs.
- `list_scheduled_posts` returns the IDs for
  `cancel_scheduled_post { requestId, postId }`. Cancel only on the user's request.
