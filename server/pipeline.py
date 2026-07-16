import asyncio
import base64
from datetime import datetime, timezone
from nanoid import generate as nanoid
from server.schema import Game, GameAssets, RoomAssets, RoomAnnotation
from server.gamestore import set_game, snapshot_game
from server.events import emit
from server.storage import save_asset
from server.postprocess import (
    post_process_annotation, repair_bible,
    repair_hint_elimination, derive_hint_logic, is_degenerate,
)
from server.ai import (
    generate_bible, generate_street_scene, generate_outline_pass,
    extract_hotspots, generate_character_sprites, generate_room_image,
    extract_room_annotation, generate_tts,
    npc_voice, NARRATOR_VOICE,
)

CANNED_IDEAS = ["a pumpkin farm in autumn", "a tiny seaside village", "a dinosaur birthday party"]

# Keep references to fire-and-forget tasks so they aren't garbage-collected.
_bg_tasks: set[asyncio.Task] = set()


def spawn_task(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)
    return task


def pick_random_idea() -> str:
    import random
    return random.choice(CANNED_IDEAS)


def _set_stage(game: Game, stage: str, status: str, meta: dict | None = None) -> None:
    game.stages[stage] = status  # type: ignore
    emit(game.id, {"type": "stage", "stage": stage, "status": status, **({"meta": meta} if meta else {})})
    set_game(game)


async def run_pipeline(idea: str) -> Game:
    game = Game(
        id=nanoid(),
        idea=idea,
        createdAt=datetime.now(timezone.utc).isoformat(),
        status="generating",
        stages={s: "pending" for s in ["bible", "street", "outline", "hotspots", "character", "tts"]},
        assets=GameAssets(),
    )
    set_game(game)
    spawn_task(_execute(game))
    return game


async def _execute(game: Game) -> None:
    try:
        # Stage 1: Bible
        _set_stage(game, "bible", "running")
        bible = await generate_bible(game.idea)
        if not derive_hint_logic(bible):
            print(f"[pipeline:{game.id}] bible triangulation invalid, retrying")
            bible = await generate_bible(
                game.idea,
                "Previous hint triangulation was invalid — the three hints together must eliminate every "
                "candidate location except finalLocationId, and must never eliminate finalLocationId. "
                "Redesign the hints and eliminatesLocationIds so exactly one location survives all three.",
            )
            if not derive_hint_logic(bible):
                print(f"[pipeline:{game.id}] triangulation still invalid after retry -> truthful fallback")
                bible = repair_hint_elimination(bible)
        bible = repair_bible(bible)
        game.bible = bible
        for i, npc in enumerate(bible.npcs):
            npc.ttsVoice = npc_voice(i)
        for b in [b for b in bible.buildings if b.isEnterable]:
            game.stages[f"room_{b.id}"] = "pending"
            game.assets.rooms[b.id] = RoomAssets()
        _set_stage(game, "bible", "done", {"title": bible.title})
        snapshot_game(game)

        # Stages 2-4 (critical path) + 5 (parallel)
        await asyncio.gather(
            _run_street_chain(game),
            _run_character(game),
        )

        if game.assets.streetUrl and game.annotation and game.assets.characterFrontUrl:
            game.status = "playable"
            emit(game.id, {"type": "playable"})
            set_game(game)
            snapshot_game(game)

        # Background: rooms + TTS
        await asyncio.gather(
            _run_rooms(game),
            _run_tts(game),
            return_exceptions=True,
        )

        emit(game.id, {"type": "done"})
        set_game(game)
        snapshot_game(game)

    except Exception as e:
        print(f"[pipeline:{game.id}] fatal: {e}")
        game.status = "failed"
        emit(game.id, {"type": "failed", "message": str(e)})
        set_game(game)


async def _run_street_chain(game: Game) -> None:
    bible = game.bible
    assert bible

    _set_stage(game, "street", "running")
    street_bytes = await generate_street_scene(bible)
    url = save_asset(f"games/{game.id}/street.png", street_bytes)
    game.assets.streetUrl = url
    street_b64 = base64.b64encode(street_bytes).decode()
    _set_stage(game, "street", "done", {"url": url})

    _set_stage(game, "outline", "running")
    outline_bytes: bytes | None = None
    try:
        outline_bytes = await generate_outline_pass(street_bytes)
        outline_b64 = base64.b64encode(outline_bytes).decode()
        game.assets.outlineUrl = save_asset(f"games/{game.id}/outline.png", outline_bytes)
        _set_stage(game, "outline", "done")
    except Exception as e:
        print(f"[pipeline:{game.id}] outline failed, using street: {e}")
        outline_b64 = street_b64
        _set_stage(game, "outline", "failed")

    _set_stage(game, "hotspots", "running")
    raw = await extract_hotspots(bible, street_b64, outline_b64)
    # Model grid only matters when there's no outline to derive collision from
    if is_degenerate(raw.grid) and outline_bytes is None:
        print(f"[pipeline:{game.id}] degenerate grid from model, retrying with correction")
        raw = await extract_hotspots(
            bible, street_b64, outline_b64,
            correction="Your previous walkability grid was invalid — nearly every cell had the same value. "
                       "Look at the image carefully: buildings, planted fields, and large objects are '0'; "
                       "open paths and grass are '1'. The grid must contain a realistic mix of both.",
        )
    game.annotation = post_process_annotation(raw, outline_bytes)
    _set_stage(game, "hotspots", "done")
    snapshot_game(game)


async def _run_character(game: Game) -> None:
    bible = game.bible
    assert bible
    _set_stage(game, "character", "running")
    front, side = await generate_character_sprites(bible)
    game.assets.characterFrontUrl = save_asset(f"games/{game.id}/char_front.png", front)
    game.assets.characterSideUrl = save_asset(f"games/{game.id}/char_side.png", side)
    _set_stage(game, "character", "done", {"url": game.assets.characterFrontUrl})


async def _run_rooms(game: Game) -> None:
    bible = game.bible
    assert bible
    enterable = [b for b in bible.buildings if b.isEnterable]

    async def do_room(building):
        key = f"room_{building.id}"
        _set_stage(game, key, "running")
        try:
            img = await generate_room_image(bible, building.id)
            url = save_asset(f"games/{game.id}/room_{building.id}.png", img)
            b64 = base64.b64encode(img).decode()
            try:
                ann = await extract_room_annotation(b64)
            except Exception:
                ann = RoomAnnotation(
                    npcBox={"x": 400, "y": 250, "w": 220, "h": 400},
                    exit={"x": 512, "y": 980},
                )
            game.assets.rooms[building.id] = RoomAssets(imageUrl=url, annotation=ann)
            _set_stage(game, key, "done", {"url": url})
        except Exception as e:
            print(f"[pipeline:{game.id}] room {building.id} failed: {e}")
            _set_stage(game, key, "failed")
        snapshot_game(game)

    await asyncio.gather(*[do_room(b) for b in enterable])


async def _run_tts(game: Game) -> None:
    bible = game.bible
    assert bible
    _set_stage(game, "tts", "running")

    lines = [
        ("narrator.intro", bible.narratorIntro, NARRATOR_VOICE),
        ("narrator.allHints", "You have all the hints! Where do you think Mama went?", NARRATOR_VOICE),
        ("narrator.reunion", bible.reunionLine, NARRATOR_VOICE),
    ]
    for i, npc in enumerate(bible.npcs):
        voice = npc.ttsVoice or npc_voice(i)
        lines += [
            (f"npc_{npc.id}.greeting", npc.lines.greeting, voice),
            (f"npc_{npc.id}.hint", npc.lines.hint, voice),
            (f"npc_{npc.id}.idle", npc.lines.idle, voice),
        ]
    for building in bible.buildings:
        if not building.isEnterable:
            lines.append((
                f"building_{building.id}.look",
                f"{building.name}. {building.exteriorDescription} Mama is not here.",
                NARRATOR_VOICE,
            ))

    async def do_tts(key, text, voice):
        try:
            data = await generate_tts(text, voice)
            url = save_asset(f"games/{game.id}/audio/{key}.mp3", data)
            game.assets.audio[key] = url
            set_game(game)
        except Exception as e:
            print(f"[tts:{game.id}] {key} failed: {e}")

    await asyncio.gather(*[do_tts(k, t, v) for k, t, v in lines])
    _set_stage(game, "tts", "done")
    snapshot_game(game)
