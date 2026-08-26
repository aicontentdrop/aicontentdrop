---
name: credits-and-plans
description: Answer what an AI Content Drop generation costs, what a plan includes, and whether a user can afford a job before running it. Covers the flat per-generation credit model, the free tier, plan tiers and top-up packs, checking a balance, and the charge-on-success rule. Use when asked about pricing, credits, billing, "can I afford this", "how much will this cost", or when a call returns insufficient_credits.
license: MIT
metadata:
  homepage: https://aicontentdrop.com/pricing.md
  balance_endpoint: https://aicontentdrop.com/v1/me
---

# What it costs, and how to say so before spending it

## The model in one paragraph

Credits are **flat per generation**, not per second. A model has one price; a
five-second clip and a ten-second clip on that model cost the same. Credits are
deducted **only when a generation succeeds** — a safety block, a provider
failure, a validation error and a timeout all cost nothing, which is why the
product has no refund path at all.

## Reading the real numbers

Never quote a price from memory; the catalogue moves. Every price endpoint is
free to read and needs no credential.

```bash
# every video model and its flat cost
curl -s "https://aicontentdrop.com/v1/models?type=video"

# only what fits a budget
curl -s "https://aicontentdrop.com/v1/models?type=video&max_credits=20"

# one model, one job
curl -s "https://aicontentdrop.com/v1/models/kling_3_0/cost?quantity=3"
```

The whole plan and pack catalogue in plain markdown, written to be read by an
agent rather than scraped: <https://aicontentdrop.com/pricing.md>

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

- **Free** — 10 credits, no card. Released when the email address is confirmed,
  so an account created programmatically holds 0 until the human clicks the
  link.
- **Paid plans start at $19/month**, with larger monthly credit allocations and
  annual billing available at a discount.
- **Top-up packs** — one-time credit purchases for a user who is mid-job and out
  of credits, without changing their plan.

Read the current tiers, prices and allocations from `pricing.md` rather than
repeating figures from here; that file is generated from the same plan
definitions the checkout uses, so it cannot drift from what a user is charged.

## What needs no credits at all

A surprising amount, and it is worth telling users:

- the whole model catalogue and every cost estimate
- `POST /v1/batch` reads and `POST /v1/models/cost` quotes
- the natural-language endpoint `/ask`
- GraphQL reads and the MCP read tools
- **sandbox generations** — `X-Sandbox: true` returns the real response shape,
  runs full validation, and charges nothing, with no API key required

So "try before you buy" is literal here. You can prove an integration works
end to end before the user has an account.

## Answering `insufficient_credits` (402)

Do not retry. Do not ask for a refund — there is no such endpoint, because
nothing was charged. Instead:

1. Read the balance from `/v1/me`.
2. Read the cost from `/v1/models/{id}/cost`.
3. Tell the user both, then offer the two real options: a cheaper model that
   fits today, or a top-up.

## Things that cost credits but are not a video

Chat replies are tiered (basic, standard, premium), MCP tool executions carry a
small per-call cost, and UGC avatar video with lip-sync has its own flat price.
`pricing.md` carries the current numbers under "Costs that are not a video or an
image" — quote from there.

## What to tell a user, always

The model you chose, why, and the credit cost — **before** spending it. If the
cheapest viable model is within a credit or two of a better one, say that and
let them decide. After the run, report credits actually spent (successes only)
and note that failures cost nothing.
