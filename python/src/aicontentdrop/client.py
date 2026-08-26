"""The AI Content Drop client.

WHY NO DEPENDENCIES. This SDK is imported by agents into environments they do
not control, where `pip install` of a transitive tree is the step most likely to
fail. Everything here is standard library (`urllib`), so the package installs
anywhere Python runs and can never conflict with a caller's pinned HTTP client.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, Dict, Iterator, List, Mapping, Optional
from urllib import error, parse, request

__version__ = "0.1.0"

DEFAULT_BASE_URL = "https://aicontentdrop.com"

#: Statuses that mean the job is still running.
_IN_FLIGHT = ("generating", "processing", "pending")


class AcdError(Exception):
    """An API call failed.

    The API answers failures with ``{"error": {"code", "message"}}``. Read
    :attr:`code` and never the message: the message is written for a human and
    will change, the code will not.

    :attr:`retry_after` is populated from the ``Retry-After`` header on a 429.
    Waiting exactly that long is the correct response; retrying sooner extends
    the window rather than shortening it.
    """

    def __init__(
        self,
        status: int,
        body: Optional[Mapping[str, Any]] = None,
        retry_after: Optional[int] = None,
    ) -> None:
        payload = (body or {}).get("error")
        if isinstance(payload, dict):
            self.code: str = str(payload.get("code") or f"http_{status}")
            message = str(payload.get("message") or f"Request failed with {status}")
        elif isinstance(payload, str):
            # The two generation endpoints are aliases onto the website's own
            # handlers, so a validation failure there still carries the older
            # `{"error": "message"}` string shape.
            self.code = f"http_{status}"
            message = payload
        else:
            self.code = f"http_{status}"
            message = f"Request failed with {status}"

        super().__init__(f"[{self.code}] {message}")
        self.status = status
        self.message = message
        self.body: Mapping[str, Any] = body or {}
        self.retry_after = retry_after

    @property
    def is_retryable(self) -> bool:
        """Whether retrying this exact request could succeed.

        Nothing was charged in any of these cases, so a retry costs only time.
        """
        return self.status in (429, 500, 502, 503, 504)


class AiContentDrop:
    """Client for the AI Content Drop REST API.

    :param api_key: ``acd_live_…``. Falls back to ``ACD_API_KEY``. Omit it
        entirely for the read surface, which needs no credential.
    :param base_url: Override the origin. Falls back to ``ACD_BASE_URL``.
    :param sandbox: Send ``X-Sandbox: true`` on every request. Generations then
        return the real 202 shape with full validation, reach no model, and
        charge nothing — and this works without an API key, so an integration
        can be finished before an account exists.
    :param timeout: Per-request socket timeout in seconds.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        sandbox: bool = False,
        timeout: float = 30.0,
    ) -> None:
        self.api_key = api_key or os.environ.get("ACD_API_KEY")
        self.base_url = (base_url or os.environ.get("ACD_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.sandbox = sandbox
        self.timeout = timeout

    # -- transport ----------------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Mapping[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        headers = {
            "Accept": "application/json",
            "User-Agent": f"aicontentdrop-python/{__version__}",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        if self.sandbox:
            headers["X-Sandbox"] = "true"

        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")

        req = request.Request(f"{self.base_url}{path}", data=data, headers=headers, method=method)
        try:
            with request.urlopen(req, timeout=self.timeout) as res:
                raw = res.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except error.HTTPError as exc:  # noqa: PERF203 - the error carries the body
            raw = exc.read().decode("utf-8", "replace")
            try:
                parsed = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                parsed = {"error": {"code": f"http_{exc.code}", "message": raw[:500]}}
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            raise AcdError(
                exc.code,
                parsed,
                int(retry_after) if retry_after and retry_after.isdigit() else None,
            ) from None

    # -- read surface (no credential required) -------------------------------

    def models(
        self, type: str = "video", max_credits: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """The model catalogue with flat credit costs.

        ``max_credits`` filters to what fits a budget, which is the call to
        make when a user is close to their balance.
        """
        params: Dict[str, str] = {"type": type}
        if max_credits is not None:
            params["max_credits"] = str(max_credits)
        return self._request("GET", f"/v1/models?{parse.urlencode(params)}")["models"]

    def cost(self, model_id: str, quantity: int = 1) -> Dict[str, Any]:
        """Cost of one model for a quantity, before committing to it."""
        query = parse.urlencode({"quantity": str(quantity)})
        return self._request("GET", f"/v1/models/{parse.quote(model_id)}/cost?{query}")

    def cost_batch(self, items: List[Mapping[str, Any]]) -> Dict[str, Any]:
        """Price up to 50 model/quantity pairs in one call.

        Quote the whole job before starting it. Errors are per item, so one bad
        model id does not fail the quote.
        """
        return self._request("POST", "/v1/models/cost", body={"items": list(items)})

    def batch(self, operations: List[Mapping[str, Any]]) -> Dict[str, Any]:
        """Run up to 20 read operations in one request.

        The envelope is 200 even when an operation fails, so check each result's
        own ``status`` rather than only the outer one.
        """
        return self._request("POST", "/v1/batch", body={"operations": list(operations)})

    def ask(self, query: str) -> Dict[str, Any]:
        """Ask a natural-language question about models, pricing, or the guides."""
        return self._request("POST", "/ask", body={"query": query})

    def register_agent(self, client_name: Optional[str] = None) -> Dict[str, Any]:
        """Get an anonymous read-scope bearer token. No email, no human."""
        return self._request(
            "POST", "/agent/auth/register", body={"client_name": client_name or "aicontentdrop-python"}
        )

    # -- account ------------------------------------------------------------

    def me(self) -> Dict[str, Any]:
        """Account and credit balance. Requires an API key."""
        return self._request("GET", "/v1/me")

    # -- generation ---------------------------------------------------------

    def generate_video(
        self, prompt: str, model: str, idempotency_key: Optional[str] = None, **options: Any
    ) -> Dict[str, Any]:
        """Start a video generation. Returns immediately with a job, not a video.

        An idempotency key is sent by default. Without one, retrying after a
        dropped response starts a SECOND generation and charges twice — so the
        default is the safe one, and you should override it with a stable value
        derived from the item (not the attempt) when running a batch.
        """
        payload: Dict[str, Any] = {"prompt": prompt, "model": model, **options}
        body = self._request(
            "POST",
            "/v1/generate/video",
            body=payload,
            idempotency_key=idempotency_key or f"py-{uuid.uuid4()}",
        )
        return body.get("video", body)

    def generate_image(
        self, prompt: str, model: str, idempotency_key: Optional[str] = None, **options: Any
    ) -> Dict[str, Any]:
        """Start an image generation."""
        payload: Dict[str, Any] = {"prompt": prompt, "model": model, **options}
        body = self._request(
            "POST",
            "/v1/generate/image",
            body=payload,
            idempotency_key=idempotency_key or f"py-{uuid.uuid4()}",
        )
        return body.get("image", body.get("video", body))

    def video(self, video_id: str) -> Dict[str, Any]:
        """Poll one generation."""
        return self._request("GET", f"/v1/videos/{parse.quote(video_id)}")

    def videos(self, limit: Optional[int] = None, cursor: Optional[str] = None) -> Dict[str, Any]:
        """One page of recent generations, newest first."""
        params: Dict[str, str] = {}
        if limit:
            params["limit"] = str(limit)
        if cursor:
            params["cursor"] = cursor
        query = f"?{parse.urlencode(params)}" if params else ""
        return self._request("GET", f"/v1/videos{query}")

    def all_videos(self, page_size: int = 50) -> Iterator[Dict[str, Any]]:
        """Every generation, following the cursor — the loop callers write by hand."""
        cursor: Optional[str] = None
        while True:
            page = self.videos(limit=page_size, cursor=cursor)
            for video in page.get("videos", []):
                yield video
            if not page.get("has_more") or not page.get("next_cursor"):
                return
            cursor = page["next_cursor"]

    def generate_video_and_wait(
        self,
        prompt: str,
        model: str,
        poll_interval: float = 5.0,
        timeout: float = 900.0,
        on_progress: Optional[Any] = None,
        idempotency_key: Optional[str] = None,
        **options: Any,
    ) -> Dict[str, Any]:
        """Generate and block until the render finishes.

        Raises :class:`AcdError` when the job ends in any state other than
        ``completed``, so a caller cannot mistake a failed job for a finished
        one by reading a ``video_url`` that is ``None``.
        """
        started = time.monotonic()
        video = self.generate_video(prompt, model, idempotency_key=idempotency_key, **options)

        while video.get("status") in _IN_FLIGHT:
            if time.monotonic() - started > timeout:
                raise AcdError(
                    504,
                    {
                        "error": {
                            "code": "timeout",
                            "message": f"Generation {video.get('id')} did not finish within {timeout:g}s.",
                        }
                    },
                )
            time.sleep(poll_interval)
            video = self.video(str(video["id"]))
            if on_progress is not None:
                on_progress(video)

        if video.get("status") != "completed":
            raise AcdError(
                422,
                {
                    "error": {
                        "code": "generation_failed",
                        "message": video.get("error_message")
                        or f"Generation {video.get('id')} ended with status {video.get('status')}.",
                    }
                },
            )
        return video
