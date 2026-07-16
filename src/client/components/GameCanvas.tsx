import { useCallback, useEffect, useRef, useState } from 'react'
import type { Game } from '@shared/schema'
import { useGameStore } from '../game/store'
import { initEngine, destroyEngine, loadStreetScene, loadRoomScene } from '../game/engine'
import { setVirtualKey, type Dir } from '../game/input'
import { HintTracker } from './HintTracker'
import { DialogueBubble } from './DialogueBubble'
import { LocationPicker } from './LocationPicker'
import { ReunionScene } from './ReunionScene'
import { IntroOverlay } from './IntroOverlay'
import { isMuted, playAudio, playChime, setMuted, speakText, stopAudio } from '../game/audio'

interface Props {
  game: Game
  onNewAdventure: () => void
}

export function GameCanvas({ game, onNewAdventure }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const store = useGameStore()
  const [dialogue, setDialogue] = useState<{ npcId: string; sessionId: string } | null>(null)
  const conversationSessions = useRef<Record<string, string>>({})
  const pendingPickerAfterDialogue = useRef(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>(0)
  const [showIntro, setShowIntro] = useState(true)
  const [muted, setMutedState] = useState(isMuted())
  const loadedStreetUrl = useRef(game.assets.streetUrl)
  const isTouch = useRef(
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  ).current

  function showToast(msg: string, ms = 2600) {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), ms)
  }

  // Init engine once
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    initEngine(containerRef.current).then(() => {
      if (cancelled) return
      store.setGame(game)
      loadStreetScene(useGameStore.getState().game ?? game)
    }).catch(console.error)
    return () => {
      cancelled = true
      destroyEngine()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for background-completed assets (rooms, TTS)
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/game/${game.id}`)
      const updated: Game = await res.json()
      useGameStore.getState().updateGame(updated)
      const allDone = Object.values(updated.stages).every(s => s === 'done' || s === 'failed')
      if (allDone) clearInterval(interval)
    }, 4000)
    return () => clearInterval(interval)
  }, [game.id])

  const handleInteract = useCallback(() => {
    const s = useGameStore.getState()
    const currentGame = s.game ?? game
    const nearby = s.nearby
    if (!nearby || dialogue || s.showPicker || s.showReunion) return

    function openNpcDialogue(npcId: string) {
      const npc = currentGame.bible?.npcs.find(n => n.id === npcId)
      if (!npc || !currentGame.bible) return
      const sessionId = conversationSessions.current[npc.id]
        ?? (conversationSessions.current[npc.id] = crypto.randomUUID())
      setDialogue({ npcId: npc.id, sessionId })
    }

    if (nearby.kind === 'door') {
      const building = currentGame.bible?.buildings.find(b => b.id === nearby.buildingId)
      if (!building || !currentGame.bible) return

      // The endgame: Mama's door, after the mystery is solved
      if (nearby.isMama && s.solved) {
        playChime()
        s.setShowReunion(true)
        return
      }

      if (building.isEnterable) {
        const room = currentGame.assets.rooms[building.id]
        if (!room?.imageUrl || !room.annotation) {
          // A delayed/failed generated room must never block a required clue.
          // Let its neighbor step outside and deliver the same dialogue.
          if (building.npcId) {
            openNpcDialogue(building.npcId)
            return
          }
          showToast('🎨 Still painting inside! Try again in a moment…')
          return
        }
        s.setScreen(`room_${building.id}`)
        loadRoomScene(currentGame, building.id)
      } else {
        const description = building.exteriorDescription
          || `${building.name} is part of this curious little world.`
        const lookResult = `${building.name}. ${description} Mama is not here.`
        showToast(`👀 ${building.name}: ${description} Mama is not here.`, 4800)
        const lookAudio = currentGame.assets.audio[`building_${building.id}.look`]
        if (lookAudio) {
          playAudio(lookAudio).catch(() => speakText(lookResult))
        } else {
          speakText(lookResult)
        }
      }
      return
    }

    if (nearby.kind === 'npc') {
      openNpcDialogue(nearby.npcId)
      return
    }

    if (nearby.kind === 'exit') {
      returnToStreet()
    }
  }, [dialogue, game]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: E/Space/Enter to interact, Escape to leave room
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const s = useGameStore.getState()
      if (e.key === 'Escape' && dialogue) return // Conversation panel owns Escape
      if (e.key === 'Escape' && s.screen !== 'street') {
        returnToStreet()
      }
      if (e.key === 'e' || e.key === 'E' || e.key === ' ' || e.key === 'Enter') {
        if (dialogue) return // DialogueBubble handles its own advance clicks
        e.preventDefault()
        handleInteract()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleInteract, dialogue])

  function onDialogueClose() {
    setDialogue(null)
    if (pendingPickerAfterDialogue.current) {
      pendingPickerAfterDialogue.current = false
      const currentGame = useGameStore.getState().game ?? game
      const narratorUrl = currentGame.assets.audio['narrator.allHints']
      if (narratorUrl) playAudio(narratorUrl).catch(() => {})
      setTimeout(() => useGameStore.getState().setShowPicker(true), 1600)
    }
  }

  function onConversationClue(hintId: string) {
    const s = useGameStore.getState()
    const currentGame = s.game ?? game
    if (!currentGame.bible || s.collectedHintIds.includes(hintId)) return
    const newCount = s.collectedHintIds.length + 1
    s.collectHint(hintId)
    playChime()
    if (newCount >= currentGame.bible.hints.length) {
      pendingPickerAfterDialogue.current = true
    }
  }

  function returnToStreet() {
    const s = useGameStore.getState()
    stopAudio()
    setDialogue(null)
    s.setScreen('street')
    loadStreetScene(s.game ?? game)
  }

  function onSolved() {
    const s = useGameStore.getState()
    s.setShowPicker(false)
    s.setSolved(true)
    playChime()
    stopAudio()
    setDialogue(null)
    s.setScreen('street')
    loadStreetScene(s.game ?? game)
    showToast('💛 Correct! Follow the glowing MAMA marker!', 5200)
  }

  const currentGame = store.game ?? game

  // Dev-time hub regeneration keeps the same game alive. Reload the Pixi
  // scene when its cache-busted street URL changes instead of requiring the
  // player to abandon the adventure.
  useEffect(() => {
    const nextUrl = currentGame.assets.streetUrl
    if (!nextUrl || nextUrl === loadedStreetUrl.current || store.screen !== 'street') return
    loadedStreetUrl.current = nextUrl
    loadStreetScene(currentGame)
  }, [currentGame, store.screen])

  const allHintsCollected = currentGame.bible
    ? store.collectedHintIds.length >= currentGame.bible.hints.length
    : false
  const roomId = store.screen.startsWith('room_') ? store.screen.slice(5) : null
  const ambientUrl = roomId
    ? currentGame.assets.rooms[roomId]?.imageUrl
    : currentGame.assets.streetUrl
  const activeNpc = dialogue
    ? currentGame.bible?.npcs.find(npc => npc.id === dialogue.npcId)
    : undefined
  const activeHint = dialogue
    ? currentGame.bible?.hints.find(hint => hint.npcId === dialogue.npcId)
    : undefined

  function toggleMute() {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  function goHome() {
    stopAudio()
    onNewAdventure()
  }

  const isLookAction = store.nearby?.kind === 'door' && !store.nearby.enterable

  return (
    <div style={styles.wrapper}>
      {ambientUrl && <img src={ambientUrl} alt="" aria-hidden="true" style={styles.ambientBg} />}
      <div ref={containerRef} style={styles.canvas} />

      <button
        style={styles.homeBtn}
        onClick={goHome}
        aria-label="Return to the adventure library"
        title="Return to the adventure library"
      >
        ⌂ Home
      </button>

      {store.screen !== 'street' && !showIntro && !store.showPicker && !store.showReunion && (
        <button style={styles.exitBtn} onClick={returnToStreet}>← Leave house</button>
      )}

      <button
        className="audio-button"
        style={{ ...styles.audioBtn, left: store.screen === 'street' ? 16 : 150 }}
        onClick={toggleMute}
        aria-label={muted ? 'Turn sound on' : 'Mute sound'}
      >
        <span>{muted ? '🔇' : '🔊'}</span><span className="audio-label"> {muted ? 'Sound off' : 'Sound on'}</span>
      </button>

      {!showIntro && !store.showPicker && (
        <HintTracker game={currentGame} collectedHintIds={store.collectedHintIds} />
      )}

      {/* Persistent controls legend */}
      {!showIntro && !store.showPicker && !store.showReunion && (
        <div style={{ ...styles.controlsLegend, ...(isTouch ? styles.controlsLegendTouch : {}) }} aria-label="Game controls">
          <div style={styles.controlsTitle}>CONTROLS</div>
          {isTouch ? (
            <>
              <div style={styles.controlRow}><span style={styles.controlKey}>D-pad</span><span>Move</span></div>
              <div style={styles.controlRow}><span style={styles.controlKey}>Tap</span><span>Look · Go Inside · Talk</span></div>
            </>
          ) : (
            <>
              <div style={styles.controlRow}><span style={styles.controlKey}>WASD / Arrows</span><span>Move</span></div>
              <div style={styles.controlRow}><span style={styles.controlKey}>E / Space</span><span>Look · Go Inside · Talk</span></div>
              <div style={styles.controlRow}><span style={styles.controlKey}>Esc</span><span>Leave</span></div>
            </>
          )}
        </div>
      )}

      {/* Contextual action button — the single interact affordance */}
      {store.nearby && !dialogue && !store.showPicker && !store.showReunion && !showIntro && (
        <button style={{ ...styles.actionBtn, ...(isLookAction ? styles.lookActionBtn : {}) }} onClick={handleInteract}>
          {store.nearby.label}
        </button>
      )}

      {/* Touch D-pad */}
      {isTouch && !dialogue && !showIntro && <DPad />}

      {toast && <div style={styles.toast}>{toast}</div>}

      {store.solved && !store.showReunion && !store.showPicker && (
        <div style={styles.mamaMission}>💛 Follow the glowing MAMA marker and choose Find Mama!</div>
      )}

      {dialogue && activeNpc && activeHint && (
        <DialogueBubble
          gameId={currentGame.id}
          npc={activeNpc}
          sessionId={dialogue.sessionId}
          preloadedOpener={currentGame.assets.npcOpeners?.[activeNpc.id]}
          hintAlreadyCollected={store.collectedHintIds.includes(activeHint.id)}
          onClueGranted={onConversationClue}
          onClose={onDialogueClose}
        />
      )}

      {store.showPicker && (
        <LocationPicker
          game={currentGame}
          collectedHintIds={store.collectedHintIds}
          onSolved={onSolved}
        />
      )}

      {store.showReunion && (
        <ReunionScene game={currentGame} onNewAdventure={onNewAdventure} />
      )}

      {showIntro && <IntroOverlay game={currentGame} onBegin={() => setShowIntro(false)} />}

      {/* Re-open picker if dismissed */}
      {allHintsCollected && !store.solved && !store.showPicker && !store.showReunion && !dialogue && (
        <button style={styles.pickerBtn} onClick={() => store.setShowPicker(true)}>
          🔍 Where is Mama?
        </button>
      )}
    </div>
  )
}

function DPad() {
  function bind(dir: Dir) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        setVirtualKey(dir, true)
      },
      onPointerUp: () => setVirtualKey(dir, false),
      onPointerCancel: () => setVirtualKey(dir, false),
      onPointerLeave: () => setVirtualKey(dir, false),
    }
  }
  return (
    <div style={styles.dpad}>
      <div />
      <button style={styles.dpadBtn} {...bind('up')}>▲</button>
      <div />
      <button style={styles.dpadBtn} {...bind('left')}>◀</button>
      <div />
      <button style={styles.dpadBtn} {...bind('right')}>▶</button>
      <div />
      <button style={styles.dpadBtn} {...bind('down')}>▼</button>
      <div />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#2b2117' },
  ambientBg: {
    position: 'absolute', inset: -24, width: 'calc(100% + 48px)', height: 'calc(100% + 48px)',
    objectFit: 'cover', filter: 'blur(22px) saturate(0.8) brightness(0.48)', opacity: 0.9,
  },
  canvas: { position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'block', objectFit: 'contain' },
  exitBtn: {
    position: 'absolute', zIndex: 24, top: 16, left: 16,
    background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: 12,
    padding: '8px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#555',
  },
  homeBtn: {
    position: 'absolute', zIndex: 60, top: 16, right: 16,
    background: 'rgba(255,255,255,0.88)', color: '#5b3a1e', border: '2px solid rgba(255,255,255,0.72)',
    borderRadius: 12, padding: '8px 14px', fontSize: 13, fontWeight: 900, cursor: 'pointer',
    backdropFilter: 'blur(8px)', boxShadow: '0 3px 14px rgba(0,0,0,0.2)',
  },
  audioBtn: {
    position: 'absolute', zIndex: 12, top: 16, background: 'rgba(255,255,255,0.86)',
    color: '#5b3a1e', border: 0, borderRadius: 12, padding: '9px 12px', fontSize: 13,
    fontWeight: 800, cursor: 'pointer', backdropFilter: 'blur(8px)', boxShadow: '0 3px 12px rgba(0,0,0,0.15)',
  },
  controlsLegend: {
    position: 'absolute', zIndex: 12, bottom: 18, left: 18, width: 246,
    display: 'grid', gap: 7, padding: '12px 14px', borderRadius: 15,
    background: 'rgba(35,25,17,0.56)', color: 'white', border: '2px solid rgba(255,255,255,0.62)',
    boxShadow: '0 5px 20px rgba(0,0,0,0.32)', backdropFilter: 'blur(8px)',
  },
  controlsLegendTouch: { top: 70, bottom: 'auto', width: 218 },
  controlsTitle: { fontSize: 10, fontWeight: 950, letterSpacing: 1.4, color: '#ffd66b' },
  controlRow: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 9, alignItems: 'center', fontSize: 11, lineHeight: 1.2 },
  controlKey: {
    display: 'inline-flex', justifyContent: 'center', minWidth: 68, padding: '4px 7px',
    borderRadius: 7, background: 'white', color: '#382618', fontWeight: 900, boxShadow: '0 2px 0 #bda995',
  },
  actionBtn: {
    position: 'absolute', zIndex: 14, bottom: 26, right: 26,
    background: '#ffb35c', color: '#5b3a1e', border: '3px solid #fff',
    borderRadius: 999, padding: '16px 26px', fontSize: 18, fontWeight: 800,
    cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
    animation: 'pop 0.18s ease',
  },
  lookActionBtn: {
    background: '#ffe34f', color: '#2d1d00', border: '4px solid white',
    padding: '17px 28px', fontSize: 20, fontWeight: 950,
    boxShadow: '0 0 0 5px rgba(45,29,0,0.75), 0 0 34px 13px rgba(255,227,79,0.82), 0 8px 24px rgba(0,0,0,0.42)',
    animation: 'look-pulse 1.05s ease-in-out infinite',
  },
  toast: {
    position: 'absolute', zIndex: 18, bottom: 96, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(255,255,255,0.95)', color: '#5b3a1e', padding: '12px 22px',
    borderRadius: 18, fontSize: 16, fontWeight: 700, maxWidth: '80%',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)', pointerEvents: 'none', textAlign: 'center',
  },
  mamaMission: {
    position: 'absolute', zIndex: 28, top: 18, left: '50%', transform: 'translateX(-50%)',
    padding: '11px 18px', borderRadius: 99, background: 'rgba(255,244,177,0.94)',
    border: '3px solid #f2b92f', color: '#614109', fontSize: 14, fontWeight: 950,
    boxShadow: '0 6px 22px rgba(96,62,0,0.3)', whiteSpace: 'nowrap',
  },
  pickerBtn: {
    position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: '#e07b54', color: 'white', border: 'none', borderRadius: 16,
    padding: '14px 28px', fontSize: 16, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
  },
  dpad: {
    position: 'absolute', bottom: 22, left: 22,
    display: 'grid', gridTemplateColumns: '56px 56px 56px', gridTemplateRows: '56px 56px 56px',
    gap: 4, touchAction: 'none',
  },
  dpadBtn: {
    background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: 14,
    fontSize: 20, color: '#5b3a1e', touchAction: 'none', userSelect: 'none',
  },
}
