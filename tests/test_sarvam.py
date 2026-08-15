from __future__ import annotations

import asyncio
import os
import unittest
from unittest.mock import patch

os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("SARVAM_API_KEY", "test-key")

from pydantic import BaseModel

from server.sarvam import structured_chat


class SampleResult(BaseModel):
    greeting: str
    count: int


class FakeResponse:
    def __init__(self, data: dict):
        self._data = data

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._data


class FakeAsyncClient:
    responses: list[FakeResponse] = []
    payloads: list[dict] = []

    def __init__(self, **_kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, _url: str, *, json: dict, headers: dict):
        del headers
        self.payloads.append(json)
        return self.responses.pop(0)


class StructuredChatTests(unittest.TestCase):
    def setUp(self) -> None:
        FakeAsyncClient.responses = []
        FakeAsyncClient.payloads = []

    def test_uses_strict_json_schema_with_provider_reasoning_default(self) -> None:
        FakeAsyncClient.responses = [
            FakeResponse({
                "choices": [{
                    "finish_reason": "stop",
                    "message": {"content": '{"greeting":"hello","count":3}'},
                }]
            })
        ]

        with patch("server.sarvam.httpx.AsyncClient", FakeAsyncClient):
            result = asyncio.run(structured_chat(
                model="sarvam-105b",
                system="Return a result.",
                user="Hello",
                output_model=SampleResult,
                max_tokens=4096,
            ))

        self.assertEqual(result.count, 3)
        payload = FakeAsyncClient.payloads[0]
        self.assertNotIn("reasoning_effort", payload)
        self.assertEqual(payload["response_format"]["type"], "json_schema")
        self.assertTrue(payload["response_format"]["json_schema"]["strict"])
        self.assertNotIn("tools", payload)

    def test_retries_when_first_completion_is_truncated(self) -> None:
        FakeAsyncClient.responses = [
            FakeResponse({
                "choices": [{
                    "finish_reason": "length",
                    "message": {"content": '{"greeting":"hel'},
                }]
            }),
            FakeResponse({
                "choices": [{
                    "finish_reason": "stop",
                    "message": {"content": '{"greeting":"hello","count":2}'},
                }]
            }),
        ]

        with (
            patch("server.sarvam.httpx.AsyncClient", FakeAsyncClient),
            patch("server.sarvam.asyncio.sleep", return_value=None),
        ):
            result = asyncio.run(structured_chat(
                model="sarvam-105b",
                system="Return a result.",
                user="Hello",
                output_model=SampleResult,
                max_tokens=4096,
            ))

        self.assertEqual(result.count, 2)
        self.assertEqual(len(FakeAsyncClient.payloads), 2)
        retry = FakeAsyncClient.payloads[1]
        self.assertEqual(retry["temperature"], 0)
        self.assertIn("compact JSON", retry["messages"][-1]["content"])


if __name__ == "__main__":
    unittest.main()
