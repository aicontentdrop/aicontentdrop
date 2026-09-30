---
name: credits-and-plans
description: Answer what an AI Content Drop generation costs, what a plan includes, and whether a user can afford a job before running it. Covers flat and per-second prices, the free tier, where plan details live, checking a balance, and the charge-on-success rule. Use when asked about pricing, credits, billing, "can I afford this", "how much will this cost", or when a call returns insufficient_credits.
license: MIT
metadata:
  homepage: https://aicontentdrop.com/plans
  balance_endpoint: https://aicontentdrop.com/v1/me
  repository: https://github.com/aicontentdrop/aicontentdrop
---

# What it costs, and how to say so before spending it

## The model in one paragraph

Most models have **one flat price per generation**: a five-second clip and a
ten-second clip on that model cost the same. A few video models (the Seedance
family among them) price **by the second of output and by resolution** instead;
for those the catalogue row is where the price starts, and the exact figure
comes from a quote with the duration and resolution you will send (the MCP tool
`estimate_credit_cost` returns it with `basis: "per_second"`). Credits are
deducted **only when a generation succeeds** — a safety block, a provider
failure, a validation error and a timeout all cost nothing, which is why a
failed generation never needs a refund.

## Reading the real numbers

Never quote a price from memory; the catalogue moves. Every price endpoint is
free to read and needs no credential.

```bash
# every video model and its catalogue price
curl -s "https://aicontentdrop.com/v1/models?type=video"

# only what fits a budget
curl -s "https://aicontentdrop.com/v1/models?type=video&max_credits=20"

# one model, one job
curl -s "https://aicontentdrop.com/v1/models/kling_3_0/cost?quantity=3"
```

For questions about what a plan includes, point the user at the informational
plans page: <https://aicontentdrop.com/plans>

## Checking what the user actually has

```bash
curl -s https://aicontentdrop.com/v1/me -H "Authorization: Bearer $ACD_API_KEY"
```

This is the one place the balance is authoritative. Do the arithmetic before you
start a job, not after it fails halfway:

```
credits_needed = quantity × credits_each          (from /v1/models/cost)
can_afford     = balance >= credits_needed
```

If it does not fit, say so with all three numbers — balance, cost, shortfall —
and offer the cheaper model that does fit. `GET
/v1/models?type=video&max_credits=<balance>` answers that in one call.

## The tiers

- **Free**: a small welcome grant, released only after the email address is
  confirmed, so an account created programmatically holds 0 until the human
  clicks the link. A free account generates images with a few low-cost image
  models only; video and every other model need a paid plan. A free account
  asking for more is refused before anything runs, and the refusal names the
  models it may use (`allowed_models`): offer an image on one of those, or
  point at <https://aicontentdrop.com/plans>. The service can also pause free
  generation or reach its daily free limit; repeat what the refusal says and
  do not work around it.
- **Paid plans** carry larger monthly credit allocations.

Read the current tiers and allocations from <https://aicontentdrop.com/plans>
rather than repeating figures from here. That page describes the plans; it is
the one place to send a user who asks what each plan includes.

## What needs no credits at all

A surprising amount, and it is worth telling users:

- the whole model catalogue and every cost estimate
- `POST /v1/batch` reads and `POST /v1/models/cost` quotes
- the natural-language endpoint `/ask`
- GraphQL reads and the MCP read tools
- **sandbox generations** — `X-Sandbox: true` returns the real response shape,
  runs full validation, and charges nothing, with no API key required

So an integration can be proven end to end before the user has an account.

## Answering `insufficient_credits` (402)

Do not retry. Do not ask for a refund — there is no such endpoint, because
nothing was charged. Instead:

1. Read the balance from `/v1/me`.
2. Read the cost from `/v1/models/{id}/cost`.
3. Tell the user both, then offer the two real options: a cheaper model that
   fits today, or a plan with a larger allocation, described at
   <https://aicontentdrop.com/plans>.

## Things that cost credits but are not a video

Chat replies on the website are tiered (basic, standard, premium), a finished
ad is priced from its shots with the quote as the ceiling, a drama is priced
per clip, and UGC avatar video with lip-sync has its own flat price. The read
tools on the AI Content Drop MCP server cost nothing.
The plans page at <https://aicontentdrop.com/plans> carries the current numbers;
quote from there.

## What to tell a user, always

The model you chose, why, and the credit cost — **before** spending it. If the
cheapest viable model is within a credit or two of a better one, say that and
let them decide. After the run, report credits actually spent (successes only)
and note that failures cost nothing.
