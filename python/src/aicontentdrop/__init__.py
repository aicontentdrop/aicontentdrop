"""Official Python SDK for the AI Content Drop API.

Generate AI video and images across 35+ models on one credit balance.

The catalogue, cost estimates, the natural-language endpoint and the sandbox
need no credential at all, so a great deal of this client is useful before
anyone has an account:

    >>> from aicontentdrop import AiContentDrop
    >>> acd = AiContentDrop()                     # no key
    >>> [m["id"] for m in acd.models(max_credits=12)][:3]
    ['seedance_1_0_fast', 'veo_3_lite', 'minimax_h3']

With a key (``ACD_API_KEY`` in the environment, or ``AiContentDrop(api_key=...)``)
you can generate:

    >>> video = acd.generate_video_and_wait(prompt="a red balloon over a city",
    ...                                     model="kling_3_0")   # doctest: +SKIP
    >>> video["video_url"]                                       # doctest: +SKIP

Credits are flat per generation and charged ONLY on success, so a failed or
blocked generation costs nothing and there is no refund path to reason about.

Docs: https://aicontentdrop.com/developers
"""

from .client import (
    AiContentDrop,
    AcdError,
    DEFAULT_BASE_URL,
    __version__,
)

__all__ = ["AiContentDrop", "AcdError", "DEFAULT_BASE_URL", "__version__"]
