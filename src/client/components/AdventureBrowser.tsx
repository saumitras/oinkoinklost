import { useEffect, useRef, useState } from 'react'
import type { AdventurePage, AdventureSummary } from '@shared/schema'
import { unlockAudio } from '../game/audio'
import { getAdventureHistory, rememberAdventure } from '../game/adventureHistory'
import { useGameStore } from '../game/store'
import { useI18n } from '../i18n/context'

interface Props {
  microQuestsEnabled: boolean
  onBack: () => void
  onStart: (gameId: string, options: { microQuestsEnabled: boolean }) => void
}

const PAGE_SIZE = 20

export function AdventureBrowser({ microQuestsEnabled, onBack, onStart }: Props) {
  const { languageCode, t } = useI18n()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [past, setPast] = useState<AdventureSummary[]>([])
  const [adventures, setAdventures] = useState<AdventureSummary[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const sentinelRef = useRef<HTMLDivElement>(null)
  const requestVersion = useRef(0)
  const unlockAudioStore = useGameStore(state => state.unlockAudio)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const ids = getAdventureHistory()
    if (!ids.length) return
    fetch('/api/adventures/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, languageCode }),
    })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => setPast(data.items ?? []))
      .catch(() => {})
  }, [languageCode])

  useEffect(() => {
    const version = ++requestVersion.current
    setAdventures([])
    setOffset(0)
    setHasMore(true)
    setError('')
    setLoading(true)
    fetch(`/api/adventures?query=${encodeURIComponent(debouncedQuery)}&offset=0&limit=${PAGE_SIZE}&languageCode=${encodeURIComponent(languageCode)}`)
      .then(response => response.ok ? response.json() : Promise.reject())
      .then((page: AdventurePage) => {
        if (requestVersion.current !== version) return
        setAdventures(page.items)
        setOffset(page.items.length)
        setHasMore(page.hasMore)
      })
      .catch(() => requestVersion.current === version && setError(t('library.waking')))
      .finally(() => requestVersion.current === version && setLoading(false))
  }, [debouncedQuery, languageCode])

  async function loadMore() {
    if (loading || !hasMore) return
    const version = requestVersion.current
    setLoading(true)
    try {
      const response = await fetch(`/api/adventures?query=${encodeURIComponent(debouncedQuery)}&offset=${offset}&limit=${PAGE_SIZE}&languageCode=${encodeURIComponent(languageCode)}`)
      if (!response.ok) throw new Error('Library request failed')
      const page: AdventurePage = await response.json()
      if (requestVersion.current !== version) return
      setAdventures(current => {
        const seen = new Set(current.map(item => item.id))
        return [...current, ...page.items.filter(item => !seen.has(item.id))]
      })
      setOffset(current => current + page.items.length)
      setHasMore(page.hasMore)
    } catch {
      setError(t('library.loadMoreError'))
    } finally {
      if (requestVersion.current === version) setLoading(false)
    }
  }

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadMore()
    }, { rootMargin: '500px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loading, hasMore, offset, debouncedQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  async function play(adventure: AdventureSummary) {
    setOpeningId(adventure.id)
    setError('')
    unlockAudio()
    unlockAudioStore()
    try {
      const response = await fetch(`/api/adventures/${encodeURIComponent(adventure.id)}/play?languageCode=${encodeURIComponent(languageCode)}`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error('Adventure unavailable')
      rememberAdventure(data.sourceAdventureId ?? adventure.id)
      onStart(data.gameId, { microQuestsEnabled })
    } catch {
      setError(t('library.unavailable', { title: adventure.title }))
    } finally {
      setOpeningId(null)
    }
  }

  const pastIds = new Set(past.map(adventure => adventure.id))
  const visibleAdventures = debouncedQuery
    ? adventures
    : adventures.filter(adventure => !pastIds.has(adventure.id))

  return (
    <main className="adventure-browser" style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <button style={styles.backButton} onClick={onBack} aria-label={t('common.back')}>←</button>
          <div>
            <h1 style={styles.title}>{t('library.title')}</h1>
            <p style={styles.subtitle}>{t('library.subtitle')}</p>
          </div>
        </header>

        <label style={styles.searchWrap}>
          <span aria-hidden="true">🔎</span>
          <input
            autoFocus
            style={styles.search}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('library.searchPlaceholder')}
            aria-label={t('library.search')}
          />
          {query && <button style={styles.clearButton} onClick={() => setQuery('')} aria-label="Clear search">×</button>}
        </label>

        {past.length > 0 && !debouncedQuery && (
          <section style={styles.section} aria-labelledby="past-adventures-title">
            <div style={styles.sectionHeading}>
              <div>
                <h2 id="past-adventures-title" style={styles.sectionTitle}>{t('library.past')}</h2>
                <p style={styles.sectionHelp}>{t('library.pastHelp')}</p>
              </div>
            </div>
            <div className="adventure-past-row" style={styles.pastRow}>
              {past.map(adventure => (
                <AdventureCard key={adventure.id} adventure={adventure} opening={openingId === adventure.id} onPlay={play} compact t={t} />
              ))}
            </div>
          </section>
        )}

        <section style={styles.section} aria-labelledby="global-adventures-title">
          <div style={styles.sectionHeading}>
            <div>
              <h2 id="global-adventures-title" style={styles.sectionTitle}>
                {debouncedQuery ? t('library.results', { query: debouncedQuery }) : t('library.everyone')}
              </h2>
              <p style={styles.sectionHelp}>{t('library.everyoneHelp')}</p>
            </div>
          </div>
          <div className="adventure-global-grid" style={styles.grid}>
            {visibleAdventures.map(adventure => (
              <AdventureCard key={adventure.id} adventure={adventure} opening={openingId === adventure.id} onPlay={play} t={t} />
            ))}
          </div>
          {!loading && visibleAdventures.length === 0 && (
            <div style={styles.empty}>{t('library.empty')}</div>
          )}
          <div ref={sentinelRef} style={styles.sentinel} aria-hidden="true" />
          {loading && <div style={styles.loading}>🐷 {t('library.loading')}</div>}
          {!hasMore && visibleAdventures.length > 0 && <div style={styles.end}>{t('library.end')} ✨</div>}
          {error && <div style={styles.error}>{error}</div>}
        </section>
      </div>
    </main>
  )
}

function AdventureCard({ adventure, opening, onPlay, compact = false, t }: {
  adventure: AdventureSummary
  opening: boolean
  onPlay: (adventure: AdventureSummary) => void
  compact?: boolean
  t: ReturnType<typeof useI18n>['t']
}) {
  return (
    <button
      className={`adventure-card${compact ? ' adventure-card-compact' : ''}`}
      style={{ ...styles.card, ...(compact ? styles.compactCard : {}) }}
      onClick={() => onPlay(adventure)}
      disabled={opening}
      aria-label={`Play ${adventure.title}`}
    >
      <img src={adventure.previewUrl} alt="" style={styles.cardImage} loading="lazy" />
      <span style={styles.cardShade} />
      <span style={styles.cardCopy}>
        <span style={styles.cardEyebrow}>{adventure.emoji} {adventure.settingName}</span>
        <strong style={styles.cardTitle}>{opening ? t('library.opening') : adventure.title}</strong>
        <span style={styles.cardDescription}>{adventure.description}</span>
        <span style={styles.playPill}>{t('library.play')} <span aria-hidden="true">→</span></span>
      </span>
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100dvh', background: 'linear-gradient(150deg, #ffecd2, #f6b89f 52%, #e89175)', padding: '24px clamp(12px, 3vw, 36px) 70px', color: '#4b3428' },
  shell: { width: 'min(1240px, 100%)', margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 },
  backButton: { width: 48, height: 48, flex: '0 0 auto', border: 0, borderRadius: 16, background: 'rgba(255,255,255,0.9)', color: '#7f4935', fontSize: 23, fontWeight: 900, cursor: 'pointer', boxShadow: '0 5px 16px rgba(91,52,32,0.15)' },
  title: { fontSize: 'clamp(28px, 5vw, 44px)', color: '#9f4f36', lineHeight: 1.05 },
  subtitle: { marginTop: 5, color: '#7f665a', fontSize: 14 },
  searchWrap: { display: 'flex', alignItems: 'center', gap: 10, width: 'min(720px, 100%)', margin: '0 auto 28px', padding: '5px 7px 5px 16px', background: 'rgba(255,255,255,0.94)', border: '2px solid rgba(255,255,255,0.86)', borderRadius: 18, boxShadow: '0 8px 25px rgba(91,52,32,0.15)' },
  search: { flex: 1, minWidth: 0, border: 0, outline: 0, padding: '12px 4px', background: 'transparent', color: '#4b3428', fontSize: 16 },
  clearButton: { width: 38, height: 38, border: 0, borderRadius: 12, background: '#f3e6df', color: '#8a6858', cursor: 'pointer', fontSize: 20 },
  section: { marginTop: 26 },
  sectionHeading: { display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 13 },
  sectionTitle: { fontSize: 22, color: '#5d3b2d' },
  sectionHelp: { marginTop: 3, color: '#876d61', fontSize: 12 },
  pastRow: { display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(250px, 330px)', gap: 13, overflowX: 'auto', padding: '2px 3px 13px', scrollSnapType: 'x proximity' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 },
  card: { position: 'relative', height: 320, overflow: 'hidden', padding: 0, border: '3px solid rgba(255,255,255,0.88)', borderRadius: 22, background: '#cfa98e', cursor: 'pointer', textAlign: 'left', boxShadow: '0 9px 26px rgba(64,37,24,0.22)', scrollSnapAlign: 'start', transition: 'transform 170ms ease, box-shadow 170ms ease' },
  compactCard: { height: 235 },
  cardImage: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 450ms ease' },
  cardShade: { position: 'absolute', inset: 0, background: 'linear-gradient(transparent 18%, rgba(30,18,13,0.18) 42%, rgba(30,18,13,0.94) 100%)' },
  cardCopy: { position: 'absolute', inset: 'auto 16px 15px', display: 'grid', gap: 5, color: 'white' },
  cardEyebrow: { fontSize: 10, fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase', opacity: 0.88 },
  cardTitle: { fontSize: 18, lineHeight: 1.12 },
  cardDescription: { fontSize: 11, lineHeight: 1.3, opacity: 0.82, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  playPill: { width: 'fit-content', marginTop: 4, padding: '6px 9px', borderRadius: 99, background: 'rgba(255,255,255,0.94)', color: '#8d4b35', fontSize: 10, fontWeight: 950 },
  sentinel: { height: 1 },
  loading: { padding: 24, textAlign: 'center', color: '#77594b', fontWeight: 850 },
  end: { padding: 24, textAlign: 'center', color: '#86695b', fontSize: 12 },
  empty: { padding: 46, borderRadius: 18, background: 'rgba(255,255,255,0.55)', textAlign: 'center', color: '#765b4f' },
  error: { marginTop: 12, color: '#a83f36', textAlign: 'center', fontSize: 13, fontWeight: 800 },
}
