---
name: video-prompt-writer
description: Write a prompt that actually produces the shot someone described, for any AI Content Drop video model. Covers the shot-first structure, camera and lighting language models respond to, why text-to-video cannot preserve a specific subject, when to use a reference frame instead, and how to iterate without wasting credits. Use when asked to generate a video, turn a brief or script into a prompt, fix a generation that came out wrong, or animate an existing image.
license: MIT
metadata:
  homepage: https://aicontentdrop.com/docs/api
  catalogue: https://aicontentdrop.com/v1/models
---

# Writing a video prompt that survives the model

Most disappointing generations are not a model problem. They are a prompt that
described a *concept* when the model needed a *shot*.

## Decide the job before the words

**Is there a specific thing that must be recognisable?** A real product, a
particular person, a logo, an established character.

- **Yes** → you need **image-to-video**. Generate or supply a still of that
  subject, then animate it. Text-to-video re-invents the subject every run; no
  amount of prompt detail fixes that, because the model has never seen the
  thing you mean.
- **No** → text-to-video is fine and cheaper to iterate on.

**Does it need speech or synced audio?** Only some models generate native audio.
Filter the catalogue rather than assuming, and if the model cannot do it, plan
the voiceover as a separate step instead of hoping.

## The structure that works

Describe one shot, in this order:

1. **Subject and action** — who or what, doing one specific thing.
2. **Setting** — where, and what time of day.
3. **Camera** — the shot size and the move: *static wide*, *slow push in*,
   *handheld follow*, *low-angle tracking*.
4. **Light** — direction and quality: *hard afternoon sun from the left*,
   *soft overcast*, *single practical lamp*.
5. **Treatment** — the finish: *shallow depth of field*, *anamorphic*,
   *documentary*, *35mm grain*.

```
A barista sets a ceramic cup on a wooden counter and slides it forward.
Small independent cafe, early morning. Static medium shot, slight push in.
Warm low sun through a window on the left, soft shadows.
Shallow depth of field, 35mm, natural colour.
```

That is one shot. It has a subject doing one thing, a place, a camera, a light
source and a finish — everything the model needs and nothing it has to guess.

## The four habits that separate good prompts from bad ones

**One shot per generation.** A prompt describing three beats gets you a model
choosing between them, or cutting incoherently. Multi-beat sequences are several
generations you assemble, not one prompt.

**One action.** "Walks in, sits down, opens a laptop and smiles" is four
actions competing for a few seconds. Pick the one that carries the moment.

**Describe presence, not absence.** Negative instructions are unreliable. Rather
than "no text on the wall", describe a plain concrete wall.

**Change one variable per iteration.** If you rewrite the whole prompt between
attempts, you cannot tell which change helped. Vary the camera, or the light, or
the action — not all three.

## Length, and why the first second matters most

These models hold a coherent idea for a few seconds and then drift: hands
wander, faces soften, backgrounds reinvent themselves. Two consequences:

- Prefer the **shortest duration that carries the beat**. A clean 5 seconds
  beats a 10-second clip whose back half you will cut anyway.
- Put the **essential content early**. If the shot must show the product
  clearly, it should be clear at second one, not arriving at second eight.

## Iterating without burning the budget

Credits are flat per generation and charged only on success, so a failed run
costs nothing but a rejected-looking one costs full price. The cheap path:

1. Rehearse the request shape in the sandbox — no key, no credits:
   ```bash
   curl -sX POST https://aicontentdrop.com/v1/generate/video \
     -H "Content-Type: application/json" -H "X-Sandbox: true" \
     -d '{"prompt":"…","model":"kling_3_0"}'
   ```
2. Find the prompt on a **cheap** model (the catalogue starts at 9 credits for
   video). Composition and action read fine at low cost.
3. Re-run the winning prompt on the expensive model once, for the take that
   ships.

Quote the cost before step 3 — see `ai-video-model-picker`.

## Diagnosing a bad result

| What you got | The usual cause | The fix |
| --- | --- | --- |
| Subject is not the thing they meant | text-to-video invented it | Switch to image-to-video from a real still |
| Drifts or morphs late in the clip | duration beyond the coherent window | Shorter duration; put the payload early |
| Nothing moves, or it is one slow zoom | no camera or action specified | Name the move and one concrete action |
| Right idea, wrong mood | light unspecified | Give direction and quality of light |
| Refused | content gate | Rewrite; nothing was charged, so do not retry unchanged |

## What to hand back

The prompt you used, the model, the credit cost, and — when the first attempt
missed — what you changed and why. A user who can see the one variable you moved
can direct the next iteration themselves.
