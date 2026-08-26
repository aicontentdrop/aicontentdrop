# AGENTS.md — AI Content Drop CLI & SDK

Instructions for AI coding agents working with this package, and for agents that
want to *use* AI Content Drop rather than modify it.

## What this package is

`aicontentdrop` is the official CLI (`acd`) and TypeScript SDK for the
[AI Content Drop](https://aicontentdrop.com) API. It is a thin client over the
REST surface documented at <https://aicontentdrop.com/openapi.json> — one method
per endpoint, no invented abstractions.

## If you only want to USE the product

You do not need this package. In order of directness:

1. **MCP** — `POST https://aicontentdrop.com/mcp` (Streamable HTTP). Manifest at
   `/.well-known/mcp.json`. Docs-only variant at `/mcp/docs`.
2. **REST** — `https://aicontentdrop.com/v1`. Spec at `/openapi.json`.
3. **CLI** — `npx aicontentdrop models` works with no install and no key.

Read <https://aicontentdrop.com/auth.md> before attempting anything that costs
money. Short version: reading is free and needs no credential; generating needs
an `acd_live_…` key that a signed-in human creates at
<https://aicontentdrop.com/settings/integrations>.

## Rules for agents modifying this codebase

1. **The API is the contract, not this client.** If the SDK and
   `/openapi.json` disagree, the spec is right. Do not add convenience fields
   that the API does not return.
2. **No runtime dependencies.** The package must stay installable and runnable
   via `npx` with nothing to resolve. `devDependencies` are fine.
3. **Every command prints JSON by default.** `--pretty` is opt-in. Agents parse
   stdout; humans pass a flag. Errors go to stderr as JSON and exit non-zero
   (2 = failure, 3 = rate limited).
4. **Never weaken idempotency.** `generateVideo` sends an `Idempotency-Key` by
   default. Removing that makes a network retry double-charge a real user.
5. **Never hardcode a key.** Read `ACD_API_KEY` from the environment or take
   `--key`. Do not write keys to disk, logs, or error messages.
6. **Sandbox before spending.** When testing generation, pass `--sandbox` (or
   `sandbox: true`). It runs the full validation path and returns a synthetic
   result without calling a provider or charging credits.

## Build and check

```bash
npm install
npm run build      # tsc -> dist/
node dist/cli.js models --max-credits 15
```

There is no test suite in this package yet; the API contract it wraps is tested
in the server repo. If you add behaviour that is not a direct endpoint mapping
(retry logic, pagination helpers), add a test with it.

## Layout

This package is also a conformant **Agent Plugins v1** package, so the layout
is defined by the specification rather than by preference: the manifest is
closed to ten fields, MCP servers live in `mcp.json` and never inline, and
skills are discovered from `skills/`, never from a manifest array.

```
src/index.ts            SDK: AiContentDrop class, AcdError, types
src/cli.ts              CLI: argument parsing and command dispatch
plugin.json             Agent Plugins manifest (agent-plugins.org, v1.0.0)
mcp.json                MCP servers: the product surface and the docs surface
skills/<name>/SKILL.md  Importable skills (agentskills.io)
```

Adding a skill means adding one directory under `skills/` with a `SKILL.md`
whose frontmatter `name` matches the directory. Nothing registers it: discovery
is by location. Do not add a top-level field to `plugin.json` — the schema is
closed, and a client must reject or ignore anything outside those ten fields.

## Contact

Support: <support@aicontentdrop.com> · Docs: <https://aicontentdrop.com/developers>
