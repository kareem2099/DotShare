# The DotShare agent skill

The DotShare skill teaches your AI agent to write strong posts for every platform and
to publish them the safe way: a draft, a preview you can read, and nothing public
until you say so. It works with any agent that reads skills, on any model, and setup
installs it for you.

## What your agent does with it

| Without the skill | With the skill |
|---|---|
| Generic text, the same on every platform | A native shape per platform: a thread on X and Bluesky, one rich post on LinkedIn with the link in the first comment, CamelCase hashtags on Mastodon |
| Long explanations, or none | Talks at your level: just the result if you want it done, what each step does if you ask how it works |
| Choices buried in paragraphs | Choices side by side in a small table, with a recommendation first: thread or single post, post now or schedule, where the link goes |
| Previews as walls of text | One summary row per account (format, length, media, cost), then the exact text |
| Might promise what DotShare can't do | Says up front what isn't possible, such as replying to other people's posts |
| Guesses after a timeout | Checks what went out before doing anything, and never posts twice |

It also brings the details agents usually get wrong: each platform's character and
media limits, Dev.to article metadata, the X budget when X posts go through DotSuite,
and how to recover a post that timed out.

## Install it

The skill comes with `dotshare-cli`. Setup installs it where your agent loads skills,
along with the MCP server:

```sh
npm install -g dotshare-cli
dotshare-agent setup                         # Codex
dotshare-agent setup --client claude         # Claude Code
dotshare-agent setup --client cursor         # Cursor
dotshare-agent setup --client antigravity    # Antigravity
```

| Agent | Skill location |
|---|---|
| Claude Code | `~/.claude/skills/dotshare` |
| Codex | `~/.codex/skills/dotshare` (or `$CODEX_HOME/skills/dotshare`) |
| Cursor | `~/.cursor/skills/dotshare` |
| Antigravity | `~/.gemini/config/skills/dotshare` |

**Any other agent:** the skill is a standard `SKILL.md` folder (the open Agent Skills
format), so point setup at the directory your agent reads skills from:

```sh
dotshare-agent setup --client generic --skills-dir ~/.agents/skills
```

`--client generic` also prints the MCP server entry to add to your agent. Start a new
agent session afterwards so it loads the skill.

## Keep it up to date

Run `setup` again after you upgrade `dotshare-cli`. It replaces the old copy of the
skill as a whole, in one step. To check it, run doctor with the same client:

```sh
dotshare-agent doctor --client claude
```

Doctor warns when the skill is missing, from another DotShare version, or replaced by
a different skill with the same name.

## Your own skill named dotshare

If you already have a different skill named `dotshare`, setup keeps it and tells you.
`--replace` replaces it and saves a backup in `~/.dotshare/skill-backups`, outside
your agent's skills folder so it isn't loaded twice. A symlinked skill is never
written through, and `--no-skill` skips the skill entirely.

## What's inside

`SKILL.md` stays short: how to talk to you, how to compare options, the workflow and
the safety rules. The agent opens the rest only when it needs it:

| File | Covers |
|---|---|
| `references/writing.md` | Hooks, the best shape for each platform, style rules, a worked example of one source adapted everywhere, Dev.to articles, other languages |
| `references/platforms.md` | Text and media limits per platform, and what X costs through DotSuite |
| `references/tools.md` | The exact fields of every DotShare tool |
| `references/scheduling.md` | Posting later through DotSuite, and what can't be scheduled |
| `references/recovery.md` | Timeouts, partial failures and duplicates |
| `references/setup.md` | Setup, accounts and images |
| `references/cli.md` | The same workflow with terminal commands, when MCP isn't connected |

The limit tables are checked against DotShare's code by a test, so they change when
the code does. Read the skill on
[GitHub](https://github.com/kareem2099/DotShare/tree/master/skills/dotshare).

For the full CLI and MCP reference, see [Set up the CLI and MCP](AGENT_INTEGRATION.md).
