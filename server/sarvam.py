from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import re
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel

from server.config import (
    ASSETS_DIR,
    SARVAM_API_KEY,
    SARVAM_HTTP_TIMEOUT_SECONDS,
    SARVAM_NPC_MODEL,
    SARVAM_STORY_MODEL,
    SARVAM_STORY_MAX_TOKENS,
    SARVAM_STT_MODEL,
    SARVAM_TRANSLATE_MODEL,
    SARVAM_TTS_MODEL,
)
from server.schema_utils import make_strict_schema
from server.schema import GameBible


CHAT_URL = "https://api.sarvam.ai/v1/chat/completions"

LANGUAGES: dict[str, dict[str, str]] = {
    "en-IN": {"native": "English", "english": "English"},
    "hi-IN": {"native": "हिन्दी", "english": "Hindi"},
    "kn-IN": {"native": "ಕನ್ನಡ", "english": "Kannada"},
    "ta-IN": {"native": "தமிழ்", "english": "Tamil"},
    "te-IN": {"native": "తెలుగు", "english": "Telugu"},
    "bn-IN": {"native": "বাংলা", "english": "Bengali"},
    "mr-IN": {"native": "मराठी", "english": "Marathi"},
    "gu-IN": {"native": "ગુજરાતી", "english": "Gujarati"},
    "pa-IN": {"native": "ਪੰਜਾਬੀ", "english": "Punjabi"},
    "ml-IN": {"native": "മലയാളം", "english": "Malayalam"},
    "od-IN": {"native": "ଓଡ଼ିଆ", "english": "Odia"},
}

SARVAM_SPEAKERS = ["priya", "anand", "kavya", "simran", "shubh", "aditya", "roopa"]
VOICE_TO_SPEAKER = {
    "nova": "priya",
    "cedar": "anand",
    "marin": "kavya",
    "coral": "simran",
    "alloy": "shubh",
    "echo": "aditya",
    "fable": "roopa",
}
_SPEECH_CLEANUP = re.compile(r"[*_`#>\[\]]|[\U0001F000-\U0001FAFF☀-➿]")
_PLACEHOLDER = re.compile(r"\{[^{}]+\}")


def require_sarvam_key() -> str:
    if not SARVAM_API_KEY:
        raise RuntimeError("SARVAM_API_KEY is not configured")
    return SARVAM_API_KEY


def language_name(language_code: str) -> str:
    return LANGUAGES.get(language_code, LANGUAGES["en-IN"])["english"]


def supported_language(language_code: str | None) -> str:
    return language_code if language_code in LANGUAGES else "en-IN"


async def structured_chat(
    *,
    model: str,
    system: str,
    user: str,
    output_model: type[BaseModel],
    max_tokens: int = 6000,
) -> BaseModel:
    schema = make_strict_schema(output_model.model_json_schema())
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "max_tokens": max_tokens,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": output_model.__name__,
                "description": "The complete structured result for the request.",
                "schema": schema,
                "strict": True,
            },
        },
    }
    headers = {
        "Authorization": f"Bearer {require_sarvam_key()}",
        "Content-Type": "application/json",
    }
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            request_payload = dict(payload)
            if attempt:
                request_payload["temperature"] = 0
                request_payload["messages"] = [
                    *payload["messages"],
                    {
                        "role": "user",
                        "content": (
                            "Your previous structured response was incomplete or invalid. "
                            "Return the complete result as compact JSON. Use short field "
                            "values, include every required field, and do not add prose."
                        ),
                    },
                ]
            async with httpx.AsyncClient(timeout=SARVAM_HTTP_TIMEOUT_SECONDS) as client:
                response = await client.post(CHAT_URL, json=request_payload, headers=headers)
            response.raise_for_status()
            choice = response.json()["choices"][0]
            if choice.get("finish_reason") == "length":
                raise RuntimeError(
                    "Sarvam stopped at the output token limit before completing the JSON"
                )
            message = choice["message"]
            tool_calls = message.get("tool_calls") or []
            content = (
                tool_calls[0].get("function", {}).get("arguments", "")
                if tool_calls
                else message.get("content") or ""
            )
            if not content.strip():
                raise RuntimeError("Sarvam returned an empty structured response")
            return output_model.model_validate_json(content)
        except (httpx.HTTPError, KeyError, ValueError, RuntimeError) as exc:
            last_error = exc
            if attempt < 2:
                await asyncio.sleep(0.8 * (2**attempt))
    raise RuntimeError(f"Sarvam structured chat failed: {last_error}")


async def story_chat(system: str, user: str, output_model: type[BaseModel]) -> BaseModel:
    return await structured_chat(
        model=SARVAM_STORY_MODEL,
        system=system,
        user=user,
        output_model=output_model,
        max_tokens=SARVAM_STORY_MAX_TOKENS,
    )


async def npc_chat(system: str, user: str, output_model: type[BaseModel]) -> BaseModel:
    return await structured_chat(
        model=SARVAM_NPC_MODEL,
        system=system,
        user=user,
        output_model=output_model,
        max_tokens=3000,
    )


def _sdk_client():
    from sarvamai import SarvamAI

    return SarvamAI(api_subscription_key=require_sarvam_key())


def _translate_sync(text: str, source_language_code: str, target_language_code: str) -> str:
    if not text.strip() or source_language_code == target_language_code:
        return text
    response = _sdk_client().text.translate(
        input=text,
        source_language_code=source_language_code,
        target_language_code=target_language_code,
        model=SARVAM_TRANSLATE_MODEL,
    )
    return response.translated_text or text


def _translation_cache_path(
    text: str,
    source_language_code: str,
    target_language_code: str,
) -> Path:
    digest = hashlib.sha256(
        f"{SARVAM_TRANSLATE_MODEL}:{source_language_code}:{target_language_code}:{text}".encode()
    ).hexdigest()[:24]
    return ASSETS_DIR / "translations" / target_language_code / f"{digest}.json"


def _restore_placeholders(source: str, translated: str) -> str:
    source_tokens = _PLACEHOLDER.findall(source)
    translated_tokens = _PLACEHOLDER.findall(translated)
    value = translated.replace("```", "").strip()
    for source_token, translated_token in zip(source_tokens, translated_tokens):
        value = value.replace(translated_token, source_token, 1)
    return value


async def translate_text(
    text: str,
    *,
    target_language_code: str,
    source_language_code: str = "en-IN",
) -> str:
    target_language_code = supported_language(target_language_code)
    if target_language_code == source_language_code or not text.strip():
        return text
    path = _translation_cache_path(text, source_language_code, target_language_code)
    if path.exists():
        return _restore_placeholders(text, json.loads(path.read_text()).get("text", text))
    translated = await asyncio.to_thread(
        _translate_sync, text, source_language_code, target_language_code
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"source": text, "text": translated}, ensure_ascii=False))
    return translated


async def translate_map(
    strings: dict[str, str],
    *,
    target_language_code: str,
    source_language_code: str = "en-IN",
) -> dict[str, str]:
    if target_language_code == source_language_code:
        return dict(strings)
    translated: dict[str, str] = {}
    pending: list[tuple[str, str]] = []
    for key, value in strings.items():
        if not value.strip():
            translated[key] = value
            continue
        path = _translation_cache_path(value, source_language_code, target_language_code)
        if path.exists():
            try:
                translated[key] = _restore_placeholders(
                    value, json.loads(path.read_text()).get("text", value)
                )
                continue
            except (OSError, ValueError):
                pass
        pending.append((key, value))

    # The Translate API accepts one string, so combine short UI/story fields
    # with machine-stable markers. Sequential chunks stay well below both the
    # payload limit and the provider's per-second rate limit.
    chunks: list[list[tuple[str, str]]] = []
    current: list[tuple[str, str]] = []
    current_size = 0
    for item in pending:
        item_size = len(item[1]) + 12
        if current and (current_size + item_size > 1400 or len(current) >= 18):
            chunks.append(current)
            current = []
            current_size = 0
        current.append(item)
        current_size += item_size
    if current:
        chunks.append(current)

    for chunk_index, chunk in enumerate(chunks):
        tagged = "\n".join(f"[[K{index:03d}]] {value}" for index, (_, value) in enumerate(chunk))
        batch_result = ""
        for attempt in range(3):
            try:
                batch_result = await asyncio.to_thread(
                    _translate_sync,
                    tagged,
                    source_language_code,
                    target_language_code,
                )
                break
            except Exception as exc:
                if attempt == 2:
                    print(f"[sarvam-translate:{target_language_code}:batch-{chunk_index}] {exc}")
                else:
                    await asyncio.sleep(1.0 * (attempt + 1))

        matches = list(re.finditer(r"\[\[K(\d{3})\]\]\s*", batch_result))
        parsed: dict[int, str] = {}
        for index, match in enumerate(matches):
            item_index = int(match.group(1))
            end = matches[index + 1].start() if index + 1 < len(matches) else len(batch_result)
            parsed[item_index] = batch_result[match.end():end].strip()

        for index, (key, source) in enumerate(chunk):
            parsed_value = parsed.get(index)
            value = _restore_placeholders(source, parsed_value or source)
            translated[key] = value
            if parsed_value:
                path = _translation_cache_path(source, source_language_code, target_language_code)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps({"source": source, "text": value}, ensure_ascii=False))
        if chunk_index + 1 < len(chunks):
            await asyncio.sleep(0.25)

    return {key: translated.get(key, value) for key, value in strings.items()}


async def localize_bible(bible: GameBible, target_language_code: str) -> GameBible:
    """Translate player-facing story copy while preserving every gameplay ID."""
    target_language_code = supported_language(target_language_code)
    if target_language_code == "en-IN":
        return bible.model_copy(deep=True)

    localized = bible.model_copy(deep=True)
    strings: dict[str, str] = {
        "title": bible.title,
        "setting.name": bible.setting.name,
        "setting.description": bible.setting.description,
        "narratorIntro": bible.narratorIntro,
        "reunionLine": bible.reunionLine,
        "global.askMama": "Have you seen my Mama?",
    }
    for index, value in enumerate(bible.setting.decorations):
        strings[f"setting.decorations.{index}"] = value
    for index, building in enumerate(bible.buildings):
        strings[f"buildings.{index}.name"] = building.name
        strings[f"buildings.{index}.exteriorDescription"] = building.exteriorDescription
        if building.interiorDescription:
            strings[f"buildings.{index}.interiorDescription"] = building.interiorDescription
    for index, npc in enumerate(bible.npcs):
        strings[f"npcs.{index}.species"] = npc.species
        strings[f"npcs.{index}.personality"] = npc.personality
        strings[f"npcs.{index}.lines.greeting"] = npc.lines.greeting
        strings[f"npcs.{index}.lines.hint"] = npc.lines.hint
        strings[f"npcs.{index}.lines.idle"] = npc.lines.idle
        strings[f"npcs.{index}.conversation.speechStyle"] = npc.conversation.speechStyle
        strings[f"npcs.{index}.conversation.favoriteTopic"] = npc.conversation.favoriteTopic
        strings[f"npcs.{index}.conversation.clueLeadIn"] = npc.conversation.clueLeadIn
        if npc.conversation.animalSound:
            strings[f"npcs.{index}.conversation.animalSound"] = npc.conversation.animalSound
        for item_index, value in enumerate(npc.conversation.smallTalkFacts):
            strings[f"npcs.{index}.conversation.smallTalkFacts.{item_index}"] = value
        for item_index, value in enumerate(npc.conversation.openingChoices):
            strings[f"npcs.{index}.conversation.openingChoices.{item_index}"] = value
    for index, hint in enumerate(bible.hints):
        strings[f"hints.{index}.text"] = hint.text
    for index, location in enumerate(bible.candidateLocations):
        strings[f"locations.{index}.name"] = location.name
        strings[f"locations.{index}.description"] = location.description
        if location.clueFacts:
            strings[f"locations.{index}.attribute"] = location.clueFacts.attribute
            strings[f"locations.{index}.direction"] = location.clueFacts.direction
            strings[f"locations.{index}.object"] = location.clueFacts.object

    translated = await translate_map(strings, target_language_code=target_language_code)
    localized.title = translated["title"]
    localized.setting.name = translated["setting.name"]
    localized.setting.description = translated["setting.description"]
    localized.narratorIntro = translated["narratorIntro"]
    localized.reunionLine = translated["reunionLine"]
    localized.setting.decorations = [
        translated[f"setting.decorations.{index}"]
        for index in range(len(localized.setting.decorations))
    ]
    for index, building in enumerate(localized.buildings):
        building.name = translated[f"buildings.{index}.name"]
        building.exteriorDescription = translated[f"buildings.{index}.exteriorDescription"]
        if building.interiorDescription:
            building.interiorDescription = translated[f"buildings.{index}.interiorDescription"]
    for index, npc in enumerate(localized.npcs):
        npc.species = translated[f"npcs.{index}.species"]
        npc.personality = translated[f"npcs.{index}.personality"]
        npc.lines.greeting = translated[f"npcs.{index}.lines.greeting"]
        npc.lines.hint = translated[f"npcs.{index}.lines.hint"]
        npc.lines.idle = translated[f"npcs.{index}.lines.idle"]
        npc.conversation.speechStyle = translated[f"npcs.{index}.conversation.speechStyle"]
        npc.conversation.favoriteTopic = translated[f"npcs.{index}.conversation.favoriteTopic"]
        npc.conversation.clueLeadIn = translated[f"npcs.{index}.conversation.clueLeadIn"]
        if npc.conversation.animalSound:
            npc.conversation.animalSound = translated[f"npcs.{index}.conversation.animalSound"]
        npc.conversation.smallTalkFacts = [
            translated[f"npcs.{index}.conversation.smallTalkFacts.{item_index}"]
            for item_index in range(len(npc.conversation.smallTalkFacts))
        ]
        npc.conversation.openingChoices = [
            translated[f"npcs.{index}.conversation.openingChoices.{item_index}"]
            for item_index in range(len(npc.conversation.openingChoices))
        ]
        if npc.conversation.openingChoices:
            npc.conversation.openingChoices[0] = translated["global.askMama"]
        else:
            npc.conversation.openingChoices = [translated["global.askMama"]]
    for index, hint in enumerate(localized.hints):
        hint.text = translated[f"hints.{index}.text"]
    for index, location in enumerate(localized.candidateLocations):
        location.name = translated[f"locations.{index}.name"]
        location.description = translated[f"locations.{index}.description"]
        if location.clueFacts:
            location.clueFacts.attribute = translated[f"locations.{index}.attribute"]
            location.clueFacts.direction = translated[f"locations.{index}.direction"]
            location.clueFacts.object = translated[f"locations.{index}.object"]
    return localized


def _transcribe_sync(audio: bytes, filename: str, language_code: str) -> dict[str, Any]:
    response = _sdk_client().speech_to_text.transcribe(
        file=(filename, audio),
        model=SARVAM_STT_MODEL,
        mode="transcribe",
        language_code=language_code if language_code in LANGUAGES else "unknown",
    )
    return {
        "text": response.transcript or "",
        "languageCode": response.language_code or supported_language(language_code),
        "confidence": getattr(response, "language_probability", None),
    }


async def transcribe_audio(
    audio: bytes,
    *,
    filename: str = "audio.webm",
    language_code: str = "unknown",
) -> dict[str, Any]:
    return await asyncio.to_thread(_transcribe_sync, audio, filename, language_code)


def _tts_sync(text: str, language_code: str, speaker: str, pace: float) -> bytes:
    cleaned = _SPEECH_CLEANUP.sub("", text).strip()[:2400] or "…"
    response = _sdk_client().text_to_speech.convert(
        text=cleaned,
        target_language_code=supported_language(language_code),
        speaker=VOICE_TO_SPEAKER.get(speaker, speaker if speaker in SARVAM_SPEAKERS else "priya"),
        model=SARVAM_TTS_MODEL,
        pace=max(0.5, min(2.0, pace)),
        output_audio_codec="mp3",
        speech_sample_rate=24000,
    )
    return base64.b64decode(response.audios[0])


async def synthesize_speech(
    text: str,
    *,
    language_code: str,
    speaker: str = "priya",
    pace: float = 1.0,
) -> bytes:
    return await asyncio.to_thread(_tts_sync, text, language_code, speaker, pace)
