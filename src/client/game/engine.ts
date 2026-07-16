import { Application, Sprite, Assets, Container, Graphics, Text, Texture } from 'pixi.js'
import { useGameStore, type Nearby } from './store'
import { nearestDoor, WORLD_W, WORLD_H, ROOM_BAND, CELL_SIZE } from './collision'
import { attachKeyboard, detachKeyboard, getAxis } from './input'
import { footstep } from './audio'
import type { Game } from '@shared/schema'

const SPEED = 220
const PLAYER_HEIGHT = 96
const DOOR_RADIUS = 90
const NPC_RADIUS = 150
const EXIT_RADIUS = 90

let app: Application | null = null
let initPromise: Promise<void> | null = null

// Player state lives here; the sprite is a pure render of it (bob never feeds back).
const player = { x: WORLD_W / 2, y: WORLD_H - 200, facing: 'front' as 'front' | 'left' | 'right' | 'back' }
let playerSprite: Sprite | null = null
let frontTex: Texture | null = null
let sideTex: Texture | null = null
let bobT = 0
let animT = 0
let moving = false
let stepT = 0

type SceneKind = { kind: 'street' } | { kind: 'room'; buildingId: string }
let scene: SceneKind = { kind: 'street' }

// Collision-grid debug overlay, toggled with G
let gridOverlay: Graphics | null = null
function onDebugKey(e: KeyboardEvent) {
  if (e.key === 'g' || e.key === 'G') {
    if (gridOverlay) gridOverlay.visible = !gridOverlay.visible
  }
}

// Affordances (bouncing emoji markers)
const doorMarkers = new Map<string, Container>()
const lookMarkerIds = new Set<string>()
let mamaGlow: Graphics | null = null
let npcMarker: Container | null = null
let exitMarker: Container | null = null
let npcCenter = { x: WORLD_W / 2, y: WORLD_H / 2 }
let exitPos = { x: WORLD_W / 2, y: WORLD_H - 60 }

export async function initEngine(container: HTMLDivElement): Promise<void> {
  if (initPromise) await initPromise.catch(() => {})
  destroyEngine()

  const newApp = new Application()
  // Pixi creates its own canvas (a canvas element can't survive a second
  // WebGL context after destroy, which hangs HMR remounts). Fixed logical
  // buffer; CSS (object-fit: contain) scales it, so ALL game math stays in
  // 1024x1024 image space.
  initPromise = newApp.init({
    width: WORLD_W,
    height: WORLD_H,
    backgroundColor: 0x87ceeb,
  })

  await initPromise
  app = newApp
  const canvas = newApp.canvas
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  canvas.style.objectFit = 'contain'
  container.replaceChildren(canvas)
  attachKeyboard()
  window.addEventListener('keydown', onDebugKey)
  app.ticker.add(tick)
}

export function destroyEngine() {
  detachKeyboard()
  window.removeEventListener('keydown', onDebugKey)
  gridOverlay = null
  if (app) {
    try { app.destroy(true, { children: true }) } catch { /* ignore */ }
    app = null
  }
  playerSprite = null
  frontTex = null
  sideTex = null
  doorMarkers.clear()
  lookMarkerIds.clear()
  mamaGlow = null
  npcMarker = null
  exitMarker = null
  initPromise = null
}

async function loadPlayerTextures(game: Game) {
  if (!frontTex && game.assets.characterFrontUrl) {
    frontTex = await Assets.load(game.assets.characterFrontUrl)
  }
  if (!sideTex && game.assets.characterSideUrl) {
    try { sideTex = await Assets.load(game.assets.characterSideUrl) } catch { sideTex = null }
  }
}

function makePlayerSprite(): Sprite {
  const sprite = new Sprite(frontTex ?? Texture.WHITE)
  sprite.anchor.set(0.5, 1)
  applyHeight(sprite)
  return sprite
}

function applyHeight(sprite: Sprite) {
  const tex = sprite.texture
  const scale = PLAYER_HEIGHT / tex.height
  sprite.scale.set(Math.sign(sprite.scale.x || 1) * scale, scale)
}

function makeMarker(emoji: string, size = 40, prominentLook = false): Container {
  const marker = new Container()
  marker.visible = false

  if (prominentLook) {
    const halo = new Graphics()
      .circle(0, -30, 34)
      .fill({ color: 0xffdf55, alpha: 0.25 })
      .stroke({ color: 0xffffff, alpha: 0.78, width: 3 })
    const label = new Text({
      text: '✨',
      style: { fontSize: 56 },
    })
    label.anchor.set(0.5, 1)
    marker.addChild(halo, label)
  } else {
    const label = new Text({ text: emoji, style: { fontSize: size } })
    label.anchor.set(0.5, 1)
    marker.addChild(label)
  }

  return marker
}

// ── Street scene ──────────────────────────────────────────────────────────────
export async function loadStreetScene(game: Game) {
  if (!app || !game.assets.streetUrl || !game.annotation) return
  scene = { kind: 'street' }
  app.stage.removeChildren()
  doorMarkers.clear()
  lookMarkerIds.clear()
  npcMarker = null
  exitMarker = null

  const bgTex = await Assets.load(game.assets.streetUrl)
  const bg = new Sprite(bgTex)
  bg.width = WORLD_W
  bg.height = WORLD_H
  app.stage.addChild(bg)

  await loadPlayerTextures(game)
  playerSprite = makePlayerSprite()
  const spawn = game.annotation.spawn
  player.x = (spawn.col + 0.5) * CELL_SIZE
  // Feet near the bottom of the spawn cell but strictly inside it
  player.y = (spawn.row + 0.9) * CELL_SIZE
  playerSprite.position.set(player.x, player.y)
  app.stage.addChild(playerSprite)

  // Collision debug overlay (press G): blocked cells red, doors/spawn dots
  gridOverlay = new Graphics()
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      if (game.annotation.grid[r]?.[c] !== '1') {
        gridOverlay.rect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE).fill({ color: 0xff2222, alpha: 0.28 })
      }
    }
  }
  for (const d of game.annotation.doors) {
    gridOverlay.circle(d.x, d.y, 10).fill({ color: 0x2266ff, alpha: 0.8 })
  }
  gridOverlay.visible = false
  app.stage.addChild(gridOverlay)

  // Mama's glowing beacon (revealed once the mystery is solved)
  mamaGlow = new Graphics()
  mamaGlow.circle(0, 0, 34).fill({ color: 0xffd76a, alpha: 0.45 })
  mamaGlow.circle(0, 0, 20).fill({ color: 0xffe9a8, alpha: 0.6 })
  mamaGlow.visible = false
  app.stage.addChild(mamaGlow)

  // One marker per door, shown on proximity (or always, for Mama's door after solve)
  for (const door of game.annotation.doors) {
    const isMama = door.buildingId === game.bible?.finalLocationBuildingId
    const building = game.bible?.buildings.find(b => b.id === door.buildingId)
    const hintIndex = game.bible?.hints.findIndex(h => h.npcId === building?.npcId) ?? -1
    const isLookable = !!building && !building.isEnterable
    const marker = makeMarker(
      hintIndex >= 0 ? ['1️⃣', '2️⃣', '3️⃣'][hintIndex] : '✨',
      40,
      isLookable,
    )
    marker.position.set(door.x, door.y - 14)
    doorMarkers.set(door.buildingId, marker)
    if (isLookable) lookMarkerIds.add(door.buildingId)
    app.stage.addChild(marker)
    if (isMama && mamaGlow) mamaGlow.position.set(door.x, door.y)
  }

  useGameStore.getState().setPlayerPos({ x: player.x, y: player.y })
}

// ── Room scene ────────────────────────────────────────────────────────────────
export async function loadRoomScene(game: Game, buildingId: string) {
  const room = game.assets.rooms[buildingId]
  if (!app || !room?.imageUrl || !room.annotation) return
  scene = { kind: 'room', buildingId }
  app.stage.removeChildren()
  doorMarkers.clear()
  lookMarkerIds.clear()
  mamaGlow = null

  const bgTex = await Assets.load(room.imageUrl)
  const bg = new Sprite(bgTex)
  bg.width = WORLD_W
  bg.height = WORLD_H
  app.stage.addChild(bg)

  const box = room.annotation.npcBox
  npcCenter = { x: box.x + box.w / 2, y: Math.min(box.y + box.h, ROOM_BAND.maxY) }
  npcMarker = makeMarker('💬')
  npcMarker.position.set(npcCenter.x, box.y - 6)
  app.stage.addChild(npcMarker)

  exitPos = {
    x: Math.max(ROOM_BAND.minX, Math.min(ROOM_BAND.maxX, room.annotation.exit.x)),
    y: Math.max(ROOM_BAND.minY + 40, Math.min(ROOM_BAND.maxY, room.annotation.exit.y)),
  }
  exitMarker = makeMarker('🚪', 34)
  exitMarker.position.set(exitPos.x, exitPos.y - 10)
  app.stage.addChild(exitMarker)

  await loadPlayerTextures(game)
  playerSprite = makePlayerSprite()
  // Enter through the door: spawn at the exit position
  player.x = exitPos.x
  player.y = exitPos.y - 8
  playerSprite.position.set(player.x, player.y)
  app.stage.addChild(playerSprite)

  useGameStore.getState().setPlayerPos({ x: player.x, y: player.y })
}

// ── Ticker ────────────────────────────────────────────────────────────────────
function tick(ticker: { deltaMS: number }) {
  if (!app || !playerSprite) return
  const dt = Math.min(ticker.deltaMS, 100) / 1000
  const store = useGameStore.getState()
  const { game } = store
  if (!game) return

  const { vx, vy } = getAxis()
  moving = vx !== 0 || vy !== 0

  if (moving) {
    const nx = player.x + vx * SPEED * dt
    const ny = player.y + vy * SPEED * dt

    if (scene.kind === 'street') {
      // Hackathon call: no collision — Piglet roams freely, clamped to the world
      player.x = Math.max(24, Math.min(WORLD_W - 24, nx))
      player.y = Math.max(60, Math.min(WORLD_H - 8, ny))
    } else {
      if (nx > ROOM_BAND.minX && nx < ROOM_BAND.maxX) player.x = nx
      if (ny > ROOM_BAND.minY && ny < ROOM_BAND.maxY) player.y = ny
    }

    // Trotting sound while walking
    stepT += dt
    if (stepT > 0.26) {
      stepT = 0
      footstep()
    }

    // Facing + texture
    let facing = player.facing
    if (vx < 0) facing = 'left'
    else if (vx > 0) facing = 'right'
    else if (vy < 0) facing = 'back'
    else if (vy > 0) facing = 'front'
    if (facing !== player.facing) {
      player.facing = facing
      const useSide = (facing === 'left' || facing === 'right') && sideTex
      playerSprite.texture = useSide ? sideTex! : frontTex ?? playerSprite.texture
      applyHeight(playerSprite)
      const flip = facing === 'left' ? -1 : 1
      playerSprite.scale.x = flip * Math.abs(playerSprite.scale.x)
    }
    bobT += dt * 9
  }

  // Render position = state + bob (bob never feeds back into state)
  playerSprite.position.set(player.x, player.y + (moving ? Math.sin(bobT) * 3 : 0))

  animT += dt

  // ── Proximity + affordances ──
  let nearby: Nearby | null = null

  if (scene.kind === 'street' && game.annotation && game.bible) {
    const door = nearestDoor(game.annotation, player.x, player.y, DOOR_RADIUS)
    for (const [bid, marker] of doorMarkers) {
      const isMama = bid === game.bible.finalLocationBuildingId
      const near = door?.buildingId === bid
      const building = game.bible.buildings.find(b => b.id === bid)
      const hint = game.bible.hints.find(h => h.npcId === building?.npcId)
      const isUnvisitedNeighbor = !!hint && !store.collectedHintIds.includes(hint.id)
      marker.visible = near || isUnvisitedNeighbor || (isMama && store.solved)
      if (marker.visible) {
        const base = game.annotation.doors.find(d => d.buildingId === bid)
        if (base) marker.y = base.y - 14 - Math.abs(Math.sin(animT * 3)) * 10
        const pulse = lookMarkerIds.has(bid) ? 1 + Math.sin(animT * 5) * 0.09 : 1
        marker.scale.set(pulse)
      }
    }
    if (mamaGlow) {
      mamaGlow.visible = store.solved
      const pulse = 1 + Math.sin(animT * 2.5) * 0.15
      mamaGlow.scale.set(pulse)
    }
    if (door) {
      const building = game.bible.buildings.find(b => b.id === door.buildingId)
      if (building) {
        const isMama = building.id === game.bible.finalLocationBuildingId
        nearby = {
          kind: 'door',
          buildingId: building.id,
          label: isMama && store.solved
            ? '💛 Find Mama!'
            : building.isEnterable
              ? '🚪 Knock'
              : `👀 LOOK: ${building.name}`,
          enterable: building.isEnterable,
          isMama,
        }
      }
    }
  } else if (scene.kind === 'room' && game.bible) {
    const dNpc = Math.hypot(npcCenter.x - player.x, npcCenter.y - player.y)
    const dExit = Math.hypot(exitPos.x - player.x, exitPos.y - player.y)
    const building = game.bible.buildings.find(b => b.id === (scene as { buildingId: string }).buildingId)
    const npc = game.bible.npcs.find(n => n.id === building?.npcId)

    if (npcMarker) {
      npcMarker.visible = dNpc < NPC_RADIUS
      if (npcMarker.visible) {
        const room = game.assets.rooms[(scene as { buildingId: string }).buildingId]
        const boxY = room?.annotation?.npcBox.y ?? 250
        npcMarker.y = boxY - 6 - Math.abs(Math.sin(animT * 3)) * 10
      }
    }
    if (exitMarker) exitMarker.visible = dExit < EXIT_RADIUS

    if (dNpc < NPC_RADIUS && npc) {
      nearby = { kind: 'npc', npcId: npc.id, label: `💬 Talk to ${npc.name}` }
    } else if (dExit < EXIT_RADIUS) {
      nearby = { kind: 'exit', label: '🚪 Go outside' }
    }
  }

  store.setNearby(nearby)
}

export function getApp() { return app }

// Debug handle (dev only)
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__oink = {
    player,
    getApp: () => app,
    getScene: () => scene,
    hasTicker: () => !!app?.ticker.started,
  }
}
