// Unified input: keyboard + virtual (touch D-pad) sources feed the same axes.

export type Dir = 'up' | 'down' | 'left' | 'right'

const keyboard = new Set<string>()
const virtual = new Set<Dir>()

function onKeyDown(e: KeyboardEvent) {
  keyboard.add(e.key.toLowerCase())
}
function onKeyUp(e: KeyboardEvent) {
  keyboard.delete(e.key.toLowerCase())
}

export function attachKeyboard() {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
}

export function detachKeyboard() {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  keyboard.clear()
  virtual.clear()
}

export function setVirtualKey(dir: Dir, down: boolean) {
  if (down) virtual.add(dir)
  else virtual.delete(dir)
}

// Debug handle (dev only)
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__oinkInput = { keyboard, virtual }
}

export function getAxis(): { vx: number; vy: number } {
  let vx = 0
  let vy = 0
  if (keyboard.has('arrowleft') || keyboard.has('a') || virtual.has('left')) vx -= 1
  if (keyboard.has('arrowright') || keyboard.has('d') || virtual.has('right')) vx += 1
  if (keyboard.has('arrowup') || keyboard.has('w') || virtual.has('up')) vy -= 1
  if (keyboard.has('arrowdown') || keyboard.has('s') || virtual.has('down')) vy += 1
  if (vx !== 0 && vy !== 0) {
    vx *= 0.707
    vy *= 0.707
  }
  return { vx, vy }
}
