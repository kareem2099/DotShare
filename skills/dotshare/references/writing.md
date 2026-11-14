# Writing posts that work

The user chose DotShare to get good posts with little effort. Your job is to turn
their material into posts people stop for, on each platform, without inventing
anything.

## Contents
- Before you write
- Hooks
- Shapes by platform
- Style rules
- One source, every platform (worked example)
- Dev.to articles
- Other languages
- Checklist before preview

## Before you write

Answer three questions from the user's material. Ask only if you can't:
1. **What's the one thing a reader should take away?** One sentence. Everything else
   supports it or gets cut.
2. **Who reads it?** Developers, users of the product, recruiters on LinkedIn, the
   user's own community. It decides the vocabulary.
3. **What should they do next?** Read the article, try the release, star the repo,
   reply. One call to action, at the end.

Then collect the concrete facts: names, version, what changed, numbers, the link. If
the post needs a fact that isn't in the material (a URL, a version, a result), ask
for it. Never fill it in.

## Hooks

The first line decides whether anyone reads the rest. On X and Bluesky it's all
people see in the feed; on LinkedIn it's the text before "…see more".

Strong openers, in rough order of how often they work:
- **The result:** "Tidewater now works offline, and syncs without asking who wins."
- **The problem, sharply:** "Most clipboard managers treat a password like any
  other text."
- **A surprising fact from the material:** "The reply cost $0.01. We charged $0.20."
- **A before/after:** "Sign-in used to take three screens. Now it's one tap."
- **A question only if the post answers it right away.**

Avoid: "I'm excited to announce", "Big news!", "In today's fast-paced world",
"Let's dive in", "Thread 🧵👇" as the whole first line, and a hook the post doesn't
deliver on.

## Shapes by platform

| Platform | Best shape | Link | Hashtags | Formatting |
|---|---|---|---|---|
| X | Hook post plus 2–5 replies, or one sharp post | last part (on DotSuite it costs more: see platforms.md) | 1–2, at the end | plain text |
| Bluesky | Like X, up to 300 per part | last part; links become clickable | 1–3, inline or at the end | plain text |
| Mastodon | One rich post (500 by default), a thread only for long stories | in the post | 3–5, CamelCase (#OpenSource), at the end | plain text |
| LinkedIn | One post: hook, 3–6 short paragraphs, takeaway | `firstComment`, not the body | 3–5 at the end | plain text, line breaks |
| Telegram | One message; a caption with an image is ≤1,024 | in the message | 0–2 | plain text, no Markdown |
| Discord | One message for the community | in the message | none | Markdown, code blocks |
| Dev.to | A full article (see below) | inline Markdown links | 4 tags in `article.tags` | Markdown |

**Threads (X, Bluesky, Mastodon):**
- Part 1 is the hook and must work alone. Add "🧵" or "1/4" only if it helps.
- One idea per part. Each part makes sense if someone sees it alone.
- Never split a sentence across parts. Stay ~10% under the limit so small edits fit.
- The last part carries the payoff: the link, the call to action, the hashtags.
- 3–5 parts is usually right. A 12-part thread loses most readers by part 4.
- Put the image on part 1, where it earns the click.

**LinkedIn:** write for people who don't follow the project. Lead with the outcome
or the lesson, explain why it matters in plain words, give one or two concrete
details, end with a takeaway or a question. Short paragraphs (1–3 lines). The link
goes in `firstComment`, which DotShare posts right after.

## Style rules

- **Specific beats impressive.** "Startup went from 4.1 s to 0.9 s" beats "blazing
  fast". Use the user's real numbers only.
- **Plain words, active voice.** "DotShare now schedules drafts", not "Scheduling
  functionality has been introduced".
- **Cut hype:** revolutionary, game-changing, seamless, cutting-edge, supercharge,
  unleash, robust, leverage. Say what it does instead.
- **Emoji: at most one or two**, and only where they carry meaning (→ or ✅ as list
  markers are fine). None on LinkedIn headlines unless the user uses them.
- **Hashtags are for discovery, not decoration.** Use the ones the user's
  community actually follows, and keep them at the end.
- **Code, commands and file names** in backticks only on Discord and Dev.to. On other
  platforms write them plainly: `npm install -g dotshare-cli` becomes
  npm install -g dotshare-cli.
- **No walls of text.** Line breaks between ideas, lists with → or •.
- **Credit and accuracy:** don't claim "first", "only" or "fastest" unless the
  material proves it. Name contributors the user names.

## One source, every platform

Source (the user's changelog): *"Tidewater 2.0: offline sync, conflicts resolved by
field, 40% smaller app. https://example.com/tidewater-2"* (a made-up example: use
the user's real material).

**X (thread):**
1. Tidewater 2.0 works offline. Edit anywhere, and it syncs when you're back, without a "which version wins?" dialog.
2. Conflicts are resolved per field, not per record. If you changed the title and I changed the date, both changes stay.
3. And the app is 40% smaller.
4. What changed and how it works: https://example.com/tidewater-2 #OpenSource

**LinkedIn (one post, link in `firstComment`):**
> Tidewater 2.0 works offline.
>
> The hard part of offline sync isn't storing changes. It's merging them. Most apps
> pick a winner per record, so someone's edit disappears.
>
> Tidewater merges per field instead: if you changed the title and a teammate changed
> the date, both survive. And the app got 40% smaller on the way.
>
> The full write-up is in the first comment.
>
> #OfflineFirst #MobileDev #OpenSource

**Mastodon (one post):**
> Tidewater 2.0 is out, and it works offline.
>
> → Syncs when you're back, no "which version wins?" dialog
> → Conflicts are merged per field, so nobody's edit disappears
> → 40% smaller app
>
> https://example.com/tidewater-2
>
> #OpenSource #OfflineFirst #MobileDev

Same facts, three native shapes. In DotShare: the base content is the most common
shape, and each other account gets a variant (`set_draft_variant`).

## Dev.to articles

- **Title** (≤128 characters): specific and honest about what the reader gets.
  "Charging for X posts like a card payment" beats "My journey with billing".
- **Description** (≤500): one or two sentences shown in the feed and in search.
- **Tags**: up to 4, lowercase letters and digits only (`rust`, `opensource`).
- **Series**: reuse the user's existing series name exactly for multi-part posts.
- **Canonical URL**: set it when the article was first published elsewhere.
- **Structure that works:** a short intro with the problem or the hook → what
  changed or what you built → how it works, with real code or commands → what broke
  and what you learned → results, tests or numbers → "Try it" with links.
- **Code blocks with a language** (```rust), short and real. No pseudo-code
  pretending to be the real thing.
- **AI disclosure:** if you drafted most of the article, suggest a one-line note at
  the end (for example "I used AI assistance to write this; the details come from the
  shipped code"). Dev.to's guidelines ask for it.
- Save it with `published: false` first unless the user said to publish. Then the
  user can read it on Dev.to and click Publish themselves.

## Other languages

- Write natively in the post's language: don't translate idioms word for word.
- Keep product names, commands and code in their original form.
- Hashtags can be in the post's language when the community uses them, or in
  English for a technical audience. Ask once if it's unclear, then remember.
- For right-to-left languages (Arabic, Hebrew), keep a URL or code on its own line so
  it doesn't jumble the text around it.

## Checklist before preview

- [ ] The first line works alone and tells the reader why to care.
- [ ] Every fact, number and link comes from the user's material.
- [ ] Each platform has its native shape; LinkedIn's link is in `firstComment`.
- [ ] Each thread part stands alone; no sentence is split across parts.
- [ ] Hashtags are few, relevant and at the end; no hype words.
- [ ] The call to action is one clear thing, at the end.
