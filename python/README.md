# aicontentdrop — Python SDK

Official Python client for the [AI Content Drop](https://aicontentdrop.com) API.
Generate AI video and images across 35+ models on one credit balance.

```bash
pip install aicontentdrop
```

No runtime dependencies — everything is standard library, so it installs
anywhere Python 3.9+ runs and cannot conflict with your pinned HTTP client.

## Start without an account

The catalogue, cost estimates, the natural-language endpoint and the **sandbox**
need no credential, so you can finish an integration before anyone signs up.

```python
from aicontentdrop import AiContentDrop

acd = AiContentDrop()                       # no key

for model in acd.models(type="video", max_credits=12):
    print(model["id"], model["credits"])

print(acd.cost("kling_3_0", quantity=3))    # quote before you spend
```

Rehearse a generation for free, with full validation and no API key:

```python
rehearsal = AiContentDrop(sandbox=True)
job = rehearsal.generate_video(prompt="a red balloon over a city", model="kling_3_0")
print(job["status"], job["creditsUsed"])    # completed 0
```

## Generate

Create a key at <https://aicontentdrop.com/settings/integrations>, then put it
in `ACD_API_KEY` (or pass `api_key=`).

```python
acd = AiContentDrop()                       # reads ACD_API_KEY

video = acd.generate_video_and_wait(
    prompt="a golden retriever surfing at sunset",
    model="kling_3_0",
    on_progress=lambda v: print(v["status"]),
)
print(video["video_url"])
```

`generate_video_and_wait` raises on any terminal state other than `completed`,
so a failed job can never be mistaken for a finished one.

For manual control, `generate_video()` returns immediately and `video(id)` polls:

```python
job = acd.generate_video(prompt="…", model="kling_3_0")
while job["status"] == "generating":
    time.sleep(5)
    job = acd.video(job["id"])
```

## Handling failures

```python
from aicontentdrop import AcdError

try:
    acd.generate_video(prompt="…", model="kling_3_0")
except AcdError as exc:
    if exc.code == "insufficient_credits":
        print("Balance too low:", acd.me()["credits"])
    elif exc.is_retryable:
        time.sleep(exc.retry_after or 30)
    else:
        raise
```

Branch on `exc.code`, never on the message. Credits are charged **only on
success**, so a failure costs nothing and there is no refund to request.

## Batching

Quote a whole job in one call, and move loops of reads into one request:

```python
quote = acd.cost_batch([
    {"model_id": "kling_3_0",  "quantity": 8},
    {"model_id": "veo_3_fast", "quantity": 2},
])
print(quote["credits_total"])

results = acd.batch([
    {"id": "video", "method": "GET", "path": "/v1/models?type=video"},
    {"id": "image", "method": "GET", "path": "/v1/models?type=image"},
])
```

Give each item in a batch its own stable `idempotency_key` derived from the item
rather than the attempt — that is what makes a run resumable after a crash
instead of paying twice.

## Reference

| | |
| --- | --- |
| Docs | <https://aicontentdrop.com/developers> |
| OpenAPI 3.1 | <https://aicontentdrop.com/openapi.json> |
| Pricing, as markdown | <https://aicontentdrop.com/pricing.md> |
| Errors and retries | <https://aicontentdrop.com/docs/errors> |
| Rate limits | <https://aicontentdrop.com/docs/rate-limits> |
| Agent skills | <https://aicontentdrop.com/skills/index.json> |
| Source | <https://github.com/aicontentdrop/aicontentdrop> |

## Tests

No test dependencies either — standard-library `unittest`:

```bash
python -m unittest discover -s tests -t .
```

MIT licensed.
