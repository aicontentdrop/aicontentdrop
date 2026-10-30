---
name: recreate-reference
description: Make a video in the style of a reference clip or image with Drop, the AI Content Drop video agent, from another agent. Covers reading the reference into words first (analyze_reference, acd analyze), the rights question that must be answered before a video is read, starting the run with the reference on the brief (start_video_agent, acd drop --reference), following the run, reading each piece's score, verdict and reasons and the Director's notes (get_video_agent_run, acd drop status --notes), and approving a priced retry by its exact quote (approve_video_agent_spend, acd drop retry --accept-quote). Use when asked to recreate a clip, make something "in the style of this", "like this video", match a reference, or when a request arrives with a video or image attached as the thing to copy.
license: MIT
metadata:
  homepage: https://aicontentdrop.com/docs/mcp
  mcp_server: https://aicontentdrop.com/mcp
  repository: https://github.com/aicontentdrop/aicontentdrop
---

# Recreating a reference with the video agent

A reference run is an ordinary drop that starts from something the person
shows rather than something they describe. The agent reads the reference
into words first — its class, shots, cast, look and lines — puts those words
on the brief, and plans from them. Every made piece then comes back with a
score and a verdict, and a piece the agent would redo is offered as a priced
retry that nobody pays for until it is approved.

Two surfaces, one engine: the MCP tools `analyze_reference`,
`start_video_agent`, `get_video_agent_run` and `approve_video_agent_spend`,
or the CLI `acd analyze`, `acd drop --reference`, `acd drop status` and
`acd drop retry`. Both call the same routes (`POST /v1/engine/analyze`,
`POST /v1/engine/chat`, `GET /v1/engine/runs/:id`,
`POST /v1/engine/runs/:id/approve`). Reading the reference costs nothing;
only an approved step charges credits, and only when it succeeds.

## 1. When this is the right skill

Use it when the person hands over a clip or a still and wants something made
in its manner: "recreate this", "like this ad but for my product", "match
this look", "same shots, my brand". A request that only describes the result
in words is the `video-agent` skill; a single clip from a prompt is
`generate_video` after `estimate_credit_cost`.

When the reference tools are not listed on `tools/list`, or `analyze_reference`
answers `vision_unavailable`, the reference read is not open for this account
yet. Say so in one sentence and run the job as a plain drop from a written
brief; do not describe the reference yourself and pass it off as a read.

## 2. The rights question, before anything is read

A video is read only once the person has said who holds its rights; for an
image, ask too whenever it is clearly someone else's work.

Ask once, in words, and pass the answer exactly:

- `own_work` — the person made it or owns it.
- `licensed` — they hold a licence that covers this use.
- `permission` — the rights holder gave them permission.

Over MCP the answer goes in `rights_basis`, on every read; with the CLI it is
`--rights`. There is no default: a video sent without one is refused
(`rights_required`), and the way past that refusal is to ask the person whose
material it is, never to pick a basis.

Never choose a basis for the person, never infer it from the filename, and
never retry a refused read with a different basis to get past the refusal.
If the person cannot answer, do the job from a written brief instead.

## 3. Read the reference into words

**MCP:** `analyze_reference` with `url`, a public `https` link to the clip or
image, and `rights_basis`, the person's answer. It stores the file privately
while it is read (only the words are kept), costs no credits and is limited
per day.

**CLI:**

```bash
acd analyze ./reference.mp4 --rights own_work --pretty
acd analyze https://example.com/clip.mp4 --rights licensed
```

The answer is words only: `reference_id`, `kind`, `status`, `reference_url`,
the `reference_class` with a `confidence`, and the `facts`: a `summary`,
`shots` (index, size, camera, action, tags), `cast`, `look` (register,
palette, notes) and `lines`. The CLI prints the same words flat, with the
class as `class`. No frame, thumbnail or file ever comes back, and nothing
about the reference is kept beyond those words.

- `status: ready` carries the facts. `status: analyzing` (a longer video)
  means the read is still going. The CLI waits for it. Over MCP, start the
  run with the `reference_url` anyway: the run's first step finishes the read
  and the words appear on the run. Do not call `analyze_reference` again for
  the same clip; a second call is a second read against the day's cap.
- The class is one of `cel_anime`, `western_animation`, `3d_animation`,
  `live_action`, `ugc`, `product` or `unknown`. Show it to the person with its
  confidence; when it looks wrong, say so and pass the right one as
  `reference_class` when the run starts. The class decides which direction
  rules the agent applies, so a wrong class costs renders.
- Relay the summary and the shot list to the person as "what I saw". It is
  the agent's reading, not a transcript, and the person may correct it.

## 4. Start the run with the reference on the brief

**MCP:** `start_video_agent` with the goal in one sentence, `reference_url`
exactly as the read returned it, and `reference_class` when the person
confirmed or corrected the class. `budget_credits` is a ceiling for the whole
run; set it only when the person gives a number. `approval_mode:
"confirm_each"` makes every paid step ask.

**CLI:** one command reads the reference and starts the run:

```bash
acd drop "a 15-second vertical product ad in this style for Nimbus Tea" \
  --reference ./reference.mp4 --rights own_work --confirm-each --pretty
```

`--reference` takes a local file, a public `https` URL, or the `reference_url`
of a reference already read. `--lane auto` (the default) lets the agent choose
the recipe; `marketing`, `cinematic`, `ugc` or `drama` fixes it. `--budget N`
is the ceiling. The command prints the `run_id` and what it saw; nothing is
planned against a price and nothing is charged by starting.

The agent may answer with questions before it plans. Relay them as they are
and send the answers with `message_video_agent`. Do not answer for the person.

## 5. Follow the run and read the scorecard

Poll `get_video_agent_run` every 15 seconds (CLI: `acd drop status <run_id>`).
Report a change of phase or a finished piece, not every poll.

```bash
acd drop status <run_id> --notes --pretty
```

What a run of this kind carries beyond an ordinary drop:

- **What I saw:** `reference_class_label`, the reference's class in plain
  words. Say it that way rather than the code. The CLI prints the class and
  the summary under `what_i_saw`.
- **`pieces`:** one entry per made piece, with its `score` (0–100), its
  `verdict` and the `reasons`, and a `retry_offer` while a second attempt
  waits for a yes (section 6). The verdicts:
  - `accept` — the piece stands as made.
  - `retry` — the director suggests another take with one change to the
    prompt; `switch` — another take on another model. Either take is a new
    paid step with its own price, made only after the person approves it;
    once made it arrives as a new piece with its own score, and the first
    stays.
  - `accepted_with_notes` — the piece stands and nothing waits on it. The
    director may suggest another take: the reasons say what it would change,
    and another model for that piece can be asked for on the board, made only
    after the person approves its price.
  - `unscored` — not judged this time; its score is not a grade.
- **`director_notes`** on the run: one entry per direction rule the agent
  applied, with the rule (`skill`) and the reason (`why`), in words. With the
  CLI they print only with `--notes`, together with each piece's reasons and
  notes.

Read the score as the agent's opinion, in words, and hand the reasons to the
person with it. A score is not a promise of quality and never a reason to
approve anything on the person's behalf.

## 6. Approve a retry by its exact quote

A second attempt is a step like any other: it carries its own quote and runs
only after the person's yes. The surfaces call it **Try the other model**.

- **MCP:** the piece's `retry_offer` names that step: its `task_id`,
  `quote_id` and `credits`. While it is the next decision, the same step is
  also the run's `pending_approval`. When its `quote_id` is null the price is
  being refreshed; read the run again.
- **CLI:** `acd drop status` lists each offer under `retry_offers` with
  `piece_id`, `task_id`, `quote_id` and `credits`.

Ask in words, with the number read from the offer, never from memory:

> The agent rates the second shot 48 and offers to try it another way: up to
> 36 credits, charged only if it succeeds. Go ahead?

Only after the person says yes, approve exactly what was offered:

- **MCP:** `approve_video_agent_spend` with the `run_id`, and the offer's
  `task_id` and `quote_id` exactly as given.
- **CLI:** `acd drop retry <run_id> <piece_id> --quote <quote_id>`, with the
  `quote_id` from the offer you put to the person. Without `--quote` the
  command makes no request and refuses (`--accept-quote` alone is refused too);
  if the retry was priced again since, it approves nothing, exits 2 and prints
  the new `quote_id` and credits (`quote_mismatch`): ask again with that number.

Approving the same quote twice does nothing the second time. A declined offer
leaves the piece as it was, with its score. One offer per piece: when it is
gone, the piece stands.

## 7. Refusals

| Refusal | What it means | What to do |
| --- | --- | --- |
| `vision_unavailable` (403) | The reference read is not open for this account | Say so; run a plain drop from a written brief |
| `analysis_cap` (429, `reset_at`) | Today's free reads are used | Tell the person when it resets; do not retry before then |
| `rights_required` (400) | A video reached the API with no rights basis (the CLI without `--rights`) | Ask the rights question (section 2) and send the answer |
| `too_large` (413) / `unsupported_type` (415) | Too large, or not an image or video the API reads | Ask for a smaller file or a supported format |
| `reference_storage_unavailable` (503) | The reference store is not ready | Retry in a few minutes; nothing was read or charged |
| `QUOTE_EXPIRED` | The retry's price lapsed; nothing was released | Read the run again for the new `quote_id`; ask again if the number moved |
| `QUOTE_MISMATCH` | That quote is not the one on that step | Read the run again and pass `task_id` and `quote_id` exactly as given |
| `ENTITLEMENT_REQUIRED` | The account cannot run this on its current plan | Give the `info_url` it carries (`https://aicontentdrop.com/plans`) and nothing else about plans |

## What to hand back

What the agent saw (the class in plain words and the summary), the board
link, each finished piece with its link, score and verdict, `credits_spent`
for the whole run, and any retry still offered with its number, so the person
can decide it on the website if they prefer.
