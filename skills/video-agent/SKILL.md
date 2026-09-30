---
name: video-agent
description: Hand a whole piece of video work to Drop, the AI Content Drop video agent, from another agent. One brief is carried through research, concepts, a storyboard, renders and assembly, and every step that charges credits stops for an approval. Covers start_drop, ask_drop, get_drop, approve_drop_spend and list_drops, relaying the drop's clarifying questions, following a turn that outlives the call, approving the exact quote, and what to do on accounts where the drop tools are not listed. Use when asked for a campaign, several videos from one brief, an ad built from competitor research, or "just make the whole thing".
license: MIT
metadata:
  homepage: https://aicontentdrop.com/docs/mcp
  mcp_server: https://aicontentdrop.com/mcp
  repository: https://github.com/aicontentdrop/aicontentdrop
---

# Handing the whole job to Drop, the video agent

A drop is one piece of work that carries a brief from start to finish: it
researches ads that already work in the category, proposes concepts, writes a
storyboard, renders, and assembles, on a board the person can open. The drop an
agent starts here and the one a person starts on the website are the same
record, planned by the same agent and charged the same way.

The five tools are `start_drop`, `ask_drop`, `get_drop`, `approve_drop_spend`
and `list_drops`. Only `approve_drop_spend` can make a drop charge credits.

## 1. Check that the drop is here

The drop tools appear on `tools/list` only for accounts that can use them; the
agent is opening to accounts in stages. When they are not listed, say so in one
sentence and do the job with the precise tools instead:

| The request | Without the drop |
| --- | --- |
| One finished ad | The studio tools (skill `marketing-studio-ad`) |
| Several steps: a still that becomes a video, variations of one idea | A board (skill `canvas-board`) |
| "What are competitors running?" | The research tools (skill `competitor-ad-research`) |
| One clip | `estimate_credit_cost`, then `generate_video` |

Never imitate a drop by chaining those tools while calling it one.

## 2. Offer the drop for the right size of job

A single clip is faster and cheaper through `generate_video`. Offer a drop when
the person asks for a campaign, a week of videos, several videos from one brief,
an ad modelled on what competitors run, or when they want the whole job handled.

## 3. Open it, then send the brief

1. `start_drop` with the goal in one sentence. It opens the drop and returns a
   `run_id`; nothing is planned and nothing is charged yet. `budget_credits` is
   an optional ceiling for the whole drop. Setting it is a spending decision, so
   set it only when the person gives a number.
2. `ask_drop` with that `run_id` and the brief. A useful brief says: the product
   or subject, who it is for, what the video is for, the length, the format
   (vertical, square, wide), and any assets. Pass images or clips as public
   `https` URLs in `attachments` (at most 8). A finished product ad needs a
   product image and a presenter image; attach them or expect the drop to ask.

The drop may answer with questions before it plans. Relay them to the person as
they are and send the answers with `ask_drop`. Do not answer for the person.

## 4. Follow a turn that outlives the call

`ask_drop` returns within about 40 seconds. When a turn runs longer, the call
comes back with `status: running` and an empty `answer`; the turn keeps going.
Do not send the message again (a second send while it runs is refused as
"already working on the last message"). Call `get_drop` every 15 seconds
instead; its `answer` carries the reply once it lands.

`get_drop` returns the `phase` (`intake`, `research`, `concept`, `plan`,
`produce`, `assemble`, `distribute`, `done`), the `status`, the latest
`answer`, `artifacts` keyed by kind, `artifact_counts`, the `board_link`,
`credits_spent`, the drop's own narration in `trace`, and `pending_approval`.
Report a change of phase or a finished artifact, not every poll. Stop after 15
minutes of no change and hand over the board link.

## 5. Approve the exact step, with the number

When a step would charge credits, the drop stops with `status:
waiting_approval` and `pending_approval` holds `task_id`, `quote_id`, `credits`
(the ceiling for that step) and `what` (the step in plain words). Ask in words,
with the number:

> The drop wants to render the two-shot ad now: up to 152 credits, charged only
> if it succeeds. Go ahead?

Read the figure from `pending_approval.credits`, never from memory. Then call
`approve_drop_spend` with the `run_id`, and the `task_id` and `quote_id` exactly
as given. `decision: "decline"` cancels that step instead.

- Approving the same quote twice does nothing the second time; it never charges twice.
- `confirm_each` is the only approval mode: every paid step asks. Approving never
  lifts `budget_credits`.
- When a price has lapsed, the approval is refused with `QUOTE_EXPIRED` and
  nothing is released. The drop prices the step again by itself: read
  `get_drop` (the `quote_id` is null for about a minute while it re-prices) and
  ask again only if the number changed.

What the drop makes depends on the brief. A product ad is cut from two or three
shots (10 or 15 seconds); a single take is one clip priced as one clip; research,
concepts, storyboards and the board cost nothing. Each rendered step shows its
own quote.

## 6. Pick up an earlier drop

`list_drops` returns the account's drops, newest first, with phase, status,
`credits_spent` and board link. Resume with `get_drop` on the `run_id`. A drop
with `status: done` takes no more messages; start a new one.

## 7. Refusals

| Refusal | What it means | What to do |
| --- | --- | --- |
| `INVALID_ARGUMENT` "already working on the last message" | A turn is still running | Poll `get_drop` until it is not `running`, then send |
| `INVALID_ARGUMENT` "has finished" | The drop is done | `start_drop` for new work; `get_drop` still reads this one |
| `QUOTE_MISMATCH` | That quote is not the one on that step | `get_drop`, then pass `task_id` and `quote_id` exactly as given |
| `QUOTE_EXPIRED` | The price lapsed; nothing was released | `get_drop` for the new `quote_id`; ask again if the number moved |
| `QUOTE_REQUIRED` | The step is not priced yet | `get_drop` again in a few seconds |
| `REVISION_CONFLICT` | The drop changed in flight | `get_drop`, then repeat the call |
| `NOT_FOUND` | No drop with that id on this account | `list_drops` |
| `UPSTREAM_TEMPORARY` | The agent could not finish that step, or is not taking drops right now | Retry in a minute; nothing was charged |
| `ENTITLEMENT_REQUIRED` | The account cannot run this on its current plan | Give the `info_url` it carries (`https://aicontentdrop.com/plans`) and nothing else about plans |

## What to hand back

The board link, the finished videos with their links, `credits_spent` for the
whole drop, and any step still waiting for a decision with its number, so the
person can finish it on the website.
