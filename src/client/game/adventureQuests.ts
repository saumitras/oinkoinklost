import type { Game } from '@shared/schema'

export interface QuestObject {
  id: string
  label: string
  emoji: string
  x: number
  y: number
  correct: boolean
  response: string
}

export interface AdventureQuest {
  id: string
  npcId: string
  roomId: string
  title: string
  request: string
  searchPrompt: string
  success: string
  objects: QuestObject[]
}

export type CuratedAdventure = 'pumpkin' | 'moon' | 'cloud' | 'dracula'

const PUMPKIN_QUESTS: AdventureQuest[] = [
  {
    id: 'cow_blue_rope',
    npcId: 'cow',
    roomId: 'barn',
    title: 'The blue barn rope',
    request: 'Moo! I did see Mama, but first could you help me? Find the blue rope hanging on the right wall of my barn.',
    searchPrompt: 'Look around the barn for the blue rope hanging on the right wall.',
    success: 'Moo-velous! That is my blue rope. Come talk to me and I will tell you what I noticed about Mama.',
    objects: [
      { id: 'hay_bales', label: 'Hay bales', emoji: '🌾', x: 205, y: 520, correct: false, response: 'That is a cozy pile of hay. The rope is blue and hangs on a wall.' },
      { id: 'blue_rope', label: 'Blue barn rope', emoji: '🪢', x: 875, y: 600, correct: true, response: 'You found the blue rope hanging on the wall!' },
      { id: 'milk_jug', label: 'Silver milk jug', emoji: '🥛', x: 820, y: 325, correct: false, response: 'That shiny jug holds milk. Look lower for something long and blue.' },
    ],
  },
  {
    id: 'owl_apple_wreath',
    npcId: 'owl',
    roomId: 'orchard',
    title: 'The apple wreath',
    request: 'Hoo… I can help with Mama, but first find the round wreath decorated with apples on my wall.',
    searchPrompt: 'Find the round apple wreath hanging on the orchard shed wall.',
    success: 'Hoo-ray! That is my apple wreath. Come talk to me for the clue I promised.',
    objects: [
      { id: 'apple_wreath', label: 'Apple wreath', emoji: '🍎', x: 735, y: 285, correct: true, response: 'That round wreath is decorated with bright red apples!' },
      { id: 'apple_crates', label: 'Apple crates', emoji: '🧺', x: 255, y: 465, correct: false, response: 'Those apples are packed in crates. The wreath is round and hangs up high.' },
      { id: 'cider_barrel', label: 'Cider barrel', emoji: '🧃', x: 720, y: 470, correct: false, response: 'That barrel makes warm cider. Look above it on the wall.' },
    ],
  },
  {
    id: 'duck_chalkboard',
    npcId: 'duck',
    roomId: 'pumpkin_stall',
    title: 'The little chalkboard',
    request: 'Quack! I can help with Mama, but first find the little black chalkboard hiding behind the pumpkins.',
    searchPrompt: 'Find the small black chalkboard near the pumpkin counter.',
    success: 'Quack-tastic! You found my little chalkboard. Come back and I will share my Mama clue.',
    objects: [
      { id: 'big_pumpkin', label: 'Big pumpkin', emoji: '🎃', x: 175, y: 470, correct: false, response: 'That is a wonderfully big pumpkin. Look just behind the counter.' },
      { id: 'chalkboard', label: 'Little chalkboard', emoji: '✨', x: 350, y: 450, correct: true, response: 'You found the little black chalkboard!' },
      { id: 'flower_wreath', label: 'Flower wreath', emoji: '🌼', x: 730, y: 335, correct: false, response: 'That is a pretty autumn wreath. The chalkboard is black and rectangular.' },
    ],
  },
]

const MOON_QUESTS: AdventureQuest[] = [
  {
    id: 'owl_glowing_globe',
    npcId: 'astro_owl',
    roomId: 'observation_deck',
    title: 'The glowing globe',
    request: 'Hoo-hoo! Before I share what I saw, help me find the little glowing globe tucked into the upper-left shelf.',
    searchPrompt: 'Find Ollie’s little glowing globe on the upper-left shelf.',
    success: 'Hoo-ray! You found my glowing globe. Come talk to me and I will share my Mama clue.',
    objects: [
      { id: 'glowing_globe', label: 'Glowing globe', emoji: '🌍', x: 105, y: 305, correct: true, response: 'There it is—the little glowing globe!' },
      { id: 'moon_chart', label: 'Moon chart', emoji: '🌙', x: 900, y: 300, correct: false, response: 'That chart shows many moon phases. Look on the opposite shelf.' },
      { id: 'cozy_chair', label: 'Cozy pod chair', emoji: '💺', x: 115, y: 520, correct: false, response: 'That is the cozy observation chair. The globe is smaller and higher.' },
    ],
  },
  {
    id: 'rabbit_high_tomato',
    npcId: 'robot_rabbit',
    roomId: 'space_garden',
    title: 'The highest seed bubble',
    request: 'Boop-boop! My garden scanner needs the seed bubble floating highest above the plants. Can you find it?',
    searchPrompt: 'Find the highest floating seed bubble in the space garden.',
    success: 'Boop-tastic! That is the highest little seed bubble. Come talk to me for your Mama clue.',
    objects: [
      { id: 'highest_seed', label: 'Highest seed bubble', emoji: '🌱', x: 500, y: 245, correct: true, response: 'Correct! That seed bubble is floating highest of all.' },
      { id: 'lower_seed', label: 'Lower seed bubble', emoji: '🫧', x: 390, y: 390, correct: false, response: 'That bubble has a seed, but another one floats much higher.' },
      { id: 'plant_tube', label: 'Glowing plant tube', emoji: '🧪', x: 775, y: 340, correct: false, response: 'That tall tube grows plants. Look for a small floating bubble.' },
    ],
  },
  {
    id: 'cat_paw_badge',
    npcId: 'cat_captain',
    roomId: 'cosmic_cafe',
    title: 'The glowing paw badge',
    request: 'Meow! I can help with Mama, but first find the glowing round paw badge above the café window.',
    searchPrompt: 'Find the glowing paw badge high on the cosmic café wall.',
    success: 'Purr-fect! That is the café’s glowing paw badge. Come talk to me and I will share the clue I promised.',
    objects: [
      { id: 'star_badge', label: 'Glowing star badge', emoji: '⭐', x: 385, y: 205, correct: false, response: 'That is the star badge. Look beside it for a round badge with a paw.' },
      { id: 'paw_badge', label: 'Glowing paw badge', emoji: '🐾', x: 515, y: 205, correct: true, response: 'You found the glowing paw badge above the window!' },
      { id: 'moon_window', label: 'Moon window', emoji: '🌙', x: 510, y: 390, correct: false, response: 'That is the big moon window. The badge is much smaller and higher.' },
    ],
  },
]

export function curatedAdventure(game: Game): CuratedAdventure | null {
  const sourceId = game.librarySourceId ?? game.id
  if (sourceId === 'CaJ7U4wCJuaR8TmHmyvOp') return 'pumpkin'
  if (sourceId === 'tISvEVUXR6nUIuWUNhqbY') return 'moon'
  if (sourceId === 'cjfwNIfLt411ZZKDOC0Qo') return 'cloud'
  if (sourceId === '3v62ihEvJ-q8DM_Mda_l3') return 'dracula'

  const identity = [game.idea, game.bible?.title, game.bible?.setting.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (identity.includes('pumpkin') && identity.includes('farm')) return 'pumpkin'
  if (identity.includes('moon') && identity.includes('station')) return 'moon'
  if (identity.includes('cloud toy shop')) return 'cloud'
  if (identity.includes('dracula') && identity.includes('castle')) return 'dracula'
  return null
}

export function isCuratedAdventure(game: Game): boolean {
  return curatedAdventure(game) !== null
}

export function questsForGame(game: Game): AdventureQuest[] {
  const adventure = curatedAdventure(game)
  if (adventure === 'pumpkin') return PUMPKIN_QUESTS
  if (adventure === 'moon') return MOON_QUESTS
  return []
}

export async function localizeQuests(
  quests: AdventureQuest[],
  languageCode: string,
): Promise<AdventureQuest[]> {
  if (languageCode === 'en-IN' || !quests.length) return quests
  const strings: Record<string, string> = {}
  quests.forEach((quest, questIndex) => {
    strings[`${questIndex}.title`] = quest.title
    strings[`${questIndex}.request`] = quest.request
    strings[`${questIndex}.searchPrompt`] = quest.searchPrompt
    strings[`${questIndex}.success`] = quest.success
    quest.objects.forEach((object, objectIndex) => {
      strings[`${questIndex}.objects.${objectIndex}.label`] = object.label
      strings[`${questIndex}.objects.${objectIndex}.response`] = object.response
    })
  })
  const response = await fetch('/api/i18n/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetLanguage: languageCode, strings }),
  })
  if (!response.ok) return quests
  const result: { translations: Record<string, string> } = await response.json()
  return quests.map((quest, questIndex) => ({
    ...quest,
    title: result.translations[`${questIndex}.title`] ?? quest.title,
    request: result.translations[`${questIndex}.request`] ?? quest.request,
    searchPrompt: result.translations[`${questIndex}.searchPrompt`] ?? quest.searchPrompt,
    success: result.translations[`${questIndex}.success`] ?? quest.success,
    objects: quest.objects.map((object, objectIndex) => ({
      ...object,
      label: result.translations[`${questIndex}.objects.${objectIndex}.label`] ?? object.label,
      response: result.translations[`${questIndex}.objects.${objectIndex}.response`] ?? object.response,
    })),
  }))
}

export function questForNpc(game: Game, npcId: string): AdventureQuest | undefined {
  return questsForGame(game).find(quest => quest.npcId === npcId)
}

export function questForRoom(game: Game, roomId: string): AdventureQuest | undefined {
  return questsForGame(game).find(quest => quest.roomId === roomId)
}
