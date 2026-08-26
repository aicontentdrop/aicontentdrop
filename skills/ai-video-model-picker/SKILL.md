---
name: ai-video-model-picker
description: Choose the right AI video model for a brief and quote its credit cost before generating, using the AI Content Drop catalogue. Use when asked to generate a video and you must decide which model, when someone asks what a batch of clips will cost, or when a model id is rejected as unknown.
license: MIT
metadata:
  homepage: https://aicontentdrop.com/developers
  catalogue: https://aicontentdrop.com/v1/models
---

# Picking an AI video model (and knowing what it costs)

Use this when someone asks you to generate a video and you have to decide *which
model*, or when they ask what a batch will cost before committing.

## The one rule

Quote before you generate. Model costs differ by **20×** across the catalogue
(9 credits for the cheapest video model, 180 for the longest premium one), so
"just use the best one" can turn a 20-clip storyboard into an expensive
surprise. The catalogue is free to read and
needs no credential:

```bash
npx aicontentdrop models --type video --max-credits 20
```

or over HTTP:

```bash
curl "https://aicontentdrop.com/v1/models?type=video&max_credits=20"
```

## Choosing

Ask two questions before looking at the list.

**1. Does the shot need dialogue or synced audio?**
If yes, you need a model that generates native audio. If no, you have the whole
catalogue and should optimise for cost.

**2. Is there a reference image?**
Text-to-video and image-to-video are different jobs. If the user has a product
photo, a still, or a character they want preserved, you want image-to-video —
starting from text will not preserve identity, and no amount of prompt detail
fixes that.

Then pick by budget:

- **Draft, storyboard, or a variant you will throw away** → the cheapest model
  that supports the job. Iterate here, not on the expensive one.
- **The take that ships** → move up only for the shot that survived.
- **Batches** → quote the whole list in one call rather than looping:

```bash
curl -X POST https://aicontentdrop.com/v1/models/cost \
  -H "Content-Type: application/json" \
  -d '{"items":[{"model_id":"kling_3_0","quantity":8},{"model_id":"veo_3_fast","quantity":2}]}'
```

## Generating

Generation needs an API key the user creates at
<https://aicontentdrop.com/settings/integrations>. You cannot create one for
them — ask, do not attempt the signup form.

```bash
export ACD_API_KEY=acd_live_…
npx aicontentdrop generate "a golden retriever surfing at sunset" \
  --model kling_3_0 --wait
```

Rehearse first if you are unsure the request is well-formed. Sandbox runs the
full validation path and charges nothing:

```bash
npx aicontentdrop generate "…" --model kling_3_0 --sandbox
```

## What to tell the user

Report the model you picked, why, and the credit cost — before you spend it, not
after. If the cheapest viable model is within one credit of a better one, say so
and let them choose.

## Facts you can rely on

- Credits are flat per generation, not per second.
- Credits are charged **only on success**. Safety blocks, provider failures, and
  timeouts cost nothing, so a failed generation never needs a refund request.
- Free tier is 10 credits, no card. Paid plans start at $19/month.
- Model IDs use underscores (`kling_3_0`, `veo_3_fast`); dashes are accepted and
  normalised.
- Generation is submit-and-poll: you get a `202` with a poll URL, not a finished
  video. Poll every ~5 seconds.

Full contract: <https://aicontentdrop.com/auth.md> · Spec:
<https://aicontentdrop.com/openapi.json>
