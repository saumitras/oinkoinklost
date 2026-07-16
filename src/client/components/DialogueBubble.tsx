import { useEffect, useRef, useState } from 'react'
import type { NPC, NPCChatResponse, SuggestedNPCReply } from '@shared/schema'
import { playAudio, stopAudio } from '../game/audio'

interface Props {
  gameId: string
  npc: NPC
  sessionId: string
  hintAlreadyCollected: boolean
  onClueGranted: (hintId: string) => void
  onClose: () => void
}

interface ChatLine {
  speaker: 'Piglet' | string
  text: string
}

const moodEmoji: Record<NPCChatResponse['mood'], string> = {
  cheerful: '😊',
  curious: '🤔',
  helpful: '💛',
  thoughtful: '💭',
  excited: '✨',
}

export function DialogueBubble({
  gameId,
  npc,
  sessionId,
  hintAlreadyCollected,
  onClueGranted,
  onClose,
}: Props) {
  const [history, setHistory] = useState<ChatLine[]>([])
  const [suggestions, setSuggestions] = useState<SuggestedNPCReply[]>([])
  const [mood, setMood] = useState<NPCChatResponse['mood']>('cheerful')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const started = useRef(false)
  const knowsHint = useRef(hintAlreadyCollected)
  const transcriptRef = useRef<HTMLDivElement>(null)

  async function requestTurn(
    message: string,
    source: 'start' | 'suggestion' | 'typed',
    intent?: SuggestedNPCReply['intent'],
  ) {
    setLoading(true)
    setError('')
    setSuggestions([])
    if (message) setHistory(lines => [...lines, { speaker: 'Piglet', text: message }])

    try {
      const res = await fetch(`/api/game/${gameId}/npcs/${npc.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message,
          source,
          intent,
          hintAlreadyCollected: knowsHint.current,
        }),
      })
      if (!res.ok) throw new Error(`Conversation failed (${res.status})`)
      const turn: NPCChatResponse = await res.json()
      setHistory(lines => [...lines, { speaker: npc.name, text: turn.reply }])
      setSuggestions(turn.suggestedReplies)
      setMood(turn.mood)
      setAudioUrl(turn.audioUrl ?? null)
      if (turn.audioUrl) playAudio(turn.audioUrl).catch(() => {})
      if (turn.clueGranted && turn.hintId && !knowsHint.current) {
        knowsHint.current = true
        onClueGranted(turn.hintId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The conversation paused unexpectedly.')
      setSuggestions([
        { text: 'Try again', intent: 'small_talk' },
        { text: 'Leave for now', intent: 'goodbye' },
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    requestTurn('', 'start')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [history, loading])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function choose(suggestion: SuggestedNPCReply) {
    if (suggestion.intent === 'goodbye') {
      stopAudio()
      onClose()
      return
    }
    requestTurn(suggestion.text, 'suggestion', suggestion.intent)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const message = input.trim()
    if (!message || loading) return
    setInput('')
    requestTurn(message, 'typed')
  }

  function leave() {
    stopAudio()
    onClose()
  }

  return (
    <div style={styles.overlay} role="dialog" aria-label={`Talking to ${npc.name}`}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <div style={styles.identity}>
            <div style={styles.portrait} aria-hidden="true">{moodEmoji[mood]}</div>
            <div>
              <div style={styles.name}>{npc.name}</div>
              <div style={styles.personality}>{npc.personality} {npc.species}</div>
            </div>
          </div>
          <div style={styles.headerActions}>
            <button
              style={styles.iconBtn}
              onClick={() => audioUrl && playAudio(audioUrl).catch(() => {})}
              disabled={!audioUrl}
              aria-label="Replay NPC voice"
            >🔊</button>
            <button style={styles.leaveBtn} onClick={leave}>Esc · leave</button>
          </div>
        </div>

        <div ref={transcriptRef} style={styles.transcript} aria-live="polite">
          {history.map((line, index) => (
            <div key={`${line.speaker}-${index}`} style={{
              ...styles.line,
              ...(line.speaker === 'Piglet' ? styles.playerLine : styles.npcLine),
            }}>
              <span style={styles.speaker}>{line.speaker}</span>
              <span>{line.text}</span>
            </div>
          ))}
          {loading && (
            <div style={{ ...styles.line, ...styles.npcLine }}>
              <span style={styles.thinkingDot}>●</span>
              <span>{npc.name} is thinking…</span>
            </div>
          )}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.suggestions}>
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.text}-${index}`}
              style={{
                ...styles.suggestionBtn,
                ...(suggestion.intent === 'ask_mama' ? styles.keySuggestionBtn : {}),
              }}
              onClick={() => choose(suggestion)}
              disabled={loading}
            >
              <span style={styles.choiceNumber}>{index + 1}.</span> {suggestion.text}
            </button>
          ))}
        </div>

        <form style={styles.inputRow} onSubmit={submit}>
          <input
            style={styles.input}
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder={`Say anything to ${npc.name}…`}
            maxLength={180}
            disabled={loading}
            aria-label={`Say something to ${npc.name}`}
          />
          <button style={styles.sendBtn} type="submit" disabled={loading || !input.trim()} aria-label="Send message">
            ➤
          </button>
        </form>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute', inset: 0, zIndex: 22, display: 'flex', alignItems: 'flex-end',
    justifyContent: 'center', padding: '20px clamp(14px, 3vw, 30px) 28px', pointerEvents: 'none',
    background: 'linear-gradient(to top, rgba(35,24,18,0.62), transparent 58%)',
  },
  panel: {
    pointerEvents: 'auto', background: 'rgba(255,253,249,0.98)', borderRadius: 22,
    padding: '18px 20px 20px', maxWidth: 760, width: 'min(760px, 96vw)',
    boxShadow: '0 12px 40px rgba(32,20,12,0.34)', border: '2px solid rgba(240,208,192,0.9)',
    maxHeight: '72vh', display: 'flex', flexDirection: 'column', gap: 12,
    backdropFilter: 'blur(12px)',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  identity: { display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 },
  portrait: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46,
    flex: '0 0 46px', borderRadius: 99, background: '#fff0dd', fontSize: 24,
    animation: 'bounce 2.4s ease-in-out infinite',
  },
  name: { fontWeight: 950, color: '#513727', fontSize: 19 },
  personality: { color: '#9a7c6a', fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
  iconBtn: {
    border: 0, borderRadius: 99, width: 38, height: 38, background: '#fff0e6', cursor: 'pointer', fontSize: 16,
  },
  leaveBtn: {
    border: 0, borderRadius: 99, padding: '10px 14px', background: '#f0ece7', color: '#745f52',
    fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  transcript: {
    minHeight: 72, maxHeight: 210, overflowY: 'auto', display: 'flex', flexDirection: 'column',
    gap: 7, padding: '2px 3px', scrollBehavior: 'smooth',
  },
  line: { display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 13px', lineHeight: 1.42, fontSize: 16 },
  npcLine: { alignSelf: 'flex-start', maxWidth: '88%', background: '#fff7ef', color: '#3f342c', borderRadius: '6px 16px 16px 16px' },
  playerLine: { alignSelf: 'flex-end', maxWidth: '82%', background: '#e07b54', color: 'white', borderRadius: '16px 6px 16px 16px' },
  speaker: { fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.7, opacity: 0.65 },
  thinkingDot: { color: '#e07b54', animation: 'bounce 0.8s ease-in-out infinite' },
  error: { color: '#b44d48', background: '#fff0ef', padding: '8px 10px', borderRadius: 10, fontSize: 13 },
  suggestions: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 },
  suggestionBtn: {
    border: '2px solid #efddd1', borderRadius: 12, background: 'white', color: '#5b4638',
    padding: '11px 12px', fontSize: 13, fontWeight: 750, cursor: 'pointer', textAlign: 'left', lineHeight: 1.25,
  },
  keySuggestionBtn: {
    background: '#fff2bd', borderColor: '#e6ad3c', color: '#68440d',
    boxShadow: '0 3px 10px rgba(196,132,25,0.18)', fontWeight: 900,
  },
  choiceNumber: { color: '#d27754', fontWeight: 950, marginRight: 4 },
  inputRow: { display: 'flex', alignItems: 'center', gap: 8 },
  input: {
    flex: 1, minWidth: 0, border: '2px solid #efddd1', borderRadius: 99, background: '#faf5ee',
    padding: '13px 17px', color: '#493b32', fontSize: 14, outline: 'none',
  },
  sendBtn: {
    border: 0, borderRadius: 99, width: 44, height: 44, flex: '0 0 44px', background: '#e07b54',
    color: 'white', fontSize: 18, fontWeight: 900, cursor: 'pointer',
  },
}
