import { useCallback, useRef, useState } from 'react'

export type VoiceInputState = 'idle' | 'requesting' | 'recording' | 'processing' | 'error'

export function useVoiceInput(languageCode: string, onTranscript: (text: string) => void) {
  const [state, setState] = useState<VoiceInputState>('idle')
  const [error, setError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('unavailable')
      setState('error')
      return
    }
    setState('requesting')
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find(type => MediaRecorder.isTypeSupported(type)) ?? ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        setState('processing')
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          const response = await fetch(`/api/transcribe?languageCode=${encodeURIComponent(languageCode)}`, {
            method: 'POST', headers: { 'Content-Type': blob.type }, body: blob,
          })
          if (!response.ok) throw new Error('transcription failed')
          const result: { text?: string } = await response.json()
          if (!result.text?.trim()) throw new Error('empty')
          onTranscript(result.text.trim())
          setState('idle')
        } catch (voiceError) {
          setError(voiceError instanceof Error ? voiceError.message : 'failed')
          setState('error')
        }
      }
      recorder.start(250)
      setState('recording')
      window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, 30000)
    } catch {
      setError('permission')
      setState('error')
    }
  }, [languageCode, onTranscript])

  const toggle = useCallback(() => {
    if (state === 'recording') stop()
    else if (state === 'idle' || state === 'error') start()
  }, [start, state, stop])

  return { state, error, toggle }
}
