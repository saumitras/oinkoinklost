from __future__ import annotations

import asyncio
import os
import unittest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("SARVAM_API_KEY", "test-key")

from server.ai import generate_bible


class BibleProviderRoutingTests(unittest.TestCase):
    def test_openai_generates_the_complete_bible_in_one_call(self) -> None:
        expected = object()
        with (
            patch("server.ai.LARGE_STRUCTURED_OUTPUT_PROVIDER", "openai"),
            patch(
                "server.ai._generate_openai_bible",
                new=AsyncMock(return_value=expected),
            ) as openai_generate,
            patch(
                "server.ai._generate_sarvam_bible",
                new=AsyncMock(),
            ) as sarvam_generate,
        ):
            result = asyncio.run(
                generate_bible(
                    "a toy shop on clouds",
                    cozy_visuals=True,
                    language_code="hi-IN",
                )
            )

        self.assertIs(result, expected)
        openai_generate.assert_awaited_once_with(
            "a toy shop on clouds",
            correction="",
            cozy_visuals=True,
            language_code="hi-IN",
        )
        sarvam_generate.assert_not_awaited()

    def test_sarvam_generates_the_complete_bible_in_one_call(self) -> None:
        expected = object()
        with (
            patch("server.ai.LARGE_STRUCTURED_OUTPUT_PROVIDER", "sarvam"),
            patch(
                "server.ai._generate_openai_bible",
                new=AsyncMock(),
            ) as openai_generate,
            patch(
                "server.ai._generate_sarvam_bible",
                new=AsyncMock(return_value=expected),
            ) as sarvam_generate,
        ):
            result = asyncio.run(
                generate_bible(
                    "a moon station",
                    correction="Keep every room connected.",
                )
            )

        self.assertIs(result, expected)
        sarvam_generate.assert_awaited_once_with(
            "a moon station",
            correction="Keep every room connected.",
            cozy_visuals=False,
            language_code="en-IN",
        )
        openai_generate.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
