---
name: muse-connector
description: Drive AI Content Drop from a host that writes its own client against the MCP server rather than reading a config file. Covers which tool answers which question, quoting with estimate_credit_cost before any generation, submitting and polling instead of waiting inside a tool call, the drop tools for accounts that have them, and repeating refusal codes verbatim. Use when connecting AI Content Drop to a consumer agent as a custom integration, when a saved integration needs to be re-taught the call order, or when a generation call times out, is refused, or is about to be retried.
license: MIT
metadata:
  homepage: https://aicontentdrop.com/docs/install/muse
  mcp_server: https://aicontentdrop.com/mcp
  repository: https://github.com/aicontentdrop/aicontentdrop
---

# Driving AI Content Drop from a self-built client

## The connection

One hosted MCP server, streamable HTTP, at `https://aicontentdrop.com/mcp`.
There is no local process and no stdio transport. Authentication is a header
and only a header: `Authorization: Bearer acd_live_…`, from a key the human
creates at <https://aicontentdrop.com/settings/integrations>, or an OAuth
sign-in. A credential in a query string or a request body is never read.

Keep the key wherever the host stores credentials. Do not echo it back into the
conversation, into a tool argument, or into a summary of what you did.

## Which tool answers which question

| The question | The call |
| --- | --- |
| What can this thing make, and for how much? | `list_models` |
| What will *this* job cost? | `estimate_credit_cost` |
| Make the video / make the image | `generate_video` / `generate_image` |
| Is it done yet? | `get_generation` |
| What have I made before? | `list_generations` |
| How many credits are left? | `get_account` |

`list_models`, `estimate_credit_cost`, `search_articles` and `get_article`
answer with no credential, so research and pricing happen before anyone signs
in. Everything else needs the key.

## Quote, then generate

`estimate_credit_cost` returns a signed `quote_id` for one model, duration and
resolution, good for 15 minutes. `generate_video` and `generate_image` refuse
without it (`QUOTE_REQUIRED`) and refuse a quote that does not match the job
(`QUOTE_MISMATCH`) or has lapsed (`QUOTE_EXPIRED`). Quote again for the exact
job rather than editing the arguments around an old quote.

The quote is also the idempotency key. A retry with the same `quote_id` returns
the original job instead of starting a second one, so a timed-out call is safe
to repeat exactly as sent. Credits are charged only when a generation succeeds.

Tell the person the model and the credit cost **before** spending anything, and
say what was actually charged afterwards.

## Submit, then poll — never wait

Generation is asynchronous. The call returns a job id in about a second; the
render takes one to four minutes. Call `get_generation` on a loop, roughly
every 15 seconds, until the status is `completed` or `failed`. A tool call that
blocks on a render will be killed by the host's own timeout while the job is
still running perfectly well on our side, which is how a finished video gets
reported to the user as a failure.

If the conversation ends mid-render, the job survives. `list_generations`
finds it again later.

## More than one step: build it on a board

When the job has more than one step (an image that becomes a video, several
variations of one idea), put it on a board instead of chaining loose calls, so
the person can open one page and see every step as connected cards:

1. `create_canvas` with a short name.
2. `add_generation_card` for the first step. For a step that builds on it, add
   the next card with `from_card_id` set to the earlier card: the board draws
   the line, and the earlier card's finished image becomes the next card's
   start frame. `connect_cards` links any other two cards in order.
3. Quote and run each card with `estimate_credit_cost` and
   `run_generation_card`, the source card first; poll `refresh_canvas` every
   10 seconds until each one is done.
4. Hand the person the page from `get_canvas_link`.

## Drops, on accounts that have them

The drop tools appear in `tools/list` only for accounts that can use them. When
they are listed and the person asks for a whole campaign, or several videos
from one brief, offer a drop: it hands over the whole piece of work rather than
sequencing it yourself:

1. `start_drop` with the goal in a sentence. It opens the drop and costs
   nothing; planning has not started yet.
2. `ask_drop` with the brief. The drop may ask a few clarifying questions:
   relay them and answer with `ask_drop`. If a turn is still running when the
   call returns, it says so — do not resend; the reply arrives on `get_drop`.
3. `get_drop` to poll. It reports the phase, the drop's latest reply,
   everything made so far, and `pending_approval` when a step would charge
   credits.
4. `approve_drop_spend` with the `run_id`, `task_id` and the **exact**
   `quote_id` from `pending_approval`. This is the only call that releases a
   spend, and a second approval of the same quote is refused, never a second
   charge.

If a decision sits unanswered long enough for the price to lapse, read
`get_drop` again for the current `pending_approval` and approve that one. Never
guess a `quote_id` or reuse one from an earlier step.

## Refusals are typed — repeat them

Every failure carries a stable `code`, a `message`, a `next_step` and
`retryable`; a rate limit adds `details.retry_after_seconds`. Say the code back
to the person as it came, then what it means:

- `AUTH_REQUIRED`, `INVALID_TOKEN`, `INSUFFICIENT_SCOPE` — the credential.
  Public tools still work.
- `QUOTE_REQUIRED`, `QUOTE_EXPIRED`, `QUOTE_MISMATCH` — quote again for the
  exact job.
- `ENTITLEMENT_REQUIRED` — this account's plan does not cover the request. The
  refusal carries `info_url`; hand that link over and stop.
- `RATE_LIMITED`, `UPSTREAM_TEMPORARY` — the two worth retrying unchanged, the
  first after `retry_after_seconds`.
- `UNSAFE_CONTENT`, `UNAUTHORIZED_ASSET`, `INVALID_ARGUMENT` — change the
  request; a retry of the same thing fails the same way.

Nothing was submitted and nothing was charged when a call is refused, so there
is no refund to ask for and no cleanup to do.

## Per-action approval

Hosts that let a person hold individual actions for approval should hold
exactly the ones that can spend: `generate_video`, `generate_image`,
`run_generation_card` and `approve_drop_spend`. Everything else costs nothing,
so a read-only policy on the reads loses no capability. Ask once per task how
spending should be approved, then follow that answer for the whole task instead
of asking again per call.
