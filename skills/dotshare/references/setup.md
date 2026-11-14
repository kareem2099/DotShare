# Setup and accounts

If the DotShare tools (`list_accounts`, `create_draft`, `preview_draft`, …) are
missing, DotShare isn't connected. The user runs these in **their own terminal**.
Never ask for keys or tokens in chat.

```sh
npm install -g dotshare-cli          # Node.js 22.12+, an unlocked OS keyring
dotshare-agent setup --media-root /absolute/media/dir                     # Codex (default)
dotshare-agent setup --client claude --media-root /absolute/media/dir     # Claude Code
dotshare-agent setup --client cursor --media-root /absolute/media/dir     # Cursor
dotshare-agent setup --client antigravity --media-root /absolute/media/dir   # Antigravity
dotshare-agent setup --client generic --skills-dir ~/.agents/skills       # any other MCP client
```

Give the user only the line for their client. `setup` registers the MCP server and
installs this skill where the client loads skills (`--skills-dir` for any other
agent). After an upgrade, `setup` again updates both; then they reconnect the client
or start a new session to see new tools.

## Accounts

```sh
dotshare-agent accounts connect work-linkedin --platform linkedin   # LinkedIn or X: sign in in the browser
dotshare-agent accounts add team-tg --platform telegram             # others: hidden prompts
dotshare-agent doctor --check-accounts
```

- `accounts connect` opens the browser; there's nothing to copy, and X sign-ins renew
  themselves. When X is connected **through DotSuite** (the account's credentials are
  only `via: dotsuite`), the X token stays on DotSuite and X posts count against the
  plan's X budget (see platforms.md); `dotshare cloud login` is required.
- `accounts add` asks, with hidden input: Mastodon `instance`, `accessToken`; Bluesky
  `identifier`, `password` (an app password); Telegram `botToken`, `chatId`; Discord
  `webhookUrl`; Dev.to `apiKey`. Everything is stored in the OS keyring.

## Images

Local images work only from folders allowed at setup. "Local images are disabled"
or "outside DOTSHARE_MEDIA_ROOTS" means the user should run setup again with
`--media-root /absolute/folder` (it keeps the folders already allowed), then
reconnect. Relative paths are looked up inside those folders.

## When something's wrong

Have the user run `dotshare-agent doctor` with the same `--client` and read its
suggested fixes back in plain words, one at a time, most important first. Doctor
never publishes or changes settings.
