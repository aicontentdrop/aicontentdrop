---
name: batch-generation-runner
description: Run many AI Content Drop reads or generations efficiently instead of looping one HTTP call at a time. Covers POST /v1/batch for reads, POST /v1/models/cost for bulk quoting, idempotency keys, and the submit-and-poll loop for generations. Use when handling a storyboard, a shot list, a spreadsheet of prompts, or any job that means more than two or three calls.
license: MIT
metadata:
  homepage: https://aicontentdrop.com/docs/batch
  rate_limits: https://aicontentdrop.com/docs/rate-limits
---

# Running many generations without melting the rate limit

The failure mode this skill prevents: a loop that fires one HTTP request per
item, hits the 120-per-minute ceiling a third of the way through, and leaves the
user with a half-finished storyboard and no idea which shots exist.

## Quote the whole job first, in one call

Never loop the cost endpoint. `POST /v1/models/cost` prices up to **50**
model/quantity pairs together, needs no credential, and reports errors per item
so one bad model id does not fail the quote:

```bash
curl -sX POST https://aicontentdrop.com/v1/models/cost \
  -H "Content-Type: application/json" \
  -d '{"items":[{"model_id":"kling_3_0","quantity":8},
                {"model_id":"veo_3_fast","quantity":2}]}'
```

```json
{
  "count": 2,
  "credits_total": 204,
  "items": [
    { "index": 0, "model_id": "kling_3_0",  "credits_each": 22, "quantity": 8,
      "credits_total": 176, "type": "video", "error": null },
    { "index": 1, "model_id": "veo_3_fast", "credits_each": 14, "quantity": 2,
      "credits_total": 28,  "type": "video", "error": null }
  ]
}
```

Show the user `credits_total` **before** you start. A twenty-shot board on a
premium model is a materially different decision from the same board on a cheap
one, and they can only make that decision before the credits are gone.

## Batch the reads

`POST /v1/batch` takes up to **20** read operations and returns results in the
same order. No credential required.

```bash
curl -sX POST https://aicontentdrop.com/v1/batch \
  -H "Content-Type: application/json" \
  -d '{"operations":[
        {"id":"video-models","method":"GET","path":"/v1/models?type=video"},
        {"id":"image-models","method":"GET","path":"/v1/models?type=image"},
        {"id":"quote","method":"GET","path":"/v1/models/kling_3_0/cost?quantity=3"}
      ]}'
```

The envelope is `200` even when an individual operation fails; each result
carries its own `status` and `error`. So check per item, never just the outer
status:

```js
for (const r of body.results) {
  if (r.status !== 200) console.warn(r.id, r.error?.code ?? r.status);
}
```

Rules worth knowing before you design around it:

- **Reads only.** Generation is never batched. A partial failure inside a batch
  of credit-spending calls is ambiguous in exactly the way that loses someone
  credits they cannot account for.
- **20 operations maximum.** Over that, split the list.
- **Same order in, same order out**, and each result carries the `id` you gave.

## Generations: submit and poll, one key each

Generation is asynchronous. You get a `202` with an id, not a finished video.

```bash
curl -sX POST https://aicontentdrop.com/v1/generate/video \
  -H "Authorization: Bearer $ACD_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: shot-04-take-1" \
  -d '{"prompt":"…","model":"kling_3_0"}'
```

Then poll `GET /v1/videos/{id}` every **5 seconds** until `status` leaves
`generating`. Terminal states are `completed`, `failed`, and `timeout`.

Give every item its **own** `Idempotency-Key` derived from the item, not from
the attempt — `shot-04-take-1`, not a fresh UUID per retry. That is what makes
the whole run resumable: re-running the loop after a crash returns the existing
generation for items already submitted (24-hour retention) instead of paying
twice.

## A run loop that survives contact with reality

```js
const CONCURRENCY = 4;             // stay well inside 120/min with polling
const inflight = new Map();

for (const shot of shots) {
  while (inflight.size >= CONCURRENCY) await settleOne(inflight);
  const res = await post("/v1/generate/video", shot.body, {
    "Idempotency-Key": `${runId}:${shot.id}`,
  });
  if (res.status === 429) {                       // obey, do not spin
    await sleep(Number(res.headers["retry-after"]) * 1000);
    continue;
  }
  inflight.set(shot.id, res.body.id);
}
```

Two things that loop gets right and a naive one does not: it bounds concurrency
so polling traffic still fits the budget, and it sleeps for exactly
`Retry-After` on a 429 rather than retrying immediately, which extends the
window rather than shortening it.

## Report honestly at the end

Credits are charged only on success, so the arithmetic a user needs is:

- items completed × the model's flat cost = what they actually spent
- items failed or timed out = **zero** credits, nothing to reclaim

State both. A run that produced 17 of 20 clips cost 17 clips' worth, and the
three failures are free to retry.

Full reference: <https://aicontentdrop.com/docs/batch>
