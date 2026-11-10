import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickVoice, speak, speechSupported, stopSpeaking } from './speech.ts'
import { fakeSpeech, voice } from './test/fake-speech.ts'

afterEach(() => vi.unstubAllGlobals())

describe('pickVoice', () => {
  it('prefers an enhanced American voice', () => {
    const best = voice('Ava (Enhanced)', 'en-US')
    const voices = [voice('Thomas', 'fr-FR'), voice('Daniel', 'en-GB'), voice('Samantha', 'en-US'), best]

    expect(pickVoice(voices)).toBe(best)
  })

  it('takes American over British English, all else equal', () => {
    const american = voice('Samantha', 'en-US')

    expect(pickVoice([voice('Daniel', 'en-GB'), american])).toBe(american)
  })

  it('accepts an underscore in the language, as some Android browsers report it', () => {
    const google = voice('English United States', 'en_US')

    expect(pickVoice([voice('Daniel', 'en-GB'), google])).toBe(google)
  })

  it('never picks a novelty voice', () => {
    const plain = voice('Karen', 'en-AU')

    expect(pickVoice([voice('Zarvox', 'en-US'), voice('Bad News', 'en-US'), plain])).toBe(plain)
  })

  it('returns null when there is no English voice, to let the browser choose', () => {
    expect(pickVoice([voice('Paulina', 'es-MX')])).toBeNull()
    expect(pickVoice([])).toBeNull()
  })
})

describe('speak', () => {
  it('reads the text a little slowly with the best English voice', () => {
    const { synth, spoken } = fakeSpeech([voice('Samantha', 'en-US')])

    speak("It's a deal.", () => {})

    expect(synth.cancel).toHaveBeenCalled()
    expect(spoken).toHaveLength(1)
    expect(spoken[0]).toMatchObject({ text: "It's a deal.", lang: 'en-US', rate: 0.9 })
    expect(spoken[0].voice?.name).toBe('Samantha')
  })

  it('asks for American English while the voices are still loading', () => {
    const { spoken } = fakeSpeech([])

    speak('Hello.', () => {})

    expect(spoken[0]).toMatchObject({ lang: 'en-US', voice: null })
  })

  it('reports the end of the phrase being read, but not of one it cut off', () => {
    const { spoken } = fakeSpeech()
    const firstEnded = vi.fn()
    const secondEnded = vi.fn()

    speak('First.', firstEnded)
    speak('Second.', secondEnded)
    spoken[0].onerror?.() // Browsers report a cut-off phrase as an error.
    spoken[1].onend?.()

    expect(firstEnded).not.toHaveBeenCalled()
    expect(secondEnded).toHaveBeenCalledTimes(1)
  })

  it('reports nothing after stopSpeaking', () => {
    const { synth, spoken } = fakeSpeech()
    const ended = vi.fn()

    speak('Hello.', ended)
    stopSpeaking()
    spoken[0].onend?.()

    expect(synth.cancel).toHaveBeenCalledTimes(2)
    expect(ended).not.toHaveBeenCalled()
  })

  it('is supported only where the browser has the Web Speech API', () => {
    expect(speechSupported()).toBe(false)
    fakeSpeech()
    expect(speechSupported()).toBe(true)
  })
})
