# Releasing the Go module

Go has no central registry to upload to. **A tagged public repository is the
registry**: `proxy.golang.org` fetches the module the first time anyone asks for
it and caches it permanently, and `pkg.go.dev` indexes it from there. So unlike
npm and PyPI, this release needs no account, no token, and no owner action.

The trade is that a published version is **immutable**. The proxy caches a tag
forever; re-tagging the same version does not change what `go get` fetches. A
mistake is fixed by a new version, never by moving a tag.

## The module path is the repository path

```
module github.com/aicontentdrop/aicontentdrop/go
```

That path must match where the code actually lives in the **public** repo
(`github.com/aicontentdrop/aicontentdrop`, directory `go/`). A module in a
subdirectory takes tags prefixed with that directory:

| | |
| --- | --- |
| Module | `github.com/aicontentdrop/aicontentdrop/go` |
| Tag | `go/v0.1.0` — **not** `v0.1.0` |
| Import | `import acd "github.com/aicontentdrop/aicontentdrop/go"` |

A bare `v0.1.0` tag names the repository root, which is the TypeScript CLI, and
`go get` on the module path would keep answering "no matching versions".

## Before releasing

```bash
cd packages/go

gofmt -l .            # must print nothing
go vet ./...
go test ./...
```

Then smoke the client against production. Read surface and keyless sandbox only,
so it spends nothing:

```bash
go run ./...   # or the smoke program in the release notes
```

## Publishing

1. Mirror `packages/go/` into the public repo as `go/`, commit, push.
2. Tag and push the tag:

   ```bash
   git tag go/v0.1.0
   git push origin go/v0.1.0
   ```

3. Warm the proxy — this is what actually publishes it:

   ```bash
   GOPROXY=https://proxy.golang.org GOFLAGS=-mod=mod \
     go list -m github.com/aicontentdrop/aicontentdrop/go@v0.1.0
   ```

   A version line back means the proxy has it. `pkg.go.dev` follows within the
   hour.

4. Verify a clean fetch from a directory with no `replace` directive:

   ```bash
   cd $(mktemp -d) && go mod init check
   go get github.com/aicontentdrop/aicontentdrop/go@v0.1.0
   ```

## After publishing

Only then name it as published. The site states its SDKs in several places and
each one is asserted by a test:

- `client/public/llms.txt`
- `server/agent-web/discovery-docs.ts` (`?mode=agent`, both SDK strings)
- `server/agent-web/agent-onboarding.ts` (`interfaces.sdks` — a test rule says
  this may only name registries something is actually published to)
- `server/agent-web/docs/index.md`
- `client/src/pages/developers.tsx`

A month passed once between npm going live and one of these paragraphs
admitting it, so the un-hedging is part of the release, not follow-up work.
