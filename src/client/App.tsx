import { useState } from 'react'
import type { Game } from '@shared/schema'
import { TitleScreen } from './components/TitleScreen'
import { LoadingScreen } from './components/LoadingScreen'
import { GameCanvas } from './components/GameCanvas'

type AppScreen = 'title' | 'loading' | 'game'

export function App() {
  const [screen, setScreen] = useState<AppScreen>('title')
  const [gameId, setGameId] = useState<string | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [microQuestsEnabled, setMicroQuestsEnabled] = useState(false)

  function onStart(id: string, options: { microQuestsEnabled: boolean }) {
    setGameId(id)
    setMicroQuestsEnabled(options.microQuestsEnabled)
    setScreen('loading')
  }

  function onPlayable(g: Game) {
    setGame(g)
    setScreen('game')
  }

  function onNewAdventure() {
    setGame(null)
    setGameId(null)
    setScreen('title')
  }

  if (screen === 'title') return <TitleScreen onStart={onStart} />
  if (screen === 'loading' && gameId) return <LoadingScreen gameId={gameId} onPlayable={onPlayable} />
  if (screen === 'game' && game) return (
    <GameCanvas
      game={game}
      microQuestsEnabled={microQuestsEnabled}
      onNewAdventure={onNewAdventure}
    />
  )
  return null
}
