# aicontentdrop

[![npm](https://img.shields.io/npm/v/aicontentdrop?label=npm)](https://www.npmjs.com/package/aicontentdrop)
[![skills.sh](https://skills.sh/b/aicontentdrop/aicontentdrop)](https://skills.sh/aicontentdrop/aicontentdrop)

Official CLI and TypeScript SDK for [AI Content Drop](https://aicontentdrop.com) —
generate AI video and images across multiple leading models from the terminal or
from code.

No runtime dependencies. Works with `npx`, no install and no API key for
anything read-only.

```bash
npx aicontentdrop models --type video --max-credits 15
```

## Install

```bash
npm install -g aicontentdrop    # CLI
npm install aicontentdrop       # SDK
```

Python users can install the equally dependency-free official client from
[PyPI](https://pypi.org/project/aicontentdrop/):

```bash
pip install aicontentdrop
```

## Authentication

Reading the model catalogue, quoting costs, and asking questions need **no
credential**. Generating needs an API key you create at
[Settings → Integrations](https://aicontentdrop.com/settings/integrations) — any
account works, the free tier includes 10 credits.

```bash
export ACD_API_KEY=acd_live_…
```

Each key can carry a daily credit ceiling, so an agent holding it cannot
overspend the budget you set.

## CLI

```bash
acd models --type video --max-credits 20     # catalogue with credit costs
acd cost kling_3_0 --quantity 4              # quote before committing
acd ask "which models generate audio?"       # natural-language lookup
acd me                                       # account and credit balance
acd generate "a golden retriever surfing at sunset" --model kling_3_0 --wait
acd status <video_id>
acd list --limit 20                          # cursor-paginated
acd list --all                               # follows the cursor for you
acd register --name my-agent                 # read-scoped agent token
```

Every command prints JSON by default so scripts and agents can parse it; add
`--pretty` for humans. Failures print JSON to stderr and exit non-zero (`2`
failure, `3` rate limited).

### The video agent, from a reference

```bash
acd analyze ./reference.mp4 --rights own_work     # read a clip or image into words (free, capped)
acd drop "a 15-second vertical ad in this style" \
  --reference ./reference.mp4 --rights own_work \
  --lane auto --confirm-each                      # read it, start the run, print what it saw
acd drop "three product videos for Nimbus Tea"    # a plain run from a written goal
acd drop status <run_id> --notes                  # phase, credits, each piece's score and verdict, retry offers
acd drop retry <run_id> <piece_id> --quote <quote_id> # approve that retry at the quote shown
```

| Command | What it does |
| --- | --- |
| `analyze <file\|url> [--rights own_work\|licensed\|permission]` | `POST /v1/engine/analyze`. Prints the class with its confidence, the summary, the shots (index, size, camera, action, tags), cast, look and lines. Words only; no frame comes back. A video needs `--rights`. |
| `drop "<goal>" [--reference <file\|url>] [--lane auto\|marketing\|cinematic\|ugc\|drama] [--budget N] [--confirm-each]` | With a reference: reads it, then `POST /v1/engine/chat` with the reference on the brief. Without: `POST /v1/engine/runs`. Prints the `run_id` and what it saw. Starting charges nothing. |
| `drop status <run_id> [--notes]` | `GET /v1/engine/runs/:id`. Phase, status, credits, each piece with its `score` and `verdict`; `--notes` adds the reasons and the Director's notes. Lists every retry offer with `task_id`, `quote_id` and `credits`. |
| `drop retry <run_id> <piece_id> --quote <quote_id>` | Finds the priced retry waiting on that piece and approves it through `POST /v1/engine/runs/:id/approve`, only when its current `quote_id` is the one given (the one `drop status` showed the person). Without `--quote` it sends nothing and refuses (`--accept-quote` alone names no price and is refused too); when the retry was priced again it approves nothing, exits 2 and prints the current `quote_id` and credits (`quote_mismatch`). |

The SDK maps the same routes: `analyzeReference`, `analyzeReferenceAndWait`,
`getReference`, `startDrop`, `getDrop`, `listDrops`, `approveDrop`, plus the
pure helpers `retryOffersOf` and `findRetryOffer` that read a run for its
retry offers.

Rehearse anything that would cost credits:

```bash
acd generate "…" --model kling_3_0 --sandbox   # no provider call, no credits
```

## SDK

```ts
import { AiContentDrop } from "aicontentdrop";

const acd = new AiContentDrop({ apiKey: process.env.ACD_API_KEY });

const models = await acd.models({ type: "video", maxCredits: 20 });

// Submit and poll until the render exists. Sends an Idempotency-Key by default,
// so a retry after a dropped response cannot charge twice.
const video = await acd.generateVideoAndWait(
  { prompt: "a golden retriever surfing at sunset", aiModel: "kling_3_0" },
  { onProgress: (v) => console.error(v.status) },
);
console.log(video.video_url);

// Pagination handled for you
for await (const item of acd.allVideos()) {
  console.log(item.id, item.status);
}
```

Errors throw `AcdError` with `status`, `code`, and `retryAfter` (on 429).

## Billing handoffs

Billing uses the separate [scoped billing contract](https://aicontentdrop.com/openapi-billing.json).
It is not part of the public product MCP tool or resource surface. New checkout
creation is initially available only on a configured billing sandbox deployment;
unavailable catalog entries and unfinished subscription/history/management
projections return an explicit unavailable response. These commands do not
establish production payment readiness.

Create a key in Settings → Integrations and select each permission needed:
`billing:read` for status/history, `billing:checkout` for checkout links, or
`billing:manage` for portal access. Existing `read`/`generate` keys, OAuth tokens,
and catalog-only `acd_agent_` tokens do not gain billing permission. A generation
credit cap does not limit purchases.

```bash
acd billing catalog
acd checkout plan --sku subscription:starter:s0:monthly --catalog-version VERSION_FROM_CATALOG --idempotency-key UNIQUE_PURCHASE_INTENT --confirm-purchase
acd checkout topup --sku topup:pack_150 --catalog-version VERSION_FROM_CATALOG --idempotency-key ANOTHER_PURCHASE_INTENT --confirm-purchase
acd billing status CHECKOUT_ID
acd billing status
acd billing history --limit 10
acd billing portal --idempotency-key UNIQUE_PORTAL_INTENT
```

Checkout requires explicit human initiation and accepted catalog terms. The CLI
prints the owned hosted URL and status URL; a human completes payment in the
browser. Reuse the exact idempotency key and arguments when retrying one intent.
The `--sandbox` flag simulates generation only and is refused for billing writes;
use a configured billing sandbox host with `--base-url` instead.

The SDK maps these endpoints through `billingCatalog`, `createBillingCheckout`,
`billingCheckout`, `billingStatus`, `billingHistory`, and `createBillingPortal`.
Supply `catalogVersion`, `skuId`, `kind`, `idempotencyKey`, and `returnTarget`
to `createBillingCheckout`. Neither the SDK nor the CLI opens the returned URL.

## Install the agent skills

The public repository mirrors fourteen focused skills in its root `skills/`
directory. Use that directory as the source so discovery selects the product
collection directly:

```bash
# Preview the product skills without installing anything
npx skills add aicontentdrop/aicontentdrop/skills --list

# Install one capability
npx skills add aicontentdrop/aicontentdrop/skills \
  --skill ai-video-model-picker

# Install the complete AI Content Drop set
npx skills add aicontentdrop/aicontentdrop/skills \
  --skill ai-video-model-picker \
  --skill video-prompt-writer \
  --skill image-generation \
  --skill batch-generation-runner \
  --skill api-error-handling \
  --skill credits-and-plans \
  --skill marketing-studio-ad \
  --skill canvas-board \
  --skill competitor-ad-research \
  --skill video-agent \
  --skill recreate-reference \
  --skill drama-studio \
  --skill short-drama-writer \
  --skill muse-connector
```

Each skill is independently installable and has a narrow trigger: model
selection and quoting, video prompting, image generation, batch execution,
error recovery, credits and plans, finished ads, boards, competitor research,
the video agent, recreating a reference, short dramas, and hosts that build
their own client. See the [skills catalogue](./skills/README.md) for the
capability map.

## For AI agents

- MCP server: `POST https://aicontentdrop.com/mcp` (Streamable HTTP) — manifest
  at [`/.well-known/mcp.json`](https://aicontentdrop.com/.well-known/mcp.json)
- Docs-only MCP: `POST https://aicontentdrop.com/mcp/docs`
- Agent contract: [`/auth.md`](https://aicontentdrop.com/auth.md)
- OpenAPI 3.1: [`/openapi.json`](https://aicontentdrop.com/openapi.json)
- Skills: [`skills/`](./skills) — model selection, prompt writing, batch runs,
  error handling, credits, image generation, finished ads, boards, competitor
  research, the video agent, recreating a reference and short dramas. Also served per skill at
  `https://aicontentdrop.com/skills/<name>/SKILL.md`, indexed at
  [`/skills/index.json`](https://aicontentdrop.com/skills/index.json)
- Agent plugin: [`plugin.json`](./plugin.json) + [`mcp.json`](./mcp.json)
  (Agent Plugins v1.0.0)
- Coding-agent rules for this repo: [`AGENTS.md`](./AGENTS.md)

## Links

Documentation <https://aicontentdrop.com/developers> ·
TypeScript registry <https://www.npmjs.com/package/aicontentdrop> ·
Python registry <https://pypi.org/project/aicontentdrop/> ·
Support <support@aicontentdrop.com>

MIT licensed.
