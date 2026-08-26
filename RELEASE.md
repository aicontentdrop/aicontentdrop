# Publishing `aicontentdrop` to npm

Everything is ready. Nothing has been sent to npm — that needs your account.

## The whole thing

```bash
cd packages/cli    # from the repo root, ALWAYS with the cd in the same command
npm login          # opens a browser; 2FA if you have it on
npm publish
```

The `cd` is not decoration. Publishing from the repository root once packed the
whole application — thousands of files — and only a version collision stopped
it reaching the registry. The root `package.json` is `"private": true` now, but
run the `cd` and the publish as one command regardless.

That's it. No `--access public` and no org to create — the package name is
unscoped, so it publishes public by default. `npm run build` runs automatically
via `prepublishOnly`, so `dist/` is always fresh in the tarball.

## Why unscoped

`@aicontentdrop/cli` would require creating an npm organization first. The
unscoped name `aicontentdrop` was free, matches the brand exactly, and needs no
setup — an agent searching npm for "aicontentdrop" lands on it directly. The
command is still `acd`.

If you later want `@aicontentdrop/sdk`, `@aicontentdrop/mcp` and so on, create
the org at <https://www.npmjs.com/org/create> then; it does not conflict with
this package.

## Verify it worked

```bash
npm view aicontentdrop version
npx aicontentdrop@latest models --type video --max-credits 15
npx aicontentdrop@latest open-api
```

The second command should list models with no API key and no install. If that
works from a clean machine, the package is doing its job.

## What ships

`files` in `package.json` limits the tarball to `dist/`, `README.md`,
`AGENTS.md`, `skills/`, `plugin.json`, `mcp.json`, and `LICENSE` — 16 files,
~21 kB. Source is not published. Check without sending anything:

```bash
npm pack --dry-run
```

## Known gap: no `repository` field

`package.json` has `homepage` and `bugs` pointing at real URLs, but no
`repository` — because the public repo does not exist yet. That is deliberate: a
repository URL that 404s is exactly what a squatter package looks like, and it
would cost more trust than it earns.

When you create the public repo (deferred "A2"), add it back and ship 0.1.1:

```bash
npm pkg set repository.type=git
npm pkg set repository.url="git+https://github.com/<owner>/aicontentdrop-cli.git"
npm version patch
npm publish
```

Agent-readiness scanners specifically read `repository` and `homepage` to
confirm a package is the official SDK rather than a lookalike, so this is worth
closing once the repo exists.

## After publishing

1. **Public repo** — push this directory to a public GitHub repo so
   `AGENTS.md`, `plugin.json`, and `SKILL.md` are discoverable. A private repo
   reads as absent to a scanner.
2. **skills.sh** — from the repo root, `npx skills add`. See
   <https://skills.sh/docs>.
3. **Drop the `unpublished` marker** — `plugin.json` carries
   `commands.acd.status: "unpublished"` plus a `statusNote` saying the install
   line will fail. That manifest is served live at
   <https://aicontentdrop.com/plugin.json>, so leaving the marker in after
   publishing tells agents not to install a package that now exists. Delete
   both fields and redeploy.
4. **Un-hedge the copy** — `/llms.txt` and `developers.tsx` both label the
   package "not on npm yet". Both become wrong the moment you publish.

## Subsequent releases

```bash
npm version patch   # or minor / major — commits and tags
npm publish
```

npm never lets a version be reused, and un-publishing is only possible within 72
hours. Keep the SDK a thin mapping over `/openapi.json`; if the spec and the
client disagree, the spec is right. See `AGENTS.md`.
