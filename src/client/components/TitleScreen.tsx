import { useEffect, useState } from 'react'
import { unlockAudio } from '../game/audio'
import { useGameStore } from '../game/store'

interface Props {
  onStart: (gameId: string) => void
}

interface PresetWorld {
  slug: string
  title: string
  subtitle: string
  emoji: string
  previewUrl: string
}

export function TitleScreen({ onStart }: Props) {
  const [idea, setIdea] = useState('')
  const [presets, setPresets] = useState<PresetWorld[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null)
  const [error, setError] = useState('')
  const unlockAudioFn = useGameStore(s => s.unlockAudio)

  useEffect(() => {
    fetch('/api/presets')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(setPresets)
      .catch(() => setError('Preset worlds are still waking up. You can create a custom one below.'))
  }, [])

  function prepareAudio() {
    unlockAudio()
    unlockAudioFn()
  }

  async function startCustom() {
    if (!idea.trim()) {
      setError('Choose a world above or describe your own adventure!')
      return
    }
    setLoading(true)
    setError('')
    prepareAudio()
    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea }),
      })
      const data = await res.json()
      if (!res.ok) {
        const detail = data.detail ?? data
        if (detail.error === 'idea_flagged') {
          setError("Let's pick a different adventure! Try: " + detail.suggestions.join(', '))
        } else {
          setError('Something went wrong. Try again!')
        }
        return
      }
      onStart(data.gameId)
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  async function startPreset(preset: PresetWorld) {
    setLoadingPreset(preset.slug)
    setError('')
    prepareAudio()
    try {
      const res = await fetch(`/api/presets/${preset.slug}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error('Preset unavailable')
      onStart(data.gameId)
    } catch {
      setError(`${preset.title} is unavailable right now. Try another world!`)
    } finally {
      setLoadingPreset(null)
    }
  }

  function surpriseMe() {
    if (!presets.length) return
    startPreset(presets[Math.floor(Math.random() * presets.length)])
  }

  const busy = loading || loadingPreset !== null

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.brandRow}>
          <div style={styles.emoji}>🐷</div>
          <div>
            <h1 style={styles.title}>Oink Oink Lost</h1>
            <p style={styles.subtitle}>Choose a ready-made world or create a one-of-a-kind mystery.</p>
          </div>
        </div>

        <div style={styles.label}>Where should the adventure happen?</div>
        <div style={styles.presetGrid}>
          {presets.map(preset => (
            <button
              key={preset.slug}
              style={styles.presetCard}
              onClick={() => startPreset(preset)}
              disabled={busy}
              aria-label={`Start ${preset.title} adventure`}
            >
              <img src={preset.previewUrl} alt="" style={styles.presetImage} />
              <span style={styles.presetShade} />
              <span style={styles.presetContent}>
                <span style={styles.presetTitle}>
                  {preset.emoji} {loadingPreset === preset.slug ? 'Opening…' : preset.title}
                </span>
                <span style={styles.presetSubtitle}>{preset.subtitle}</span>
                <span style={styles.readyBadge}>⚡ Ready instantly</span>
              </span>
            </button>
          ))}
        </div>

        <div style={styles.divider}><span style={styles.dividerLine} /><span>or invent your own</span><span style={styles.dividerLine} /></div>

        <div style={styles.customRow}>
          <input
            id="adventure-idea"
            style={styles.input}
            placeholder="A cloud castle, a moonlit bakery…"
            value={idea}
            onChange={event => setIdea(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && startCustom()}
            maxLength={120}
            disabled={busy}
            aria-label="Describe a custom adventure world"
          />
          <button style={styles.btnPrimary} onClick={startCustom} disabled={busy || !idea.trim()}>
            {loading ? '🎨 Creating…' : '🌟 Create'}
          </button>
        </div>

        <button style={styles.surpriseBtn} onClick={surpriseMe} disabled={busy || !presets.length}>
          🎲 Surprise me with a ready world
        </button>

        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    fontFamily: '"Segoe UI", sans-serif', padding: 24,
  },
  card: {
    background: 'rgba(255,255,255,0.96)', borderRadius: 28, padding: '32px clamp(22px, 4vw, 38px)',
    maxWidth: 920, width: '100%', boxShadow: '0 12px 40px rgba(92,55,36,0.16)',
  },
  brandRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 24 },
  emoji: { fontSize: 62, lineHeight: 1 },
  title: { fontSize: 34, fontWeight: 900, color: '#e07b54', margin: 0 },
  subtitle: { fontSize: 15, lineHeight: 1.4, color: '#7c6a60', margin: '4px 0 0' },
  label: { color: '#5e4335', fontSize: 16, fontWeight: 900, marginBottom: 12, textAlign: 'center' },
  presetGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 13 },
  presetCard: {
    position: 'relative', height: 210, padding: 0, border: '3px solid white', borderRadius: 18,
    overflow: 'hidden', cursor: 'pointer', textAlign: 'left', boxShadow: '0 5px 18px rgba(70,43,28,0.18)',
    background: '#d8b99f',
  },
  presetImage: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  presetShade: { position: 'absolute', inset: 0, background: 'linear-gradient(transparent 30%, rgba(42,27,18,0.9))' },
  presetContent: {
    position: 'absolute', inset: 'auto 14px 13px', display: 'flex', flexDirection: 'column', gap: 4, color: 'white',
  },
  presetTitle: { fontSize: 19, fontWeight: 950 },
  presetSubtitle: { fontSize: 12, opacity: 0.9, lineHeight: 1.25 },
  readyBadge: { alignSelf: 'flex-start', marginTop: 4, padding: '4px 8px', borderRadius: 99, background: '#fff3d6', color: '#7b5523', fontSize: 10, fontWeight: 900 },
  divider: { display: 'flex', alignItems: 'center', gap: 12, color: '#a58c7e', fontSize: 12, fontWeight: 800, margin: '20px 0 13px' },
  dividerLine: { height: 1, background: '#ead8cc', flex: 1 },
  customRow: { display: 'flex', gap: 10 },
  input: {
    flex: 1, minWidth: 0, padding: '13px 15px', fontSize: 15, borderRadius: 12,
    border: '2px solid #f0d0c0', outline: 'none', background: 'white',
  },
  btnPrimary: {
    padding: '13px 22px', fontSize: 15, fontWeight: 850, background: '#e07b54', color: 'white',
    border: 0, borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  surpriseBtn: {
    display: 'block', margin: '13px auto 0', padding: '8px 13px', fontSize: 12, fontWeight: 800,
    background: 'transparent', color: '#b36c4d', border: 0, cursor: 'pointer',
  },
  error: { color: '#c65f4d', margin: '12px 0 0', fontSize: 13, textAlign: 'center' },
}
