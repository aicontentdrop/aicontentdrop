---
name: image-generation
description: Generate images through the AI Content Drop API and choose between the 27 image models by cost and job. Covers POST /v1/generate/image, picking a model for drafts versus finals, the sandbox rehearsal, and using a generated image as the first frame of a video. Use when asked for an image, a thumbnail, a product still, a poster, concept art, or a reference frame to animate.
license: MIT
metadata:
  homepage: https://aicontentdrop.com/docs/api
  catalogue: https://aicontentdrop.com/v1/models?type=image
---

# Generating images, and not overpaying for drafts

There are 27 image models on one credit balance, and the cheapest costs a single
credit while the dearest costs roughly ten times that. Since credits are flat
per generation, the difference between a careless workflow and a careful one is
about an order of magnitude on the same output.

## Read the catalogue first

```bash
curl -s "https://aicontentdrop.com/v1/models?type=image"
```

```json
{
  "type": "image",
  "count": 27,
  "models": [
    { "id": "z_image",       "name": "Z Image",       "credits": 1 },
    { "id": "flux_2",        "name": "Flux 2",        "credits": 3 },
    { "id": "seedream_4_5",  "name": "Seedream 4.5",  "credits": 4 },
    { "id": "nano_banana_2", "name": "Nano Banana 2", "credits": 6 }
  ]
}
```

Ids and prices change as models are added, so read them rather than hard-coding
the list above. To see only what fits a budget:

```bash
curl -s "https://aicontentdrop.com/v1/models?type=image&max_credits=4"
```

## The workflow that saves the credits

**Iterate cheap, finish expensive.** Composition, framing and subject are
decided at 1–3 credits a shot; you only need the expensive model for the one
image that ships.

1. Draft the idea on the cheapest model that can express it. Change one thing
   per attempt so you learn what actually moved the result.
2. When the composition is right, re-run *that* prompt on a higher-quality model
   for the final.
3. Quote the final before running it if the user is near their balance.

An agent that starts on the best model and iterates there burns a user's month
on drafts nobody keeps.

## Generating

```bash
curl -sX POST https://aicontentdrop.com/v1/generate/image \
  -H "Authorization: Bearer $ACD_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: hero-still-01" \
  -d '{"prompt":"a matte-black espresso machine on a concrete counter, morning window light, shallow depth of field","model":"seedream_4_5"}'
```

Rehearse first if you are unsure of the shape. Sandbox runs full validation,
needs **no API key**, and charges nothing:

```bash
curl -sX POST https://aicontentdrop.com/v1/generate/image \
  -H "Content-Type: application/json" \
  -H "X-Sandbox: true" \
  -d '{"prompt":"…","model":"z_image"}'
```

A `202` means the request is well formed. A `400` names the problem before any
credits are involved.

## Writing an image prompt that lands

Say **subject, setting, light, lens, treatment** — in that order, in plain
description. Concrete nouns beat adjective stacks: "a chipped enamel mug on a
windowsill, overcast light, 50mm, shallow focus" gives a model far more to work
with than "beautiful stunning photorealistic mug, 8k, masterpiece".

Two habits that matter more than any keyword:

- **Describe what is there, not what is absent.** Negation is unreliable across
  image models; asking for "no text" is a weaker instruction than describing a
  surface that has nothing written on it.
- **Change one variable per iteration.** Rewriting the whole prompt between
  attempts means you learn nothing from either result.

If a prompt comes back `safety_rejected`, the content gate refused it and
nothing was charged. Rewrite the prompt; do not retry it unchanged.

## Handing an image to a video model

The most valuable thing about generating a still first is that it becomes a
*controllable* first frame. Image-to-video preserves the identity in the
picture; text-to-video cannot, no matter how detailed the prompt. So when a user
wants a specific product, character or composition to move, generate the still
first, approve it cheaply, then animate the approved frame.

See the `ai-video-model-picker` skill for choosing the video model and quoting
that second step, and `video-prompt-writer` for describing the motion.

## Reporting back

Give the user the model, the credit cost, and the image. If you iterated, say
how many attempts and what the run cost in total — successes only, because
failures were free.
