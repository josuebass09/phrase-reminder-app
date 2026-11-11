// Records the user saying a phrase with the browser's MediaRecorder. Nothing is
// kept on the device: the recording goes to the backend to be scored, and is dropped.

/** A phrase takes a few seconds to say, so a recording stops on its own after this. */
export const MAX_RECORDING_MS = 10_000

// The first one the browser records. Chrome, Firefox and Android record WebM, and
// Safari MP4; the backend reads both.
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export function recordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  )
}

export interface Recorder {
  /** The recording once it stops, or null if it was cancelled. */
  done: Promise<Blob | null>
  /** Stops recording, and `done` gives the recording. */
  stop: () => void
  /** Stops recording and drops it. */
  cancel: () => void
  /** How loud the microphone hears the user right now, from 0 (silence) to 1. Missing where the browser can't measure it. */
  level?: () => number
}

/**
 * The microphone gives no sound at all. On iOS 27, reading a phrase aloud with speech synthesis
 * silences the page's microphone until it reloads (https://bugs.webkit.org/show_bug.cgi?id=218815):
 * its tracks come muted, and a recording from them holds no audio.
 */
export class SilentMicrophoneError extends Error {
  constructor() {
    super('The microphone gives no sound')
    this.name = 'SilentMicrophoneError'
  }
}

/** How long a muted microphone gets to come on, since some start muted for a moment. */
const UNMUTE_WAIT_MS = 1000

/** Whether the track gives sound, waiting a moment for one that starts muted. */
function soundsSoon(track: MediaStreamTrack): Promise<boolean> {
  if (!track.muted) return Promise.resolve(true)
  return new Promise((resolve) => {
    const unmuted = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      track.removeEventListener('unmute', unmuted)
      resolve(false)
    }, UNMUTE_WAIT_MS)
    track.addEventListener('unmute', unmuted, { once: true })
  })
}

// Loudness in decibels, mapped onto 0 to 1: a quiet room is below the floor, and speaking up reaches the top.
const SILENCE_DB = -50
const LOUD_DB = -10

/** Measures how loud a stream is, through an audio graph that plays nothing. */
function listen(audio: AudioContext, stream: MediaStream): () => number {
  const analyser = audio.createAnalyser()
  analyser.fftSize = 512
  const mute = audio.createGain()
  mute.gain.value = 0
  // Through a muted output, since some browsers only run an analyser that leads somewhere.
  audio.createMediaStreamSource(stream).connect(analyser)
  analyser.connect(mute).connect(audio.destination)
  const samples = new Uint8Array(analyser.fftSize)
  return () => {
    analyser.getByteTimeDomainData(samples)
    let sum = 0
    for (const sample of samples) {
      const centered = (sample - 128) / 128
      sum += centered * centered
    }
    const db = 20 * Math.log10(Math.sqrt(sum / samples.length) || 1e-6)
    return Math.min(1, Math.max(0, (db - SILENCE_DB) / (LOUD_DB - SILENCE_DB)))
  }
}

/** An audio context for measuring the microphone, or null where there's none. */
function openAudio(): AudioContext | null {
  try {
    return typeof AudioContext === 'function' ? new AudioContext() : null
  } catch {
    return null
  }
}

/**
 * Starts recording from the microphone, asking for permission the first time.
 * Rejects with a NotAllowedError DOMException if the user or the device blocks it.
 */
export async function startRecording(): Promise<Recorder> {
  // Opened before asking for the microphone, while this still runs in the user's tap:
  // iOS Safari keeps an audio context opened later suspended, and silent.
  const audio = openAudio()
  const closeAudio = () => void audio?.close().catch(() => {})
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  } catch (error) {
    closeAudio()
    throw error
  }
  // Said before the user speaks, rather than after, from a recording with no audio.
  const track = stream.getTracks().find((candidate) => candidate.kind === 'audio')
  if (track && !(await soundsSoon(track))) {
    stream.getTracks().forEach((each) => each.stop())
    closeAudio()
    throw new SilentMicrophoneError()
  }
  const type = TYPES.find((candidate) => MediaRecorder.isTypeSupported?.(candidate))
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    closeAudio()
    throw error
  }

  let level: (() => number) | undefined
  try {
    if (audio) {
      level = listen(audio, stream)
      void audio.resume().catch(() => {})
    }
  } catch {
    closeAudio() // Recording works without it; only the waveform is missing.
  }

  const chunks: Blob[] = []
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  // Releasing the microphone turns off the recording indicator on the phone.
  const release = () => {
    clearTimeout(timer)
    stream.getTracks().forEach((track) => track.stop())
    closeAudio()
  }
  const done = new Promise<Blob | null>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      // Silenced partway, the recording has no audio from then on: not worth scoring.
      const silenced = track?.muted === true
      release()
      if (cancelled) resolve(null)
      else if (silenced) reject(new SilentMicrophoneError())
      else resolve(new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' }))
    }
    recorder.onerror = () => {
      release()
      reject(new Error("Couldn't record"))
    }
  })

  const stop = () => {
    if (recorder.state !== 'inactive') recorder.stop()
  }
  recorder.start()
  timer = setTimeout(stop, MAX_RECORDING_MS)
  return {
    done,
    stop,
    cancel: () => {
      cancelled = true
      stop()
    },
    ...(level ? { level } : {}),
  }
}
