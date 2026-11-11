import { afterEach, describe, expect, it, vi } from 'vitest'
import { startRecording } from './recorder.ts'

/** A microphone and recorder that do nothing, and an audio context that hears `sample` (128 is silence). */
function fakeDevice({ sample, audio = true }: { sample: number; audio?: boolean }) {
  const stream = { getTracks: () => [{ stop: vi.fn() }] }
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => stream }, configurable: true })
  vi.stubGlobal(
    'MediaRecorder',
    class {
      static isTypeSupported = () => true
      state = 'inactive'
      mimeType = 'audio/webm'
      ondataavailable: ((event: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      start() {
        this.state = 'recording'
      }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['audio']) })
        this.onstop?.()
      }
    },
  )
  const close = vi.fn(async () => {})
  if (audio) {
    const node = { connect: <T,>(next: T) => next }
    vi.stubGlobal(
      'AudioContext',
      class {
        destination = {}
        createAnalyser = () => ({ ...node, fftSize: 0, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(sample) })
        createGain = () => ({ ...node, gain: { value: 1 } })
        createMediaStreamSource = () => node
        resume = async () => {}
        close = close
      },
    )
  }
  return { close }
}

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('startRecording', () => {
  it('hears nothing in silence', async () => {
    fakeDevice({ sample: 128 })
    const recorder = await startRecording()
    expect(recorder.level?.()).toBe(0)
    recorder.cancel()
  })

  it('hears a loud voice near the top', async () => {
    fakeDevice({ sample: 220 }) // About -3 dB.
    const recorder = await startRecording()
    expect(recorder.level?.()).toBe(1)
    recorder.cancel()
  })

  it('hears a normal voice in between', async () => {
    fakeDevice({ sample: 133 }) // About -28 dB.
    const recorder = await startRecording()
    const level = recorder.level?.() ?? -1
    expect(level).toBeGreaterThan(0.3)
    expect(level).toBeLessThan(0.7)
    recorder.cancel()
  })

  it('closes the audio once the recording stops', async () => {
    const device = fakeDevice({ sample: 128 })
    const recorder = await startRecording()
    recorder.stop()
    expect(await recorder.done).toBeInstanceOf(Blob)
    expect(device.close).toHaveBeenCalled()
  })

  it('still records where the browser has no audio context, with no level', async () => {
    fakeDevice({ sample: 128, audio: false })
    const recorder = await startRecording()
    expect(recorder.level).toBeUndefined()
    recorder.stop()
    expect(await recorder.done).toBeInstanceOf(Blob)
  })
})
