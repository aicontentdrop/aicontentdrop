---
name: canvas-board
description: Plan and render content on an AI Content Drop board (visual canvas) from an agent. Covers picking or creating a board, laying out text, media and generation cards, quoting with estimate_credit_cost before run_generation_card, asking once per task how spending is approved, never tracking the board revision yourself, the get_canvas_link fallback for hosts that cannot render the board inline, and the REVISION_CONFLICT, CARD_BUSY and CANVAS_FULL refusals. Use when asked to plan a campaign visually, put ideas or assets on a board, or render the cards on one.
license: MIT
metadata:
  homepage: https://aicontentdrop.com/docs/mcp
  catalogue: https://aicontentdrop.com/v1/models
  repository: https://github.com/aicontentdrop/aicontentdrop
---

# Planning and rendering on a board

A board is the Visual Canvas on AI Content Drop: cards on an infinite surface,
shared between the person's browser and every agent on the account. The board
tools are `list_canvases`, `create_canvas`, `get_canvas`, `rename_canvas`,
`get_canvas_link`, `add_text_card`, `add_media_card`, `add_frame`,
`add_generation_card`, `connect_cards`, `update_card`, `move_cards`,
`arrange_cards`, `group_cards`, `run_generation_card` and `refresh_canvas`. They appear on
`tools/list` where the board surface is enabled and every one of them needs a
sign-in, because a board is account data. If they are absent, say so and stop.

Exactly one of them spends credits: `run_generation_card`. Everything else
costs nothing, however many cards you add.

## 1. Pick the board

`list_canvases` returns the account's boards, newest first, with `id`, `name`,
`revision`, `card_count` and `link`. Reuse a board whose name matches the task;
otherwise `create_canvas` with a short name the person would recognise. Never
create a second board for a task that already has one.

## 2. Lay it out; let the server place it

Cards come in four kinds you can add:

| Tool | Card | What goes in it |
| --- | --- | --- |
| `add_text_card` | text | An idea, a hook, a script line: `title` (five words) and `text` (the angle) |
| `add_media_card` | media | A public `https:` image or video URL; anything not hosted on the platform goes through `import_asset` first |
| `add_generation_card` | generation | A full prompt and a model id from `list_models`; nothing renders until it is run |
| `add_frame` | frame | A labelled region such as Week 1 or Hooks |

Omit `position`. The server places every new card on a grid and repairs
overlap; a model that moves cards by hand spends turns on pixels. `group_cards`
wraps related cards in a labelled frame, which is the one layout call worth
making. `move_cards` and `arrange_cards` exist for the board view's drag and
multi-select, not for you.

Every mutating tool returns the whole board. Read the next step from that
answer, not from what you remember adding.

## Connect the steps

A job with more than one step (a still that becomes a video, one idea and its
variations) belongs on a board as connected cards, so the person sees the flow
on the board page:

- `add_generation_card` with `from_card_id` set to an image card (an image
  generation card, or an image media card) adds the new card, draws the line
  from the source, and makes the source's finished image the new card's start
  frame. Run the source card first; running the new card before the source is
  done is refused with `details.reason: "SOURCE_NOT_READY"` and nothing is
  charged. An explicit `image_url` on the new card wins over the source.
- `connect_cards` draws a line between any two other cards, such as a script
  card and the card that renders it.

## 3. Never track the revision

Every board has a `revision` that the server increments on every write. The
mutating tools take it as an optional argument, and you should leave it out:
the tool reads the current board first and retries once on its own if someone
wrote in between. A counter remembered across turns is a counter that will be
wrong. The only caller that passes `revision` is the board view, which renders
from the board it was handed.

## 4. Quote, then ask once, then run

A generation card renders through `run_generation_card`, which requires a
`quote_id`. Get it from `estimate_credit_cost` with the card's `model`, its
`kind` (`video` or `image`) and `quantity: 1`; the quote is valid for 15
minutes and returns `credits_total`. Pass the card's `duration` and
`resolution` too whenever the card has them: models that price by the second
are priced from those, and the run verifies the quote against the card, so a
quote taken without them is refused as `QUOTE_MISMATCH` and costs a turn.

Before the first render of a task, ask the paid-approval question once, in
words, with the number in it:

> Rendering this card will use 24 credits. Shall I run it, and for the other
> cards on this board: confirm each one, or run them without asking?

The answer is one of two modes for the rest of the task:

| Mode | When it applies | What you do |
| --- | --- | --- |
| `confirm_each` | The default, and whenever the answer is unclear | Quote, state the credits and ask before every `run_generation_card` |
| `autonomous` | Only after the person has said clearly that the whole task may proceed without further questions | Quote each card, run without asking, and report every charge afterwards |

Ask once per task, not once per card and not once per session. An ambiguous
answer is `confirm_each`.

`run_generation_card` with the `quote_id` and the card id returns the board,
the card (now `generating`), `job` (`id`, `kind`) and `credits_quoted`. Credits
are charged only when the job succeeds, and a retry with the same `quote_id`
returns the same job rather than a second charge.

## 5. Poll the board, not the job

Call `refresh_canvas` every 10 seconds while any card is `generating`. A
finished render sets the card's `status` to `done`, its `media_url` and
`credits_used`; a failed one sets `failed` and `error`, and charged nothing.
Report a card when its status changes, not on every poll. Stop after 15
minutes, hand back the board link and say which cards were still rendering;
never run a card a second time because the first run is slow.

## 6. Refusals

| Refusal | What it means | What to do |
| --- | --- | --- |
| `REVISION_CONFLICT` | The board changed under you, twice in a row | The current board is in `details.canvas`; read what is on it now, then call again with `revision` omitted |
| `CANVAS_REVISION_UNAVAILABLE` | This board's storage cannot version agent writes yet | Stop; calling again is refused the same way. Hand over `get_canvas_link` so the person edits the board on the website; `get_canvas` still reads it |
| `INVALID_ARGUMENT` naming `status`, `job_id`, `media_url`, `credits_used` or another result field | Those generation fields are written by the server when a card runs | Remove them from `update_card`'s `data`; a card gets its result only through `run_generation_card` |
| `INVALID_ARGUMENT` with `details.reason: "CARD_BUSY"` | The card is already `queued` or `generating` | Do not run it again; `refresh_canvas` until it is `done` or `failed`. Nothing was charged |
| `INVALID_ARGUMENT` naming `CANVAS_FULL` | The board holds its maximum of 200 cards | Start another board with `create_canvas`, or ask the person to remove cards on the website |
| `INVALID_ARGUMENT` with `details.reason: "SOURCE_NOT_READY"` | The card starts from `details.source_card_id`, which has no finished image yet | Run that card first, `refresh_canvas` until it is `done`, then run this one. Nothing was charged |
| `INVALID_ARGUMENT` with `details.reason: "EDGE_EXISTS"` | Those two cards are already connected | Nothing changed; carry on |
| `QUOTE_REQUIRED` / `QUOTE_EXPIRED` / `QUOTE_MISMATCH` | No quote, an old quote, or a quote for a different model, kind, duration or resolution | `estimate_credit_cost` again for this card's `model`, `kind`, `duration` and `resolution`, then run with the new `quote_id` |
| `NOT_FOUND` | No such board or card on this account | `list_canvases` for board ids, `get_canvas` for card ids |
| `INSUFFICIENT_CREDITS` | The balance is below the quoted amount | Tell the person the number; nothing was charged |
| `ENTITLEMENT_REQUIRED` | The account cannot generate on its current plan | Say so and give the `info_url` the refusal carries (`https://aicontentdrop.com/plans`); nothing else about plans |
| `RATE_LIMITED` / `UPSTREAM_TEMPORARY` | Too many board calls, or the board is briefly unavailable | Wait `retry_after_seconds` (or a few seconds) and call again |

## 7. Show the board, or hand over the link

Where this server's views render in the chat, `get_canvas` and every mutating
tool show the board inline, and the person can drag, select and render there.
In a host that does not render views, or when the person wants the full page,
`get_canvas_link` returns the board's page on AI Content Drop (`link`). In a
host with an embedded browser panel, open the link there so the board sits
beside the chat. Hand the link over at the end of every board task either way.

## What to hand back

The board link, the cards you added by title, the cards you rendered with
their `credits_used`, and any card still rendering with its `job.id`, so the
person can pick the work up in the browser.
