---
name: video-agent
description: Hand a whole piece of video work to Drop, the AI Content Drop video agent, from another agent. One brief is carried through research, concepts, a storyboard, renders and assembly, and every step that charges credits stops for an approval. Covers start_video_agent, message_video_agent, get_video_agent_run, approve_video_agent_spend and list_video_agent_runs, starting from a reference clip or image that was read into words first, relaying the drop's clarifying questions, following a turn that outlives the call, reading each piece's score and the Director's notes, approving the exact quote, and what to do before the person has signed in. Use when asked for a campaign, several videos from one brief, an ad built from competitor research, something "in the style of this clip", or "just make the whole thing".
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

The five tools are `start_video_agent`, `message_video_agent`, `get_video_agent_run`, `approve_video_agent_spend`
and `list_video_agent_runs`. Only `approve_video_agent_spend` can make a drop charge credits.

## 1. Check that the drop is here

The drop tools appear on `tools/list` for every signed-in account; a caller
without a sign-in does not see them. When they are not listed, let the host
sign the person in. If that is not possible, say so in one sentence and do the
job with the precise tools instead:

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

1. `start_video_agent` with the goal in one sentence. It opens the drop and returns a
   `run_id`; nothing is planned and nothing is charged yet. `budget_credits` is
   an optional ceiling for the whole drop. Setting it is a spending decision, so
   set it only when the person gives a number.
2. `message_video_agent` with that `run_id` and the brief. A useful brief says: the product
   or subject, who it is for, what the video is for, the length, the format
   (vertical, square, wide), and any assets. Pass images or clips as public
   `https` URLs in `attachments` (at most 8). A finished product ad needs a
   product image and a presenter image; attach them or expect the drop to ask.

The drop may answer with questions before it plans. Relay them to the person as
they are and send the answers with `message_video_agent`. Do not answer for the person.

### Starting from a reference

When the person shows a clip or a still to copy rather than describing the
result, read it into words first and start the drop from those words. The full
walk is the `recreate-reference` skill; the short form:

1. Ask who holds the rights (`own_work`, `licensed` or `permission`) and pass
   the answer as given, as `rights_basis` (CLI: `--rights`). Never choose a
   basis for the person. There is no default: a video read without
   `rights_basis` is refused (`rights_required`), and the answer is to ask.
2. `analyze_reference` with the `url` of the clip or still (a public `https`
   link) and the `rights_basis` (CLI: `acd analyze <file|url> --rights
   <basis>`). Free, capped per day, words only: the `reference_class` with its
   confidence, a summary, the shots, cast, look and lines. Show the person
   what it saw; let them correct the class.
3. `start_video_agent` with the goal, `reference_url` exactly as the read
   returned it, and `reference_class` when the person confirmed or corrected
   it (CLI: `acd drop "<goal>" --reference <file|url>`). Starting charges
   nothing.

When the reference tools are not listed, or the read answers
`vision_unavailable`, say so in one sentence and run the drop from a written
brief instead of describing the reference yourself.

## 4. Follow a turn that outlives the call

`message_video_agent` returns within about 40 seconds. When a turn runs longer, the call
comes back with `status: running` and an empty `answer`; the turn keeps going.
Do not send the message again (a second send while it runs is refused as
"already working on the last message"). Call `get_video_agent_run` every 15 seconds
instead; its `answer` carries the reply once it lands.

`get_video_agent_run` returns the `phase` (`intake`, `research`, `concept`, `plan`,
`produce`, `assemble`, `distribute`, `done`), the `status`, the latest
`answer`, `artifacts` keyed by kind, `artifact_counts`, the `board_link`,
`credits_spent`, the drop's own narration in `trace`, and `pending_approval`.
Report a change of phase or a finished artifact, not every poll. Stop after 15
minutes of no change and hand over the board link.

### Reading the scorecard

Once the drop has made pieces, `get_video_agent_run` carries the scorecard:

- `pieces`: one entry per made piece with its `score` (0–100), `verdict` and
  `reasons`, and a `retry_offer` while another take the director suggested
  waits for a yes (section 5).
- `director_notes`: the Director's notes for the whole run, each naming the
  direction rule (`skill`) and why it fired (`why`).
- `reference_class_label`: for a drop started from a reference, its class in
  plain words.

The verdicts: `accept` (stands as made), `retry` or `switch` (the director
suggests another take, with a changed prompt or on another model; that take is
a new paid step made only after the person approves it, and arrives as a new
piece), `accepted_with_notes` (it stands and nothing waits on it; the director
may suggest another take, made only if the person approves it), `unscored` (not
judged; its score is not a grade). The CLI prints all of this with `acd drop status <run_id> --notes`.

Hand the score to the person with its reasons. It is the drop's opinion in
words, never a reason to approve anything on their behalf.

## 5. Approve the exact step, with the number

When a step would charge credits, the drop stops with `status:
waiting_approval` and `pending_approval` holds `task_id`, `quote_id`, `credits`
(the ceiling for that step) and `what` (the step in plain words). Ask in words,
with the number:

> The drop wants to render the two-shot ad now: up to 152 credits, charged only
> if it succeeds. Go ahead?

Read the figure from `pending_approval.credits`, never from memory. Then call
`approve_video_agent_spend` with the `run_id`, and the `task_id` and `quote_id` exactly
as given. `decision: "decline"` cancels that step instead.

- Approving the same quote twice does nothing the second time; it never charges twice.
- `confirm_each` is the only approval mode: every paid step asks. Approving never
  lifts `budget_credits`.
- When a price has lapsed, the approval is refused with `QUOTE_EXPIRED` and
  nothing is released. The drop prices the step again by itself: read
  `get_video_agent_run` (the `quote_id` is null for about a minute while it re-prices) and
  ask again only if the number changed.

What the drop makes depends on the brief. A product ad is cut from two or three
shots (10 or 15 seconds); a single take is one clip priced as one clip; research,
concepts, storyboards and the board cost nothing. Each rendered step shows its
own quote.

A **retry offer** is the same gate on another take the director suggested for
a piece (the surfaces call it "Try the other model"): the piece's `retry_offer`
carries the `task_id`, `quote_id` and `credits` of that step, and while it is
the next decision it is also `pending_approval`. Read the number from the
offer, ask the person with it, and only after their yes approve it with
`approve_video_agent_spend` and the `task_id` and `quote_id` exactly as given
(CLI: `acd drop retry <run_id> <piece_id> --quote <quote_id>` with the
`quote_id` the person saw; without `--quote` the command refuses and sends
nothing, and when the retry was priced again since, it approves nothing and
prints the new quote and credits to put to the person). One offer per piece; a declined offer
leaves the piece as it was, with its score.

## 6. Pick up an earlier drop

`list_video_agent_runs` returns the account's drops, newest first, with phase, status,
`credits_spent` and board link. Resume with `get_video_agent_run` on the `run_id`. A drop
with `status: done` takes no more messages; start a new one.

## 7. Refusals

| Refusal | What it means | What to do |
| --- | --- | --- |
| `INVALID_ARGUMENT` "already working on the last message" | A turn is still running | Poll `get_video_agent_run` until it is not `running`, then send |
| `INVALID_ARGUMENT` "has finished" | The drop is done | `start_video_agent` for new work; `get_video_agent_run` still reads this one |
| `QUOTE_MISMATCH` | That quote is not the one on that step | `get_video_agent_run`, then pass `task_id` and `quote_id` exactly as given |
| `QUOTE_EXPIRED` | The price lapsed; nothing was released | `get_video_agent_run` for the new `quote_id`; ask again if the number moved |
| `QUOTE_REQUIRED` | The step is not priced yet | `get_video_agent_run` again in a few seconds |
| `REVISION_CONFLICT` | The drop changed in flight | `get_video_agent_run`, then repeat the call |
| `NOT_FOUND` | No drop with that id on this account | `list_video_agent_runs` |
| `UPSTREAM_TEMPORARY` | The agent could not finish that step, or is not taking drops right now | Retry in a minute; nothing was charged |
| `ENTITLEMENT_REQUIRED` | The account cannot run this on its current plan | Give the `info_url` it carries (`https://aicontentdrop.com/plans`) and nothing else about plans |

## What to hand back

The board link, the finished videos with their links, `credits_spent` for the
whole drop, and any step still waiting for a decision with its number, so the
person can finish it on the website.
