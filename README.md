# aicontentdrop

Official CLI and TypeScript SDK for [AI Content Drop](https://aicontentdrop.com) —
generate AI video and images across 35+ models from the terminal or from code.

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

## For AI agents

- MCP server: `POST https://aicontentdrop.com/mcp` (Streamable HTTP) — manifest
  at [`/.well-known/mcp.json`](https://aicontentdrop.com/.well-known/mcp.json)
- Docs-only MCP: `POST https://aicontentdrop.com/mcp/docs`
- Agent contract: [`/auth.md`](https://aicontentdrop.com/auth.md)
- OpenAPI 3.1: [`/openapi.json`](https://aicontentdrop.com/openapi.json)
- Skill: [`SKILL.md`](./SKILL.md) — choosing a model and quoting cost
- Coding-agent rules for this repo: [`AGENTS.md`](./AGENTS.md)

## Links

Documentation <https://aicontentdrop.com/developers> ·
Support <support@aicontentdrop.com>

MIT licensed.
