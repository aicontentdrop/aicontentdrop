"""Offline tests for the AI Content Drop Python SDK.

Standard-library `unittest` and a stubbed transport, deliberately: this package
has no runtime dependencies and its tests should not introduce any either.

    python -m unittest discover -s tests -t .

Network behaviour is covered separately by exercising the client against
production; what is pinned here is the logic that is easy to get wrong and
invisible until a user is affected — error mapping, retryability, idempotency,
and refusing to call a failed job finished.
"""

import io
import json
import sys
import unittest
from pathlib import Path
from unittest import mock
from urllib import error

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from aicontentdrop import AcdError, AiContentDrop  # noqa: E402
from aicontentdrop import client as client_module  # noqa: E402


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False


def ok(payload):
    """A successful response, capturing the request for assertions."""
    calls = []

    def urlopen(req, timeout=None):
        calls.append(req)
        return FakeResponse(json.dumps(payload).encode())

    return urlopen, calls


def fails(status, payload, headers=None):
    def urlopen(req, timeout=None):
        raise error.HTTPError(
            req.full_url, status, "err", headers or {}, io.BytesIO(json.dumps(payload).encode())
        )

    return urlopen


class RequestBuilding(unittest.TestCase):
    def test_omits_authorization_when_there_is_no_key(self):
        urlopen, calls = ok({"models": []})
        with mock.patch.object(client_module.request, "urlopen", urlopen):
            AiContentDrop(api_key=None).models()
        # The read surface is anonymous. Sending an empty or "Bearer None"
        # header would turn a working anonymous call into a 401.
        self.assertNotIn("Authorization", calls[0].headers)

    def test_sends_bearer_key_when_present(self):
        urlopen, calls = ok({"credits": 10})
        with mock.patch.object(client_module.request, "urlopen", urlopen):
            AiContentDrop(api_key="acd_live_x").me()
        self.assertEqual(calls[0].headers["Authorization"], "Bearer acd_live_x")

    def test_max_credits_is_omitted_rather_than_sent_as_zero(self):
        urlopen, calls = ok({"models": []})
        with mock.patch.object(client_module.request, "urlopen", urlopen):
            AiContentDrop().models(type="image")
        # A `max_credits=0` on the wire filters the catalogue to nothing. The
        # server had exactly this bug on its batch path; the client must not
        # reintroduce it from this side.
        self.assertNotIn("max_credits", calls[0].full_url)

        urlopen, calls = ok({"models": []})
        with mock.patch.object(client_module.request, "urlopen", urlopen):
            AiContentDrop().models(type="image", max_credits=5)
        self.assertIn("max_credits=5", calls[0].full_url)

    def test_generation_always_carries_an_idempotency_key(self):
        urlopen, calls = ok({"video": {"id": "v1", "status": "generating"}})
        with mock.patch.object(client_module.request, "urlopen", urlopen):
            AiContentDrop(api_key="k").generate_video(prompt="p", model="m")
        # Without one, a retry after a dropped response starts a SECOND paid
        # generation. The default has to be the safe one.
        self.assertIn("Idempotency-key", calls[0].headers)

    def test_explicit_idempotency_key_wins(self):
        urlopen, calls = ok({"video": {"id": "v1", "status": "generating"}})
        with mock.patch.object(client_module.request, "urlopen", urlopen):
            AiContentDrop(api_key="k").generate_video(
                prompt="p", model="m", idempotency_key="shot-04"
            )
        self.assertEqual(calls[0].headers["Idempotency-key"], "shot-04")

    def test_sandbox_header_rides_every_request(self):
        urlopen, calls = ok({"models": []})
        with mock.patch.object(client_module.request, "urlopen", urlopen):
            AiContentDrop(sandbox=True).models()
        self.assertEqual(calls[0].headers["X-sandbox"], "true")


class ErrorMapping(unittest.TestCase):
    def test_reads_the_structured_envelope(self):
        payload = {"error": {"code": "insufficient_credits", "message": "Balance too low"}}
        with mock.patch.object(client_module.request, "urlopen", fails(402, payload)):
            with self.assertRaises(AcdError) as caught:
                AiContentDrop(api_key="k").me()
        self.assertEqual(caught.exception.code, "insufficient_credits")
        self.assertEqual(caught.exception.status, 402)
        self.assertFalse(caught.exception.is_retryable)

    def test_reads_the_legacy_string_shape_from_the_generation_aliases(self):
        # The two generation endpoints are aliases onto the website's handlers,
        # so a validation failure there still answers `{"error": "message"}`.
        with mock.patch.object(client_module.request, "urlopen", fails(400, {"error": "Bad prompt"})):
            with self.assertRaises(AcdError) as caught:
                AiContentDrop(api_key="k").generate_video(prompt="", model="m")
        self.assertEqual(caught.exception.message, "Bad prompt")

    def test_survives_a_response_that_is_not_json_at_all(self):
        def urlopen(req, timeout=None):
            raise error.HTTPError(req.full_url, 502, "bad gateway", {}, io.BytesIO(b"<html>502</html>"))

        with mock.patch.object(client_module.request, "urlopen", urlopen):
            with self.assertRaises(AcdError) as caught:
                AiContentDrop().models()
        # An edge proxy answering HTML must still raise a readable AcdError
        # rather than a JSONDecodeError from inside the SDK.
        self.assertEqual(caught.exception.status, 502)
        self.assertTrue(caught.exception.is_retryable)

    def test_retry_after_is_surfaced_on_a_429(self):
        with mock.patch.object(
            client_module.request,
            "urlopen",
            fails(429, {"error": {"code": "rate_limited"}}, {"Retry-After": "31"}),
        ):
            with self.assertRaises(AcdError) as caught:
                AiContentDrop().models()
        self.assertEqual(caught.exception.retry_after, 31)
        self.assertTrue(caught.exception.is_retryable)


class WaitLoop(unittest.TestCase):
    def _sequence(self, responses):
        it = iter(responses)

        def urlopen(req, timeout=None):
            return FakeResponse(json.dumps(next(it)).encode())

        return urlopen

    def test_polls_until_the_job_leaves_generating(self):
        urlopen = self._sequence(
            [
                {"video": {"id": "v1", "status": "generating"}},
                {"id": "v1", "status": "generating"},
                {"id": "v1", "status": "completed", "video_url": "https://x/v.mp4"},
            ]
        )
        with mock.patch.object(client_module.request, "urlopen", urlopen), mock.patch.object(
            client_module.time, "sleep"
        ):
            video = AiContentDrop(api_key="k").generate_video_and_wait(
                prompt="p", model="m", poll_interval=0
            )
        self.assertEqual(video["status"], "completed")

    def test_raises_rather_than_returning_a_failed_job(self):
        urlopen = self._sequence(
            [
                {"video": {"id": "v1", "status": "generating"}},
                {"id": "v1", "status": "failed", "error_message": "provider fell over"},
            ]
        )
        with mock.patch.object(client_module.request, "urlopen", urlopen), mock.patch.object(
            client_module.time, "sleep"
        ):
            with self.assertRaises(AcdError) as caught:
                AiContentDrop(api_key="k").generate_video_and_wait(
                    prompt="p", model="m", poll_interval=0
                )
        # A caller that only reads video_url would otherwise treat a failure as
        # a success with a missing file.
        self.assertEqual(caught.exception.code, "generation_failed")
        self.assertIn("provider fell over", caught.exception.message)


class Pagination(unittest.TestCase):
    def test_all_videos_follows_the_cursor_and_stops(self):
        pages = iter(
            [
                {"videos": [{"id": "1"}, {"id": "2"}], "has_more": True, "next_cursor": "c2"},
                {"videos": [{"id": "3"}], "has_more": False, "next_cursor": None},
            ]
        )

        def urlopen(req, timeout=None):
            return FakeResponse(json.dumps(next(pages)).encode())

        with mock.patch.object(client_module.request, "urlopen", urlopen):
            ids = [v["id"] for v in AiContentDrop(api_key="k").all_videos(page_size=2)]
        self.assertEqual(ids, ["1", "2", "3"])


if __name__ == "__main__":
    unittest.main()
