# Releasing `aicontentdrop` to npm

Version `0.1.0` is already public at
<https://www.npmjs.com/package/aicontentdrop>. This checklist is for the next
release. Publishing remains an account-owner action because npm login and 2FA
must not be delegated to an unattended agent.

## Before publishing

Work from the package directory, never from the repository root:

```bash
cd packages/cli
npm run build
npm pack --dry-run
```

Publishing from the repository root once packed the whole application —
thousands of files — and only a version collision stopped it reaching the
registry. The root package is now private as a second guard, but the package
directory remains the release boundary.

Before a new release, bump the same version in all four package descriptors:

- `package.json` and `package-lock.json`
- `plugin.json`
- `.codex-plugin/plugin.json`

`npm version patch --no-git-tag-version` updates the npm files; update the two
plugin manifests to the identical value before packing. Then inspect the dry
run instead of relying on a remembered file count. The `files` allowlist should
contain only `dist/`, package documentation, `skills/`, the plugin/MCP
manifests, and `LICENSE`.

## Publish

```bash
cd packages/cli
npm login
npm publish
```

The package is unscoped and public, so no npm organization or `--access public`
flag is required. `prepublishOnly` rebuilds `dist/` immediately before upload.

## Verify the registry copy

```bash
npm view aicontentdrop version homepage repository.url
npx aicontentdrop@latest models --type video --max-credits 15
npx aicontentdrop@latest open-api
```

The read commands must work on a clean machine with no API key and no prior
install. Also confirm the npm page links back to both the official product
domain and <https://github.com/aicontentdrop/aicontentdrop>; those fields are
how an agent distinguishes the official SDK from a similarly named package.

## Skills discovery

The public repository mirrors its six product skills under the root `skills/`
directory. Verify that exact public source without installing anything:

```bash
npx skills add aicontentdrop/aicontentdrop/skills --list
```

Keep the direct subdirectory install commands in `README.md` and
`skills/README.md`. skills.sh rankings are based on real, deduplicated CLI
installs; do not loop installs or fabricate adoption. A listing and its count
will improve only as actual users install the skills.

## After publishing

1. Push the release commit and tag to the public source repository.
2. Confirm the npm tarball contains all six `SKILL.md` files and the package
   manifests, but no application source, secrets, or local paths.
3. If the package name or install command changes, update `/llms.txt`, the
   developer portal, agent onboarding, and `?mode=agent` in the same release.
4. Redeploy the website only when those public discovery surfaces changed.

npm versions cannot be reused. Keep the SDK a thin mapping over
`/openapi.json`; if the spec and the client disagree, the spec is right. See
`AGENTS.md`.
