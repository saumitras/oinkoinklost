import asyncio
import base64
import hashlib
import io

import numpy as np
from PIL import Image
from openai import AsyncOpenAI
from google import genai
from google.genai import types as genai_types

from server.config import OPENAI_API_KEY, GEMINI_API_KEY, TEXT_MODEL, NPC_MODEL, IMAGE_MODEL, TTS_MODEL, MODERATION_MODEL
from server.cache import cache_get_bytes, cache_set_bytes, cache_get_json, cache_set_json
from server.schema import GameBible, ScreenAnnotation, RoomAnnotation, NPCModelReply
from server.schema_utils import make_strict_schema

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)
gemini_client = genai.Client(api_key=GEMINI_API_KEY)

STYLE_BLOCK = (
    "STYLE: Cozy children's storybook watercolor illustration. Soft pastel palette, "
    "warm sunlight, thick clean outlines, chunky rounded shapes, flat colors with gentle texture. "
    "Cheerful and bright, absolutely nothing scary or dark. No text, no letters, no words in the image."
)

NPC_VOICES = ["alloy", "echo", "fable"]
NARRATOR_VOICE = "nova"


def npc_voice(index: int) -> str:
    return NPC_VOICES[index % len(NPC_VOICES)]


async def _with_retry(fn, attempts: int = 2, backoff: float = 2.0):
    last: Exception | None = None
    for i in range(attempts):
        try:
            return await fn()
        except Exception as e:  # noqa: BLE001
            last = e
            if i + 1 < attempts:
                print(f"[ai] attempt {i + 1} failed ({e}), retrying in {backoff}s")
                await asyncio.sleep(backoff)
    raise last  # type: ignore[misc]


# ── Text generation ───────────────────────────────────────────────────────────

BIBLE_SYSTEM = """You are the game designer for "Oink Oink Lost", a cozy mystery game for children aged 5–8.
A baby pig named Piglet is gently lost and must find Mama Pig by collecting hints from three friendly animal neighbors.

Hard rules:
- Tone: warm, cozy, gently funny. ZERO peril. Mama is never in danger.
- No villains, no scary places, no darkness, no injuries.
- Reading level: age 5–8. Dialogue lines are at most 2 short sentences.
- Give every NPC a conversation profile: a distinctive speechStyle, favoriteTopic,
  2-3 smallTalkFacts grounded in the setting, 3 short openingChoices, and a clueLeadIn.
- Exactly 3 neighbors, 3 hints, 3 enterable buildings, 2–4 flavor buildings,
  4 candidate locations for Mama (one of which is the true finalLocation).
- Every candidateLocation id MUST be the id of one of the buildings in the scene,
  and finalLocationBuildingId MUST equal finalLocationId (Mama is at a real building
  the player can walk to).

Hint design — TRIANGULATION (follow this procedure exactly):
Step 1: For EVERY candidateLocation, fill clueFacts with three short clauses:
  attribute: sensory property; direction: where it is; object: an object/activity.
  Each clause must grammatically follow "Mama went somewhere ...", for example
  "that smells like warm apples", "beside the south gate", "with a shiny pie counter".
  Reuse the EXACT same clause string when two places share a property.
  Design the table so each final-location fact is shared by at least one other candidate,
  but only finalLocation has all three final facts.
Step 2: Each hint states ONE of those attributes of the place Mama went —
  the hint text always describes the finalLocation, never any other place. There must be
  exactly one hint of each kind: attribute, direction, object.
  ("Mama went somewhere that smells of warm apples", "I saw her waddle toward
  the gates at the south fence", "She said something about a shiny pie counter")
Step 3: For each hint, eliminatesLocationIds = the candidate locations that do
  NOT have that attribute. Rules:
  - finalLocation must NEVER appear in any eliminatesLocationIds (its attributes are all true).
  - Each hint must leave at least 2 candidates possible (eliminate at most 2).
  - Together the three hints must eliminate every candidate except finalLocation.
Step 4: In the verification field, check each of the 4 candidates against each
  hint and confirm exactly one location — the finalLocation — survives all three.
  If more than one survives, redesign the hints before answering.

The player wins by asking: "which place has ALL THREE things?" — make sure
that question has exactly one answer. Never use another language unless the user's
world idea is written in that language."""


async def generate_bible(idea: str, correction: str = "") -> GameBible:
    # Cache key includes the system prompt so prompt iterations invalidate stale bibles
    sys_hash = hashlib.sha256(BIBLE_SYSTEM.encode()).hexdigest()[:8]
    payload = f"{sys_hash}|{idea}|{correction}"
    cached = cache_get_json("bible", payload)
    if cached:
        return GameBible.model_validate(cached)

    user_msg = f'World idea: "{idea}". Design the game bible.'
    if correction:
        user_msg += f"\n\nCorrection needed: {correction}"

    async def call():
        return await openai_client.responses.parse(
            model=TEXT_MODEL,
            instructions=BIBLE_SYSTEM,
            input=user_msg,
            text={"format": {"type": "json_schema", "name": "game_bible", "schema": make_strict_schema(GameBible.model_json_schema()), "strict": True}},
        )

    response = await _with_retry(call)
    bible = GameBible.model_validate_json(response.output_text)
    cache_set_json("bible", payload, bible.model_dump())
    return bible


async def generate_npc_reply(
    bible: GameBible,
    npc_id: str,
    player_message: str,
    history: list[dict[str, str]],
    must_reveal_hint: bool,
    hint_already_collected: bool,
) -> NPCModelReply:
    """Generate characterful dialogue while the server owns clue progression."""
    npc = next((n for n in bible.npcs if n.id == npc_id), None)
    building = next((b for b in bible.buildings if b.npcId == npc_id), None)
    hint = next((h for h in bible.hints if h.npcId == npc_id), None)
    if not npc or not building or not hint:
        raise ValueError(f"NPC conversation data missing: {npc_id}")

    profile = npc.conversation
    recent_history = "\n".join(
        f"{turn.get('role', 'player')}: {turn.get('text', '')}" for turn in history[-8:]
    ) or "No earlier turns."
    small_talk = "; ".join(profile.smallTalkFacts) or bible.setting.description

    clue_rule = (
        f'You MUST naturally include this exact clue sentence verbatim in reply: "{hint.text}"'
        if must_reveal_hint
        else (
            "The player already knows the clue. You may discuss it if asked, but do not pretend it is new."
            if hint_already_collected
            else f'Do NOT reveal or paraphrase this clue yet: "{hint.text}"'
        )
    )

    instructions = f"""You are {npc.name}, a {npc.species} in the cozy game Oink Oink Lost.
Stay completely in character and speak directly to Piglet.

Character:
- Personality: {npc.personality}
- Speech style: {profile.speechStyle}
- Favorite topic: {profile.favoriteTopic}
- Room: {building.name} — {building.interiorDescription or building.exteriorDescription}
- Setting: {bible.setting.name} — {bible.setting.description}
- Small-talk facts you may use: {small_talk}

Conversation rules:
- Reply in 1-2 short sentences, at most 34 words total.
- Be warm, specific, playful, and conversational. Ask at most one question.
- Never invent another clue, Mama sighting, location fact, or game objective.
- {clue_rule}
- Return 2-3 very short suggested replies. Include an ask_mama option whenever the clue is not yet known.
- Use goodbye intent only for a natural conversation-ending choice.
"""

    user_input = (
        f"Recent conversation:\n{recent_history}\n\nPiglet says: {player_message}"
        if player_message
        else f"Recent conversation:\n{recent_history}\n\nPiglet has just approached. Give a welcoming opening line."
    )

    async def call():
        return await openai_client.responses.parse(
            model=NPC_MODEL,
            instructions=instructions,
            input=user_input,
            store=False,
            text={"format": {
                "type": "json_schema",
                "name": "npc_conversation_turn",
                "schema": make_strict_schema(NPCModelReply.model_json_schema()),
                "strict": True,
            }},
        )

    response = await _with_retry(call)
    result = NPCModelReply.model_validate_json(response.output_text)

    # The clue text is game state, not model state. Guarantee the player hears
    # the verified canonical sentence even if the model tried to paraphrase it.
    if must_reveal_hint and hint.text not in result.reply:
        result.reply = f"{result.reply.rstrip()} {profile.clueLeadIn} {hint.text}".strip()
    return result


async def extract_hotspots(bible: GameBible, street_b64: str, outline_b64: str, correction: str = "") -> ScreenAnnotation:
    building_list = "\n".join(
        f'- id "{b.id}": {b.exteriorDescription}{"  [has a door the player can enter]" if b.isEnterable else ""}'
        for b in bible.buildings
    )
    prompt = f"""You are annotating a top-down game map. Image 1 is the playable scene. Image 2 is the same scene with magenta outlines around objects and green dots on doors.
The image is 1024x1024 pixels. Coordinate system: x 0-1024 left→right, y 0-1024 top→bottom.

Buildings in the scene:
{building_list}

Tasks:
1. WALKABILITY GRID: Divide the image into a 16x16 grid (each cell 64x64 px).
   For each cell output '1' if a small character can walk there (path, street, grass, open ground)
   or '0' if blocked (building, tree, crops, water, fences, large objects).
   Buildings and planted fields are ALWAYS '0'. Open paths are ALWAYS '1'.
   A correct scene has a healthy mix of both — typically 40-75% walkable.
   Output exactly 16 strings of 16 characters, top row first.
2. DOORS: For EVERY building id listed above (including ones without enterable doors),
   give the entrance position: center x,y in pixels and its grid cell (col = x//64, row = y//64).
   The entrance is where a character standing on the path would enter — usually the door
   at the bottom/front of the building.
3. SPAWN: One walkable cell on open path near the center of the map, not adjacent to a door.
Be precise. If a cell is partly path and partly object edge, or you are unsure, mark it '1'
(walkable) — blocking open ground feels like an invisible wall and is the worst failure."""
    if correction:
        prompt += f"\n\nIMPORTANT CORRECTION: {correction}"

    img_hash = hashlib.sha256(street_b64.encode()).hexdigest()[:16]
    cache_key = f"{img_hash}|{prompt}"
    cached = cache_get_json("hotspots", cache_key)
    if cached:
        return ScreenAnnotation.model_validate(cached)

    async def call():
        return await openai_client.responses.parse(
            model=TEXT_MODEL,
            input=[
                {"role": "user", "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": f"data:image/png;base64,{street_b64}"},
                    {"type": "input_image", "image_url": f"data:image/png;base64,{outline_b64}"},
                ]}
            ],
            text={"format": {"type": "json_schema", "name": "screen_annotation", "schema": make_strict_schema(ScreenAnnotation.model_json_schema()), "strict": True}},
        )

    response = await _with_retry(call)
    annotation = ScreenAnnotation.model_validate_json(response.output_text)
    cache_set_json("hotspots", cache_key, annotation.model_dump())
    return annotation


async def extract_room_annotation(room_b64: str) -> RoomAnnotation:
    prompt = (
        "This is a game room interior, 1024x1024 pixels. Coordinates: x 0-1024 left→right, y 0-1024 top→bottom. "
        "Give: 1) The bounding box (x,y,w,h) of the animal character standing in the room. "
        "2) The exit door center (x,y) — usually at the bottom edge."
    )
    cache_key = hashlib.sha256(room_b64.encode()).hexdigest()[:16] + prompt
    cached = cache_get_json("room_annotation", cache_key)
    if cached:
        return RoomAnnotation.model_validate(cached)

    async def call():
        return await openai_client.responses.parse(
            model=TEXT_MODEL,
            input=[
                {"role": "user", "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": f"data:image/png;base64,{room_b64}"},
                ]}
            ],
            text={"format": {"type": "json_schema", "name": "room_annotation", "schema": make_strict_schema(RoomAnnotation.model_json_schema()), "strict": True}},
        )

    response = await _with_retry(call)
    annotation = RoomAnnotation.model_validate_json(response.output_text)
    cache_set_json("room_annotation", cache_key, annotation.model_dump())
    return annotation


# ── Image generation (Nano Banana) ────────────────────────────────────────────

def _extract_image_bytes(response) -> bytes:
    for part in response.candidates[0].content.parts:
        if part.inline_data:
            raw = part.inline_data.data
            return raw if isinstance(raw, bytes) else base64.b64decode(raw + "=" * (-len(raw) % 4))
    raise RuntimeError("No image in Gemini response")


async def _generate_image(prompt: str, reference_png: bytes | None = None) -> bytes:
    cache_key = prompt + (f"|ref:{hashlib.sha256(reference_png).hexdigest()[:16]}" if reference_png else "")
    cached = cache_get_bytes("images", cache_key)
    if cached:
        return cached

    contents: list = []
    if reference_png is not None:
        contents.append(genai_types.Part.from_bytes(data=reference_png, mime_type="image/png"))
    contents.append(prompt)

    async def call():
        response = await gemini_client.aio.models.generate_content(
            model=IMAGE_MODEL,
            contents=contents if reference_png is not None else prompt,
            config=genai_types.GenerateContentConfig(response_modalities=["IMAGE", "TEXT"]),
        )
        return _extract_image_bytes(response)

    data = await _with_retry(call)
    cache_set_bytes("images", cache_key, data)
    return data


async def generate_street_scene(bible: GameBible) -> bytes:
    building_list = "\n".join(f"- {b.exteriorDescription} ({b.sizeHint})" for b in bible.buildings)
    prompt = f"""{STYLE_BLOCK}

Top-down (bird's-eye, directly overhead) view of {bible.setting.name}: {bible.setting.description}

The scene must contain, clearly separated and fully visible:
{building_list}

Every building's entrance/door faces the path so a character walking on the path can reach it.
Wide open walkable ground between buildings — at least a third of the image is open path/grass.
Decorations: {', '.join(bible.setting.decorations)}.
No characters or animals. No text."""
    return await _generate_image(prompt)


async def generate_outline_pass(street_bytes: bytes) -> bytes:
    prompt = (
        "Trace this exact image. Keep every object exactly where it is. "
        "Draw a thick bright magenta (#FF00FF) CLOSED outline around every building, planted field, "
        "and large decoration — the outline must fully enclose each object including its base at the ground. "
        "Draw a thick bright green (#00FF00) small circle on each building's door/entrance. "
        "Change nothing else."
    )
    return await _generate_image(prompt, reference_png=street_bytes)


GREEN_SCREEN = (
    " The character stands alone, centered, on a COMPLETELY FLAT SOLID pure green (#00FF00) background. "
    "The entire background is one uniform green color. No shadow, no ground, no scenery, no checkered pattern."
)


def _chroma_key(png_bytes: bytes) -> bytes:
    """Remove the solid background and return a real-alpha PNG.

    The model rarely paints the exact green we ask for (it drifts to sage,
    olive, even checkerboards), so instead of matching a color we flood-fill
    from the borders with a tolerance: whatever is connected to the edge and
    roughly uniform is background.
    """
    from PIL import ImageDraw

    img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    w, h = img.size
    SENTINEL = (255, 0, 255)
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
             (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for seed in seeds:
        if img.getpixel(seed) != SENTINEL:
            ImageDraw.floodfill(img, seed, SENTINEL, thresh=60)

    arr = np.asarray(img, dtype=np.uint8)
    bg = (arr[..., 0] == 255) & (arr[..., 1] == 0) & (arr[..., 2] == 255)

    orig = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    a = np.asarray(orig, dtype=np.uint8).copy()
    a[..., 3] = np.where(bg, 0, a[..., 3])
    out = Image.fromarray(a, "RGBA")
    # Trim to content so the sprite has no huge transparent margins
    bbox = out.getchannel("A").getbbox()
    if bbox:
        out = out.crop(bbox)
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()


async def generate_character_sprites(bible: GameBible) -> tuple[bytes, bytes]:
    base = (
        f"{STYLE_BLOCK}\nCute baby pig character sprite for a children's game, {bible.player.description}, "
        f"wearing {bible.player.accessory}. Full body."
    )
    front_raw, side_raw = await asyncio.gather(
        _generate_image(base + " Facing the viewer, front view." + GREEN_SCREEN),
        _generate_image(base + " Side profile facing right, mid-waddle step." + GREEN_SCREEN),
    )
    return _chroma_key(front_raw), _chroma_key(side_raw)


async def generate_room_image(bible: GameBible, building_id: str) -> bytes:
    building = next(b for b in bible.buildings if b.id == building_id)
    npc = next(n for n in bible.npcs if n.id == building.npcId)
    prompt = f"""{STYLE_BLOCK}
Interior of {building.interiorDescription}, dollhouse front view. Single cozy room.
{npc.name} the {npc.species} ({npc.appearance}) stands on the {npc.roomPosition} side of the room,
full body visible, standing on the floor (lower half of the image).
The floor is open and uncluttered so a small character can walk around.
A door/exit is visible at the bottom edge. No text."""
    return await _generate_image(prompt)


async def generate_reunion_photo(bible: GameBible) -> bytes:
    prompt = f"""{STYLE_BLOCK}
Heartwarming reunion: baby pig (Piglet, {bible.player.description}) running joyfully toward Mama Pig at {bible.setting.name}.
Both pigs smiling, warm golden light. Cozy and sweet. No text."""
    return await _generate_image(prompt)


# ── TTS ───────────────────────────────────────────────────────────────────────

async def generate_tts(text: str, voice: str) -> bytes:
    cached = cache_get_bytes("tts", f"{voice}:{text}")
    if cached:
        return cached

    async def call():
        return await openai_client.audio.speech.create(
            model=TTS_MODEL,
            voice=voice,  # type: ignore
            input=text,
            instructions="Warm, slow, gentle storyteller voice for a young child. Cheerful.",
            response_format="mp3",
        )

    response = await _with_retry(call)
    data = response.read()
    cache_set_bytes("tts", f"{voice}:{text}", data)
    return data


# ── Moderation ────────────────────────────────────────────────────────────────

async def moderate_idea(idea: str) -> bool:
    """Returns True if flagged."""
    response = await openai_client.moderations.create(model=MODERATION_MODEL, input=idea)
    return response.results[0].flagged
