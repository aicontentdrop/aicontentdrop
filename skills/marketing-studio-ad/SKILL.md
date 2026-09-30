---
name: marketing-studio-ad
description: Make a finished video ad through the AI Content Drop studio tools from an agent. Covers gathering the brief first, bringing assets in by URL, quoting with estimate_ad_cost before generate_ad, asking once before any credits are spent, polling get_ad_job every 15 seconds, the consent rule for UGC avatar videos, and what to say when a plan is needed. Use when asked to make an ad, a product video, a UGC-style clip, or an avatar presenter from a brief.
license: MIT
metadata:
  homepage: https://aicontentdrop.com/docs/mcp
  catalogue: https://aicontentdrop.com/v1/models
  repository: https://github.com/aicontentdrop/aicontentdrop
---

# Making a finished ad with the studio tools

The studio tools turn a brief into a captioned, finished ad: `list_ad_formats`,
`list_ugc_avatars`, `estimate_ad_cost`, `write_ad_storyboard`, `generate_ad`,
`get_ad_job`, `generate_ugc_video`, `generate_avatar`, `import_asset`,
`list_brand_profiles` and `import_brand_profile`. They appear on `tools/list`
where the studio surface is enabled. If they are absent, say so and stop; do
not try to assemble an ad out of `generate_video` calls instead.

Three of them spend credits: `generate_ad`, `generate_ugc_video` and
`generate_avatar`. Everything below exists so the person knows the number
before any of those three runs.

## 1. Brief first, always

An ad job is only as good as the brief, and every field of it is a question
the person can answer in one line. Collect, in this order:

1. **Brand** — name, and a brand profile if one exists: `list_brand_profiles`
   returns the saved ones; `import_brand_profile` with a website URL makes one.
2. **Value props** — two or three, concrete, in the customer's words.
3. **Call to action** — the one thing the ad asks for.
4. **Format** — from `list_ad_formats`, never from memory. Each format carries
   an aspect ratio, a duration range and a shot range; pick within them.
5. **Duration** — inside the format's range; shorter holds attention better.

Read the brief back in four lines before going further. A wrong brief costs
a whole render; a wrong line costs a sentence.

## 2. Assets by URL

`generate_ad` takes `avatar_url` and `product_image_url`, and both must live on
the platform. Anything else — a Dropbox link, a CDN, the person's own site —
goes through `import_asset` first, which copies a public `https:` image (JPEG,
PNG or WebP, up to 10 MB) and returns the URL to pass on.

No product image? Set `needs_product_gen`. No avatar? Either set
`needs_avatar_gen` or make one with `generate_avatar`; both add to the quote,
so neither happens silently.

## 3. Storyboard before money

`write_ad_storyboard` costs nothing. Run it with the brief, show the shot list,
and adjust the brief until the person is happy with it. Price and generate from
the approved storyboard, not from the brief alone. Every ad quote is an upper
bound (`basis: "estimate_upper_bound"`): the charge on success is never higher
than `credits_total`. The storyboard quote is the tighter of the two, because a
brief-only quote has to assume the most expensive shot mix for the requested
quality and tier.

## 4. Quote, then ask once

Call `estimate_ad_cost` with exactly the fields you will send to `generate_ad`
— storyboard or brief, `quality`, `model_tier`, `persona_mode`, the two
`needs_*` flags. It returns `credits_total`, the lines behind it, a `basis`
(`flat` or `estimate_upper_bound`) and a `quote_id` valid for 15 minutes.

Then the paid-approval question, in words, with the number in it:

> This ad will use up to 210 credits: Storyboard planning 1, Video shots × 3
> 204, Music bed 5. Shall I start it?

Those are the `lines` of a real quote for a three-shot storyboard at `fast`
quality; `premium` adds a `Premium lip-sync × 3` line (60) for a ceiling of
270. Read the lines from the quote you were given, never from memory.

Ask **once per task**. The default is to confirm each spend; only when the
person has said clearly that the whole task may proceed without further
questions do you skip the question for later spends in the same task. An
ambiguous answer is not a yes.

Credits are charged only when the job succeeds, and the account is charged
what the job actually used, so the quote is the ceiling of the surprise, not a
prepayment.

## 5. Start, and handle the quote refusals

`generate_ad` with the `quote_id` and the same fields returns `job_id`,
`run_id`, `credits_quoted` and `poll_after_seconds`. If `replayed` is true the
quote had already started a job: report that job, do not start another.

| Refusal | What it means | What to do |
| --- | --- | --- |
| `QUOTE_REQUIRED` | No `quote_id` was sent | Quote first; never call `generate_ad` cold |
| `QUOTE_EXPIRED` | More than 15 minutes passed | Quote again; ask again only if the number changed |
| `QUOTE_MISMATCH` | The fields differ from the quoted ones | Quote again with the fields you intend to send |
| `INVALID_ARGUMENT` | A field is out of range for the format | Read the message; fix the one field it names |
| `UNSAFE_CONTENT` | The brief or an asset failed the content gate | Rewrite; nothing was charged |
| `RATE_LIMITED` | Too many starts | Wait `retry_after_seconds`, retry with the same `quote_id` |
| `UPSTREAM_TEMPORARY` (fresh) | The studio could not start the job just now | Wait `retry_after_seconds`, retry with the same `quote_id` |
| `UPSTREAM_TEMPORARY` with `replayed: true` | An earlier attempt with this `quote_id` failed before anything was created | Do not retry that `quote_id`; call `estimate_ad_cost` again and submit with the new one |
| `INSUFFICIENT_CREDITS` | The balance is below the quoted amount | Tell the user the number; nothing was charged |

## 6. Poll with patience, not persistence

Call `get_ad_job` with the `job_id` every 15 seconds — `retry_after_seconds`
says so on every non-terminal answer. Report the `stage` and `percent` when
they change, not on every poll. Stop polling after 15 minutes and hand back
the `job_id` so the person can check later; never start a second job because
the first one is slow.

`succeeded` brings `video_url` (captions burnt in), `storyboard_sheet_url`,
`duration_seconds` and `credits_used`. `failed` brings `error` and charged
nothing.

## 7. When a plan is needed

`ENTITLEMENT_REQUIRED` means the account cannot run studio jobs on its current
plan. Say that, give the `info_url` the refusal carries
(`https://aicontentdrop.com/plans`), and say nothing else about plans — no
comparison, no recommendation, no price.

## UGC avatar videos

`list_ugc_avatars` returns the presenter catalogue with a portrait for each;
the person names one and you pass its id. A photo of a real person can be used
instead, and that is where `image_rights_consent` comes from: it is required
in the schema, it defaults to nothing, and it must be `true` before
`generate_ugc_video` will run. Ask in words — "Do you have the right to use
this person's likeness in an ad?" — and pass `true` only after a yes. Never
set it on the person's behalf.

The flow is otherwise the same: `estimate_ad_cost` with `kind: "ugc"` (a flat
price), the paid-approval question, `generate_ugc_video`, then poll
`get_generation` with the returned id.

## What to hand back

The final `video_url`, the storyboard sheet, the format and duration used,
`credits_used`, and the brief as it was actually sent. A person who can see the
brief can direct the next version themselves.
