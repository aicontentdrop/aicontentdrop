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

The public repository mirrors thirteen focused skills in its root `skills/`
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
  --skill drama-studio \
  --skill short-drama-writer \
  --skill muse-connector
```

Each skill is independently installable and has a narrow trigger: model
selection and quoting, video prompting, image generation, batch execution,
error recovery, credits and plans, finished ads, boards, competitor research,
the video agent, short dramas, and hosts that build their own client. See the
[skills catalogue](./skills/README.md) for the capability map.

## For AI agents

- MCP server: `POST https://aicontentdrop.com/mcp` (Streamable HTTP) — manifest
  at [`/.well-known/mcp.json`](https://aicontentdrop.com/.well-known/mcp.json)
- Docs-only MCP: `POST https://aicontentdrop.com/mcp/docs`
- Agent contract: [`/auth.md`](https://aicontentdrop.com/auth.md)
- OpenAPI 3.1: [`/openapi.json`](https://aicontentdrop.com/openapi.json)
- Skills: [`skills/`](./skills) — model selection, prompt writing, batch runs,
  error handling, credits, image generation, finished ads, boards, competitor
  research, the video agent and short dramas. Also served per skill at
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
