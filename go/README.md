# aicontentdrop (Go)

Official Go client for the [AI Content Drop](https://aicontentdrop.com) API — video and image generation across 50+ models on one credit balance.

**Zero dependencies.** Standard library only, so it installs anywhere Go runs and cannot conflict with a pinned HTTP client.

```bash
go get github.com/aicontentdrop/aicontentdrop/go
```

```go
import acd "github.com/aicontentdrop/aicontentdrop/go"
```

## Most of the API needs no credential

The catalogue, plans, cost quotes, batch reads, and article search answer an anonymous caller.

```go
c := acd.New()

catalogue, err := c.Models(ctx, acd.ModelQuery{Type: "video", MaxCredits: 12})
for _, m := range catalogue.Models {
        fmt.Printf("%-24s %d credits\n", m.ID, m.Credits)
}

plans, _ := c.Plans(ctx)
fmt.Println("free tier:", plans.FreeTier.Credits, "credits, card required:", plans.FreeTier.CardRequired)
```

## Generating needs a key

Create one at [/settings/integrations](https://aicontentdrop.com/settings/integrations). It reads `ACD_API_KEY` when you pass no option.

```go
c := acd.New(acd.WithAPIKey(os.Getenv("ACD_API_KEY")))

video, err := c.GenerateVideoAndWait(ctx,
        acd.VideoRequest{Prompt: "a red balloon drifting over a city at dusk", Model: "kling_3_0"},
        acd.WaitOptions{OnProgress: func(v acd.Video) { log.Println(v.Status) }},
)
if err != nil {
        log.Fatal(err)
}
fmt.Println(video.VideoURL)
```

`GenerateVideo` returns immediately with a job. A render outlives any request timeout, so either poll `Video` yourself or use `GenerateVideoAndWait`, which returns an error for any terminal status other than `completed` — a caller cannot mistake a failed job for a finished one by reading an empty `VideoURL`.

## Rehearse before you spend

`WithSandbox(true)` sends `X-Sandbox: true` on every request. Generations validate fully, reach no model, charge nothing, and return the real response shape.

```go
c := acd.New(acd.WithSandbox(true))
submission, _ := c.GenerateVideo(ctx, acd.VideoRequest{Prompt: "test", Model: "kling_3_0"})
fmt.Println(submission.Sandbox, submission.Video.CreditsUsed) // true 0
```

## Errors

Branch on `Code`, never on `Message`: the code is a contract, the message is written for a human and will change.

```go
var apiErr *acd.Error
if errors.As(err, &apiErr) {
        if apiErr.Code == "insufficient_credits" { /* top up */ }
        if apiErr.Retryable() { time.Sleep(apiErr.RetryAfter) }
}
```

Nothing is charged for a failure. Billing is post-deduct: credits move only when a generation succeeds, which is why there is no refund call in this package.

## Idempotency

Every generation call sends an `Idempotency-Key`, generated when you do not supply one. Without a key, retrying after a dropped response starts a **second** generation and charges twice. When running a batch, set `IdempotencyKey` to something derived from the item rather than the attempt.

## Anonymous read token

```go
token, _ := c.RegisterAgent(ctx, "my-agent")   // no email, no human, one call
```

Read scope only, and it raises the read rate limit. It cannot generate.

## Links

- API docs: <https://aicontentdrop.com/docs/api>
- OpenAPI: <https://aicontentdrop.com/openapi.json>
- Pricing as JSON: <https://aicontentdrop.com/v1/plans>
- MCP server: <https://aicontentdrop.com/mcp>
- Other SDKs: [`aicontentdrop` on npm](https://www.npmjs.com/package/aicontentdrop), [`aicontentdrop` on PyPI](https://pypi.org/project/aicontentdrop/)

MIT licensed.
