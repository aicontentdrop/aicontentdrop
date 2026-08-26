---
name: api-error-handling
description: Read AI Content Drop API failures correctly and decide whether to retry, change the request, or stop. Covers the error envelope and its 21 codes, rate limits and Retry-After, idempotency conflicts, and the two response shapes the generation endpoints can return. Use when a call to aicontentdrop.com fails, returns 4xx or 5xx, is rate limited, or when writing a retry loop against the API.
license: MIT
metadata:
  homepage: https://aicontentdrop.com/docs/errors
  rate_limits: https://aicontentdrop.com/docs/rate-limits
---

# Failing well against the AI Content Drop API

The point of this skill is to stop you doing the two things that waste a user's
money and time: retrying something that will never succeed, and giving up on
something that would have worked in thirty seconds.

## The envelope

Every failure on the public surface carries a machine-readable code:

```json
{
  "error": {
    "code": "insufficient_credits",
    "message": "Balance below the model cost.",
    "documentation": "https://aicontentdrop.com/docs/errors"
  }
}
```

Read `error.code`. Never branch on the message — it is written for a human and
will change.

**One exception you must handle.** `POST /v1/generate/video` and
`/v1/generate/image` are path aliases onto the handlers the website itself
calls, so a *validation* failure from those two can still arrive in the older
shape, `{ "error": "some message" }` — a string, not an object. Write the read
once and forget it:

```js
const code = typeof body.error === "object" ? body.error.code : undefined;
const message = typeof body.error === "string" ? body.error : body.error?.message;
```

## What each code means for your next move

**Do not retry — fix the request:**

| Code | Status | What to do |
| --- | --- | --- |
| `invalid_request` | 400 | The message names the field. Correct it. |
| `invalid_json` | 400 | Send a complete object with `Content-Type: application/json`. |
| `safety_rejected` | 400 | The prompt was refused. Rewrite it. Nothing was charged. |
| `unsupported_operation` | 400 | Not available inside a batch. Call the endpoint directly. |
| `unknown_model` | 404 | Re-read `/v1/models`. Check id normalisation (below). |
| `unknown_endpoint` | 404 | `GET /v1` lists the whole surface. |
| `method_not_allowed` | 405 | The message names the verbs that work. |
| `forbidden` | 403 | The object is not yours. Retrying cannot change that. |
| `payload_too_large` | 413 | Split the work. See `POST /v1/batch`. |
| `query_too_large` | 413 | GraphQL query over 8,000 characters. Split it. |

**Do not retry — the user has to act:**

| Code | Status | What to do |
| --- | --- | --- |
| `unauthorized` | 401 | No key, or a revoked or malformed one. Read `WWW-Authenticate`. |
| `unauthenticated` | 401 | A session surface reached without a session. Most of `/v1` needs no credential. |
| `invalid_client` | 401 | Re-register at `/agent/auth/register`. |
| `insufficient_credits` | 402 | Tell the user the balance and the cost. Offer a cheaper model. |
| `idempotency_conflict` | 409 | Same `Idempotency-Key`, different body. Use a new key. |

**Retry is correct:**

| Code | Status | What to do |
| --- | --- | --- |
| `rate_limited` | 429 | Wait `Retry-After` seconds exactly. Nothing was charged. |
| `provider_error` | 502 | The upstream model failed. Retry is reasonable. Nothing was charged. |
| `internal_error` | 500 | Our bug. Retry once, then report it. |

`not_found` (404) and `operation_failed` (400, one item inside a batch) are
context-dependent: re-read the catalogue, or read that item's own `error`.

## Rate limits

| Surface | Limit per minute |
| --- | --- |
| `/v1/*` REST | 120 |
| `POST /graphql` | 120 |
| `POST /mcp`, `POST /mcp/docs` | 600 |
| `POST /ask` | 60 |

Every response carries the counters, not just the 429:

```
RateLimit-Limit: 120
RateLimit-Remaining: 118
RateLimit-Reset: 47
```

Self-throttle on `RateLimit-Remaining` instead of waiting to be refused. You can
watch them with no credential at all:

```bash
curl -sD - https://aicontentdrop.com/v1 -o /dev/null | grep -i ratelimit
```

When you are refused, a 429 carries `Retry-After` in seconds and
`retry_after_seconds` in the body. **Wait that long.** Retrying sooner extends
the window rather than shortening it, so an impatient loop is strictly slower
than a patient one.

## The rule that makes failure cheap here

Credits are charged **only when a generation succeeds**. A safety block, a
provider failure, a validation error and a timeout all cost nothing. There is no
refund path anywhere in the product because there is nothing to refund.

Two consequences for your error handling:

1. Never tell a user they were charged for a failed generation. They were not.
2. Never write code that asks for a refund or a credit adjustment. No such
   endpoint exists, by design.

A generation that fails *after* it started shows `status: "failed"` with
`credits_used: 0` and an `error_message` you can read.

## Rehearse instead of guessing

If you are unsure a request is well formed, run it through the sandbox first. It
applies the full validation path, needs no API key, and charges nothing:

```bash
curl -sX POST https://aicontentdrop.com/v1/generate/video \
  -H "Content-Type: application/json" \
  -H "X-Sandbox: true" \
  -d '{"prompt":"a red balloon over a city","model":"kling_3_0"}'
```

A `202` means the request shape is right. A `400` names what is wrong, before
anyone's credits are involved.

## Model id normalisation

Ids use underscores (`kling_3_0`, `veo_3_fast`). Dashes are accepted and
normalised, so `kling-3-0` works. If a model still comes back `unknown_model`,
re-read `/v1/models` rather than guessing a variant — the catalogue is the
source of truth and needs no credential.

## Retrying without double-spending

Put an `Idempotency-Key` on every generation request. Retention is 24 hours: the
same key with the same body returns the original result instead of starting a
second generation; the same key with a *different* body is a `409
idempotency_conflict`.

```bash
curl -sX POST https://aicontentdrop.com/v1/generate/video \
  -H "Authorization: Bearer $ACD_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"prompt":"…","model":"kling_3_0"}'
```

This is what makes a network timeout safe to retry. Without it, a retry after a
timeout can start a second paid generation.

Full reference: <https://aicontentdrop.com/docs/errors>
