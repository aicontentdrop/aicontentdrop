---
name: drama-studio
description: Make a short vertical drama with AI Content Drop's Drama Studio from an agent, from a premise to a finished, cut episode. Covers start_drama, get_drama, list_dramas, revise_drama, review_drama_draft, quote_drama_episode, produce_drama_episode and assemble_drama_episode; following a draft that takes minutes; reading the script back before anything renders; showing the episode total before rendering; and handing over the Drama Studio page on accounts where the drama tools are not listed. Use when asked for a short drama, a mini-series, a vertical episode, a soap-style story, or a scripted series of clips with recurring characters.
license: MIT
metadata:
  homepage: https://aicontentdrop.com/generate/drama
  mcp_server: https://aicontentdrop.com/mcp
  repository: https://github.com/aicontentdrop/aicontentdrop
---

# A short drama, from premise to finished episode

Drama Studio writes a short drama (cast, locations, and every episode's scenes
with beats, shots and dialogue), renders each clip, and cuts the episode into
one vertical video. A drama an agent starts and one the person starts at
<https://aicontentdrop.com/generate/drama> are the same record.

## 1. Check that the tools are here

The eight drama tools appear on `tools/list` only for signed-in accounts that
can use them; they are opening in stages. When they are not listed, say so and
hand over the Drama Studio page instead, with the premise you worked out (skill
`short-drama-writer` covers writing one). Do not assemble a drama out of
`generate_video` calls: the characters would not stay the same between clips.

## 2. Settle the brief

Ask only for what changes the result or the cost:

- **Premise**: a sentence or a paragraph with a person who wants something now
  and something in the way.
- **Episodes** (1 to 12) and **episode length** (15, 30, 60 or 90 seconds).
  Vertical 9:16 is the default; 16:9 is available.
- **Genre**, **style** and **language** if the person has a view.
- **Romance ceiling** (`gentle`, `flirty`, `romantic`, `passionate`, `mature`,
  never graphic). The two highest need an adult, fictional cast. It limits
  intimacy, not conflict.

## 3. Write

`start_drama` with the premise and settings. It returns a `drama_id` and a
`write_job_id` at once; the draft lands in 3 to 5 minutes. `credits_reserved`
is what the draft costs, charged only when it lands. Call `get_drama` every 30
seconds; stop after 10 minutes and report the last status.

## 4. Read the script back, then accept it

The draft arrives as `pending_draft` on `get_drama`: logline, cast, episodes
with scenes and beats, and any `issues` the writer flagged. Summarise it for
the person in a few lines (the hook, the turn, the ending question) before
anything is spent on video.

- Happy: `review_drama_draft` with the `proposal_id` and `decision: "accept"`.
  It costs nothing and makes the draft the script.
- Changes wanted: `revise_drama` with the instruction in words (a new ending,
  sharper dialogue, a darker tone), optionally for one `episode_id`. It is a new
  draft and costs another writing charge; say so first.
- A draft written before the drama last changed can no longer be accepted; ask
  for a fresh one with `revise_drama`.

## 5. Price the episode, then ask once

`quote_drama_episode` (optionally with `episode_id`; it defaults to the first
unfinished episode) prepares every clip's shot and returns one quote per clip
that has no current render: `clip_id`, `quote_id`, `credits`, `seconds`,
`model`, plus `total_credits` and `expires_at`. It costs nothing. If `complete`
is false, pricing stopped early to answer in time; call it again to finish.
Clips in `unavailable` cannot be rendered right now; say which and why.

Quotes last 10 minutes. Ask with the total:

> Episode 1 is six clips, 30 seconds in all: 180 credits, each clip charged only
> if it renders. Shall I render it?

Read the numbers from the quote, never from memory.

## 6. Render, follow, cut

1. `produce_drama_episode` with the `clips` array of `{clip_id, quote_id}`
   pairs exactly as the quote returned them (1 to 24 per call). `started` lists
   the renders that began; `refused` lists any clip that did not, with a code.
   A retry with the same quote returns the same render, never a second charge.
2. Call `get_drama` every 30 seconds until the episode's `clips_ready` equals
   `clips_total`; stop after 15 minutes and report which clips are still
   rendering.
3. `assemble_drama_episode` cuts the episode from the newest render of each
   clip. It costs no credits but needs a paid plan. The finished video appears
   as `episodes[].cut.video_url` on `get_drama`.

## 7. Refusals

| Refusal | What it means | What to do |
| --- | --- | --- |
| `QUOTE_EXPIRED` | The clip quote is more than 10 minutes old | `quote_drama_episode` again; ask again if the total changed |
| `QUOTE_MISMATCH` | The clip or the drama changed after pricing | Price again from the current script |
| `REVISION_CONFLICT` | The drama changed while the request was in flight | `get_drama`, then repeat |
| `MODEL_UNAVAILABLE` | The clip's video model is not available right now | Try later, or start the drama with another `model` |
| `INVALID_ARGUMENT` "no written episode" or "no scenes" | Nothing to price or cut yet | Write or accept a draft first |
| `NOT_FOUND` | No drama, episode or draft with that id | `list_dramas`, then `get_drama` |
| `UPSTREAM_TEMPORARY` | Writing or the studio is briefly unavailable | Retry in a few minutes; nothing was charged |
| `ENTITLEMENT_REQUIRED` | The account cannot do this on its current plan | Give the `info_url` it carries (`https://aicontentdrop.com/plans`) and nothing else about plans |

## What to hand back

The episode's `video_url`, the logline, the credits the writing and the clips
used, and the drama's page on Drama Studio, where the person can edit a scene
and render one clip again rather than the whole episode.
