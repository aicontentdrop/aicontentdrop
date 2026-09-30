# AI Content Drop agent skills

Thirteen focused, MIT-licensed skills teach agents how to use the AI Content Drop
API safely and economically. They are source-controlled with the official
[TypeScript SDK and CLI](https://www.npmjs.com/package/aicontentdrop), and each
one remains independently installable.

## Install

Point the skills CLI at the public repository's root `skills/` directory, where
the thirteen product skills are mirrored for direct discovery:

```bash
# Inspect the available skills first
npx skills add aicontentdrop/aicontentdrop/skills --list

# Install a single skill
npx skills add aicontentdrop/aicontentdrop/skills \
  --skill ai-video-model-picker
```

To install the complete collection, name all thirteen explicitly:

```bash
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

## Capability map

| Skill | Use it for |
| --- | --- |
| `ai-video-model-picker` | Select a video model and quote the full job before spending credits. |
| `video-prompt-writer` | Turn a brief into a shot-first text-to-video or image-to-video prompt. |
| `image-generation` | Choose an image model, iterate cheaply, and produce a reference frame. |
| `batch-generation-runner` | Quote, submit, poll, resume, and report multi-shot jobs safely. |
| `api-error-handling` | Interpret stable error codes, rate limits, retries, and idempotency conflicts. |
| `credits-and-plans` | Explain current model costs, balances, plan tiers, and whether a job fits a balance. |
| `marketing-studio-ad` | Brief, quote, approve, start and poll a finished ad or UGC video through the studio tools. |
| `canvas-board` | Plan on a board: lay out text, media and generation cards, quote and approve each render, hand over the board link. |
| `competitor-ad-research` | Search the ads competitors run, keep the ones worth studying, decode a winner into a brief, and put it on a board. |
| `video-agent` | Hand a whole campaign to Drop, the video agent: brief, clarifying questions, approve each paid step by its exact quote. |
| `drama-studio` | Write, accept, price, render and cut a short vertical drama through the drama tools. |
| `short-drama-writer` | Write a short drama as text: premise tests, hooks, power moves, a shot per beat, an ending that demands the next episode. |
| `muse-connector` | Drive the MCP server from a host that builds its own client: call order, quoting, polling, and refusal codes. |

The live API contract is [OpenAPI 3.1](https://aicontentdrop.com/openapi.json).
Current model costs come from the [model catalogue](https://aicontentdrop.com/v1/models),
not from remembered values inside an agent conversation. Plan questions go to
the informational [plans page](https://aicontentdrop.com/plans).
