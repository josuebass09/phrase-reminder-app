// Reads phrases aloud with the device's own voices (the Web Speech API): free,
// no server, and it works offline. iOS uses its Siri-family voices and Android
// its Google voice; better ones can be downloaded in the phone's settings.

/** The voice's normal speed, labeled 1x. */
export const NORMAL_RATE = 1
/** Half speed, labeled 0.5x, for hearing each sound. */
export const SLOW_RATE = 0.5

/** Joke voices that ship with Apple devices under en-US. They are never the right pick. */
const NOVELTY_VOICES =
  /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|fred|good news|hysterical|jester|junior|kathy|organ|pipe organ|princess|ralph|superstar|trinoids|whisper|wobble|zarvox)\b/i

export function speechSupported(): boolean {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance === 'function'
}

function score(voice: SpeechSynthesisVoice): number {
  const lang = voice.lang.replace('_', '-').toLowerCase()
  let points = lang === 'en-us' ? 4 : lang === 'en-gb' ? 2 : 1
  if (/enhanced|premium|natural|neural/i.test(voice.name)) points += 3
  if (/google/i.test(voice.name)) points += 2
  if (voice.localService) points += 1 // Works offline and starts without a delay.
  return points
}

/** The best English voice on this device, or null to let the browser choose. */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang) && !NOVELTY_VOICES.test(voice.name))
  return english.reduce<SpeechSynthesisVoice | null>((best, voice) => (best && score(best) >= score(voice) ? best : voice), null)
}

let current: SpeechSynthesisUtterance | null = null

/**
 * Reads the text aloud, cutting off anything already playing. onEnd runs once
 * the text finishes or fails, but not when another call or stopSpeaking cut it off.
 */
export function speak(text: string, onEnd: () => void, rate = NORMAL_RATE): void {
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  // Voices can still be loading on the first call; then the browser picks one for the language.
  const voice = pickVoice(speechSynthesis.getVoices())
  if (voice) utterance.voice = voice
  utterance.lang = voice?.lang ?? 'en-US'
  utterance.rate = rate
  const finish = () => {
    if (current !== utterance) return
    current = null
    onEnd()
  }
  utterance.onend = finish
  utterance.onerror = finish
  current = utterance
  speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  current = null
  if (speechSupported()) speechSynthesis.cancel()
}
