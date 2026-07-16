let ctx: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null
let masterGain: GainNode | null = null
let muted = false
const cache = new Map<string, AudioBuffer>()

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext()
    masterGain = ctx.createGain()
    masterGain.gain.value = muted ? 0 : 1
    masterGain.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
}

export async function playAudio(url: string): Promise<void> {
  if (!ctx) return
  currentSource?.stop()
  currentSource = null

  let buffer = cache.get(url)
  if (!buffer) {
    const res = await fetch(url)
    const arrayBuf = await res.arrayBuffer()
    buffer = await ctx.decodeAudioData(arrayBuf)
    cache.set(url, buffer)
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(masterGain ?? ctx.destination)
  source.start()
  currentSource = source
}

export function stopAudio() {
  currentSource?.stop()
  currentSource = null
  window.speechSynthesis?.cancel()
}

export function setMuted(value: boolean) {
  muted = value
  if (value) window.speechSynthesis?.cancel()
  if (masterGain && ctx) {
    masterGain.gain.setValueAtTime(value ? 0 : 1, ctx.currentTime)
  }
}

export function isMuted() {
  return muted
}

// Short, no-cost narration for player-triggered object descriptions. This uses
// the browser's local speech voice, so looking at scenery never calls an API.
export function speakText(text: string) {
  if (muted || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.92
  utterance.pitch = 1.08
  window.speechSynthesis.speak(utterance)
}

// Soft trotting footstep, synthesized (no asset file needed): a tiny filtered
// noise "pat", alternating pitch like left/right trotters.
let stepParity = false
export function footstep() {
  if (!ctx || ctx.state !== 'running') return
  const dur = 0.07
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) {
    const decay = 1 - i / d.length
    d[i] = (Math.random() * 2 - 1) * decay * decay
  }
  const src = ctx.createBufferSource()
  src.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = stepParity ? 950 : 720
  bp.Q.value = 1.4
  const gain = ctx.createGain()
  gain.gain.value = 0.09
  src.connect(bp)
  bp.connect(gain)
  gain.connect(masterGain ?? ctx.destination)
  src.start()
  stepParity = !stepParity
}

// Soft two-note chime, synthesized (no asset file needed)
export function playChime() {
  if (!ctx) return
  const notes = [523.25, 783.99] // C5, G5
  notes.forEach((freq, i) => {
    const osc = ctx!.createOscillator()
    const gain = ctx!.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t0 = ctx!.currentTime + i * 0.12
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5)
    osc.connect(gain)
    gain.connect(masterGain ?? ctx!.destination)
    osc.start(t0)
    osc.stop(t0 + 0.55)
  })
}
