---
name: competitor-ad-research
description: Research the ads competitors are running and turn a winner into a brief, from an agent, with AI Content Drop's research tools. Covers search_competitor_ads on Meta or TikTok, never passing sample rows off as real ads, saving an ad, decoding it into a reusable formula with a quote first, and placing it on a board so it can be remade. Use when asked what competitors are running, which hooks work in a category, to break down an ad, or to make an ad "like this one".
license: MIT
metadata:
  homepage: https://aicontentdrop.com/docs/mcp
  mcp_server: https://aicontentdrop.com/mcp
  repository: https://github.com/aicontentdrop/aicontentdrop
---

# From competitor ads to a brief you can shoot

The research tools are `search_competitor_ads`, `save_competitor_ad`,
`list_saved_ads`, `get_saved_ad`, `decode_ad` and `ad_to_canvas_card`. Every one
needs a sign-in, because saved ads are account data. They appear on
`tools/list` where the board surface is enabled; if they are absent, say so and
stop.

Only `decode_ad` charges credits, and only after a quote.

## 1. Search

`search_competitor_ads` with a `keyword` (a product, a category or a
competitor), `platform` (`meta`, the default, or `tiktok`), `sort`
(`impressions` ranks by reach, `recent` by start date) and `limit`. Each row
carries the advertiser, copy, hook, call to action, media and how long the ad
has run. An ad that has run for months is usually one that pays for itself;
say so when you rank them.

When live data is not available the rows are samples: the result says
`demo: true` with a `note`. Tell the person the results are samples and do not
describe them as real ads, rank them, or build a brief on them.

## 2. Keep the ones worth studying

`save_competitor_ad` with one row from the search, copied as returned. Saving
the same ad twice returns the saved one. `list_saved_ads` shows what the
account has kept and which ads already carry a decode; `get_saved_ad` reads one
in full with its stored decode, and never runs a new one.

## 3. Decode, with a quote first

A decode turns an ad into its formula: hook, script, scenes, audio, call to
action and style, plus a recreation prompt ready for generation.

1. `estimate_ad_cost` with `kind: "decode"`. It returns a flat price and a
   `quote_id` valid for 15 minutes.
2. Ask once, with the number: "Decoding this ad uses 3 credits, charged only
   if the analysis succeeds. Go ahead?" Read the figure from the quote.
3. `decode_ad` with the `ad_id` and the `quote_id`.

An ad decoded before returns its stored decode with `cached: true` and charges
nothing, so check `get_saved_ad` first. A retry with the same `quote_id`
returns the first result (`replayed: true`), never a second charge.

## 4. Put it on a board, then remake it

`ad_to_canvas_card` with the `ad_id` and a `canvas_id` (from `list_canvases` or
`create_canvas`) places the ad on the board as a media card, with the decoded
brief attached when it has one. From there:

- one finished ad in the same formula: the studio tools (skill
  `marketing-studio-ad`), with the decode's hook and structure in the brief and
  the person's own product and brand, never the competitor's;
- several variations: generation cards on the same board (skill
  `canvas-board`);
- the whole job handed over: a drop, where the account has one (skill
  `video-agent`).

Remake the formula, not the ad: no competitor footage, logo, product, script
lines or on-screen people in the new version.

## 5. Refusals

| Refusal | What it means | What to do |
| --- | --- | --- |
| `QUOTE_REQUIRED` / `QUOTE_EXPIRED` / `QUOTE_MISMATCH` | No decode quote, an old one, or one for another kind | `estimate_ad_cost` with `kind: "decode"` again |
| `NOT_FOUND` | No saved ad or board with that id | `list_saved_ads` or `list_canvases` |
| `INSUFFICIENT_CREDITS` | The balance is below the quote | Say the number; nothing was charged |
| `ENTITLEMENT_REQUIRED` | The account cannot run this on its current plan | Give the `info_url` it carries (`https://aicontentdrop.com/plans`) and nothing else about plans |
| `RATE_LIMITED` / `UPSTREAM_TEMPORARY` | Too many calls, or the source is briefly unavailable | Wait `retry_after_seconds` and retry the same call |

## What to hand back

The ads you ranked with advertiser, hook and run time; for each decoded ad its
formula in a few lines and the credits used; and the board link, if you placed
them on one.
