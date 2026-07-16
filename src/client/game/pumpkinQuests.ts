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

export interface PumpkinQuest {
  id: string
  npcId: string
  roomId: string
  title: string
  request: string
  searchPrompt: string
  success: string
  objects: QuestObject[]
}

export const PUMPKIN_QUESTS: PumpkinQuest[] = [
  {
    id: 'cow_hay_fork',
    npcId: 'cow',
    roomId: 'barn',
    title: 'The missing hay fork',
    request: 'Moo! I did see Mama, but first could you help me? Find the blue tool with three prongs. It is perfect for lifting hay.',
    searchPrompt: 'Look around the barn for the blue tool with three prongs.',
    success: 'Moo-velous! That is my hay fork. Come talk to me and I will tell you what I noticed about Mama.',
    objects: [
      { id: 'satchel', label: 'Leather satchel', emoji: '🎒', x: 220, y: 445, correct: false, response: 'That is my little tool satchel. Useful—but it has no prongs!' },
      { id: 'hay_fork', label: 'Blue hay fork', emoji: '✨', x: 515, y: 410, correct: true, response: 'You found the blue hay fork!' },
      { id: 'shovel', label: 'Blue shovel', emoji: '🧹', x: 580, y: 410, correct: false, response: 'That tool has one wide scoop. Look for three pointy prongs.' },
    ],
  },
  {
    id: 'goat_top_pie',
    npcId: 'goat',
    roomId: 'market',
    title: 'The pie on top',
    request: 'Baa-hello! I can help with Mama, but my special pie is hiding in plain sight. Find the pie sitting all by itself at the very top.',
    searchPrompt: 'Find the pie sitting alone at the very top of the bakery shelves.',
    success: 'Baa-rilliant! That is the special top-shelf pie. Come talk to me for the clue I promised.',
    objects: [
      { id: 'top_pie', label: 'Top-shelf pie', emoji: '🥧', x: 300, y: 170, correct: true, response: 'That pie is sitting all alone at the very top!' },
      { id: 'middle_pies', label: 'Middle-shelf pies', emoji: '🥧', x: 384, y: 292, correct: false, response: 'Those pies have neighbors. The special pie is sitting all alone.' },
      { id: 'wooden_tubs', label: 'Wooden pie tubs', emoji: '🪵', x: 205, y: 520, correct: false, response: 'Those are wooden tubs. Look higher—much higher!' },
    ],
  },
  {
    id: 'duck_rolling_apple',
    npcId: 'duck',
    roomId: 'orchard',
    title: 'The runaway apple',
    request: 'Quack! Mama hurried past here, but one apple rolled away while I waved. Can you find the apple sitting alone on the floor?',
    searchPrompt: 'Find the single apple that rolled away from all the baskets and crates.',
    success: 'Quack-tastic! You rescued the runaway apple. Come back and I will share my Mama clue.',
    objects: [
      { id: 'apple_basket', label: 'Basket of apples', emoji: '🧺', x: 285, y: 420, correct: false, response: 'Those apples are safely together in their basket. One apple rolled away alone.' },
      { id: 'cider_mugs', label: 'Warm cider mugs', emoji: '☕', x: 455, y: 515, correct: false, response: 'Mmm, warm cider! But we are searching for one runaway apple.' },
      { id: 'runaway_apple', label: 'Runaway apple', emoji: '🍎', x: 575, y: 640, correct: true, response: 'There is the runaway apple, all by itself!' },
    ],
  },
]

export function isPumpkinFarm(game: Game): boolean {
  return game.bible?.setting.name.toLowerCase().includes('pumpkin') ?? false
}

export function pumpkinQuestForNpc(game: Game, npcId: string): PumpkinQuest | undefined {
  if (!isPumpkinFarm(game)) return undefined
  return PUMPKIN_QUESTS.find(quest => quest.npcId === npcId)
}

export function pumpkinQuestForRoom(game: Game, roomId: string): PumpkinQuest | undefined {
  if (!isPumpkinFarm(game)) return undefined
  return PUMPKIN_QUESTS.find(quest => quest.roomId === roomId)
}
