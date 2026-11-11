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
}

/**
 * Starts recording from the microphone, asking for permission the first time.
 * Rejects with a NotAllowedError DOMException if the user or the device blocks it.
 */
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const type = TYPES.find((candidate) => MediaRecorder.isTypeSupported?.(candidate))
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    throw error
  }

  const chunks: Blob[] = []
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  // Releasing the microphone turns off the recording indicator on the phone.
  const release = () => {
    clearTimeout(timer)
    stream.getTracks().forEach((track) => track.stop())
  }
  const done = new Promise<Blob | null>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      release()
      resolve(cancelled ? null : new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' }))
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
  }
}
