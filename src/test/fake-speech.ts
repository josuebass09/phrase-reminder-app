import { vi } from 'vitest'

/** A stand-in for the Web Speech API, which jsdom doesn't have. */
export class FakeUtterance {
  text: string
  lang = ''
  rate = 1
  voice: SpeechSynthesisVoice | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(text: string) {
    this.text = text
  }
}

export function voice(name: string, lang: string, localService = true): SpeechSynthesisVoice {
  return { name, lang, localService, default: false, voiceURI: name } as SpeechSynthesisVoice
}

/** Installs a fake speechSynthesis. Each spoken utterance is kept, so tests can finish it. */
export function fakeSpeech(voices: SpeechSynthesisVoice[] = [voice('Samantha', 'en-US')]) {
  const spoken: FakeUtterance[] = []
  const synth = {
    getVoices: () => voices,
    speak: vi.fn((utterance: FakeUtterance) => spoken.push(utterance)),
    cancel: vi.fn(),
  }
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  return { synth, spoken }
}
