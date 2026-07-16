import { useEffect, useState } from 'react'
import type { Game } from '@shared/schema'
import { playAudio } from '../game/audio'

interface Props {
  game: Game
  onNewAdventure: () => void
  accomplishments?: string[]
}

export function ReunionScene({ game, onNewAdventure, accomplishments = [] }: Props) {
  const [photoUrl, setPhotoUrl] = useState(game.assets.reunionPhotoUrl)

  // Poll for reunion photo if not ready yet
  useEffect(() => {
    if (photoUrl) return
    const interval = setInterval(async () => {
      const res = await fetch(`/api/game/${game.id}`)
      const updated: Game = await res.json()
      if (updated.assets.reunionPhotoUrl) {
        setPhotoUrl(updated.assets.reunionPhotoUrl)
        clearInterval(interval)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [game.id, photoUrl])

  // Play reunion audio
  useEffect(() => {
    const url = game.assets.audio['narrator.reunion']
    if (url) playAudio(url).catch(() => {})
  }, [game.assets.audio])

  async function shareAdventure() {
    const shareData = {
      title: game.bible?.title ?? 'Oink Oink Lost',
      text: `I helped Piglet find Mama in ${game.bible?.setting.name ?? 'a magical world'}!`,
      url: window.location.href,
    }
    if (navigator.share) {
      await navigator.share(shareData).catch(() => {})
    } else {
      await navigator.clipboard?.writeText(`${shareData.text} ${shareData.url}`).catch(() => {})
    }
  }

  return (
    <div className="reunion-overlay" style={styles.overlay}>
      <div style={styles.confetti} aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <span key={i} style={{
            ...styles.confettiPiece,
            left: `${(i * 37) % 100}%`,
            background: ['#ffb35c', '#ef7181', '#6ec5a8', '#79a7e8'][i % 4],
            animationDelay: `${(i % 9) * -0.31}s`,
            animationDuration: `${2.8 + (i % 5) * 0.35}s`,
          }} />
        ))}
      </div>
      <div className="reunion-card" style={styles.card}>
        <div style={styles.badge}>MYSTERY SOLVED · 3 CLUES FOUND</div>
        <div style={styles.emoji}>🐷💛🐷</div>
        <h2 style={styles.title}>You found Mama!</h2>
        {photoUrl ? (
          <div style={styles.photoFrame}>
            <img className="reunion-photo" src={photoUrl} alt="Reunion" style={styles.photo} />
            <div style={styles.photoGlow} aria-hidden="true">✨</div>
          </div>
        ) : (
          <div style={styles.photoPlaceholder}>📸 Developing your photo…</div>
        )}
        {game.bible && (
          <p style={styles.reunionLine}>{game.bible.reunionLine}</p>
        )}
        {accomplishments.length > 0 && (
          <div style={styles.memories}>
            <strong>Piglet's adventure memories</strong>
            <div style={styles.memoryBadges}>
              {accomplishments.map((memory, index) => (
                <span key={memory} style={styles.memoryBadge}>{['🌾', '🥧', '🍎'][index % 3]} {memory}</span>
              ))}
            </div>
          </div>
        )}
        <div style={styles.actions}>
          <button style={styles.shareBtn} onClick={shareAdventure}>📮 Share postcard</button>
          <button style={styles.btn} onClick={onNewAdventure}>🌟 New Adventure!</button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center', zIndex: 25, padding: 16,
  },
  confetti: { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' },
  confettiPiece: {
    position: 'absolute', top: -18, width: 10, height: 18, borderRadius: 3,
    animation: 'confetti-fall 3.5s linear infinite',
  },
  card: {
    position: 'relative', zIndex: 1,
    background: 'white',
    borderRadius: 24,
    padding: 'clamp(24px, 5vw, 36px) clamp(20px, 6vw, 40px)',
    maxWidth: 560,
    width: '90%',
    maxHeight: '94vh', overflowY: 'auto',
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
  },
  badge: { fontSize: 11, letterSpacing: 1.2, fontWeight: 900, color: '#bb7658', marginBottom: 10 },
  emoji: { fontSize: 56, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: 800, color: '#e07b54', margin: '0 0 20px' },
  photoFrame: { position: 'relative', overflow: 'hidden', borderRadius: 16, marginBottom: 20, background: '#f5e6d3' },
  photo: { display: 'block', width: '100%', borderRadius: 16, animation: 'reunion-zoom 7s ease-out both' },
  photoGlow: { position: 'absolute', right: 14, top: 10, fontSize: 34, animation: 'bounce 1.8s ease-in-out infinite' },
  photoPlaceholder: {
    width: '100%',
    height: 200,
    background: '#f5e6d3',
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    color: '#aaa',
    marginBottom: 20,
  },
  reunionLine: { fontSize: 18, color: '#555', lineHeight: 1.6, margin: '0 0 24px' },
  memories: {
    display: 'grid', gap: 9, margin: '-7px 0 22px', padding: 12, borderRadius: 15,
    background: '#fff6df', color: '#67472e', fontSize: 13,
  },
  memoryBadges: { display: 'flex', justifyContent: 'center', gap: 7, flexWrap: 'wrap' },
  memoryBadge: { padding: '7px 10px', borderRadius: 99, background: 'white', fontWeight: 800, boxShadow: '0 2px 6px rgba(80,50,20,0.1)' },
  btn: {
    padding: '14px 32px',
    fontSize: 18,
    fontWeight: 700,
    background: '#e07b54',
    color: 'white',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
  },
  actions: { display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  shareBtn: {
    padding: '14px 24px', fontSize: 16, fontWeight: 800, background: '#f5e6d3',
    color: '#9b573d', border: 'none', borderRadius: 12, cursor: 'pointer',
  },
}
