import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env.local")

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
TEXT_MODEL = os.getenv("TEXT_MODEL", "gpt-5.4-mini-2026-03-17")
NPC_MODEL = os.getenv("NPC_MODEL", "gpt-5.6-luna")
OPENAI_IMAGE_MODEL = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-2")
OPENAI_IMAGE_QUALITY = os.getenv("OPENAI_IMAGE_QUALITY", "medium")
OPENAI_IMAGE_SIZE = os.getenv("OPENAI_IMAGE_SIZE", "1024x1024")
TTS_MODEL = os.getenv("TTS_MODEL", "gpt-4o-mini-tts")
TRANSCRIBE_MODEL = os.getenv("TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe")
MODERATION_MODEL = os.getenv("MODERATION_MODEL", "omni-moderation-latest")
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
SARVAM_STORY_MODEL = os.getenv("SARVAM_STORY_MODEL", "sarvam-105b")
SARVAM_STORY_MAX_TOKENS = int(os.getenv("SARVAM_STORY_MAX_TOKENS", "16384"))
SARVAM_NPC_MODEL = os.getenv("SARVAM_NPC_MODEL", "sarvam-30b")
SARVAM_STT_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v3")
SARVAM_TTS_MODEL = os.getenv("SARVAM_TTS_MODEL", "bulbul:v3")
SARVAM_TRANSLATE_MODEL = os.getenv("SARVAM_TRANSLATE_MODEL", "sarvam-translate:v1")
SARVAM_HTTP_TIMEOUT_SECONDS = float(os.getenv("SARVAM_HTTP_TIMEOUT_SECONDS", "90"))
LARGE_STRUCTURED_OUTPUT_PROVIDER = os.getenv(
    "LARGE_STRUCTURED_OUTPUT_PROVIDER", "openai"
).strip().lower()
if LARGE_STRUCTURED_OUTPUT_PROVIDER not in {"openai", "sarvam"}:
    raise RuntimeError(
        "LARGE_STRUCTURED_OUTPUT_PROVIDER must be either 'openai' or 'sarvam'"
    )
ASSETS_DIR = Path(os.getenv("ASSETS_DIR", "./local-assets"))
STATIC_DIR = Path(os.getenv("STATIC_DIR", "./dist"))
PORT = int(os.getenv("PORT", "8000"))

# Dev mode: cache all AI generations to disk, skip API calls on cache hit
DEV_CACHE = os.getenv("DEV_CACHE", "true").lower() == "true"
DEV_CACHE_DIR = Path(os.getenv("DEV_CACHE_DIR", "./dev-cache"))
