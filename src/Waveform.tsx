import { useEffect, useRef } from 'react'

/** How often a new bar comes in on the right, pushing the others left. */
const STEP_MS = 70
/** A bar's height in silence, as a share of the full height: a dot, so the line stays in view. */
const REST = 0.12

/**
 * The user's voice as it's recorded: bars that rise while they speak and lie flat while they're quiet,
 * scrolling from right to left. Decorative, since the microphone button already says it's recording.
 */
export function Waveform({ level, bars = 24 }: { level: () => number; bars?: number }) {
  const box = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const spans = Array.from(box.current?.children ?? []) as HTMLElement[]
    const heights = spans.map(() => REST)
    let frame = 0
    let last = 0
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      if (now - last < STEP_MS) return
      last = now
      heights.shift()
      // Square root, so a normal speaking voice fills most of the height and not just loud sounds.
      heights.push(REST + (1 - REST) * Math.sqrt(level()))
      spans.forEach((span, index) => {
        span.style.transform = `scaleY(${heights[index]})`
      })
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [level])

  return (
    <span ref={box} className="waveform" aria-hidden="true">
      {Array.from({ length: bars }, (_, index) => (
        <span key={index} />
      ))}
    </span>
  )
}
