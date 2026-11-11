import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'

/** Which way a card was swiped. */
export type SwipeSide = 'right' | 'left'

/** How far a card goes before letting go swipes it away, as a share of its width. */
const THRESHOLD = 0.3
/** A quick flick swipes it away sooner: this fast, in pixels a millisecond, and this far. */
const FLICK_SPEED = 0.6
const FLICK_DISTANCE = 40
/** A finger moves this far before it's a swipe rather than a tap, and mostly sideways, or it's a scroll. */
const SLOP = 10
/** The card tilts as it goes, up to this many degrees, like a card pushed off a table. */
const MAX_TILT = 10
/** How long the card takes to fly off, and the list to close up after it. */
const FLY_MS = 250
const CLOSE_MS = 220

function prefersLessMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Swiping a card sideways: it follows the finger and tilts, `progress` says how near letting go
 * would swipe it away (1 is there), and past that it flies off, the list closes up, and
 * `onSwiped` runs. Short of it, the card springs back. Up and down still scroll the page, and a
 * swipe never counts as a tap on what's under the finger.
 */
export function useSwipe<T extends HTMLElement>(onSwiped: ((side: SwipeSide) => void) | null) {
  const element = useRef<T>(null)
  // The latest callback, without restarting the animation when the parent makes a new one.
  const callback = useRef(onSwiped)
  useEffect(() => {
    callback.current = onSwiped
  }, [onSwiped])
  const [offset, setOffset] = useState(0)
  const [phase, setPhase] = useState<'still' | 'dragging' | 'flying' | 'closing' | 'closed'>('still')
  const [height, setHeight] = useState<number | null>(null)
  // Where the finger started and last was, and how fast it's going sideways.
  const pointer = useRef<{ id: number; x: number; y: number; lastX: number; at: number; swiping: boolean; speed: number } | null>(null)
  const swiped = useRef(false)
  // The card's width, taken when a swipe starts.
  const [width, setWidth] = useState(1)
  const progress = Math.min(1, Math.abs(offset) / (width * THRESHOLD))

  // Fly off, then close the gap, then report it.
  useEffect(() => {
    if (phase === 'flying') {
      const timer = setTimeout(() => {
        setHeight(element.current?.offsetHeight ?? 0)
        setPhase('closing')
      }, FLY_MS)
      return () => clearTimeout(timer)
    }
    if (phase === 'closing') {
      const frame = requestAnimationFrame(() => setHeight(0)) // From its height to none, so it animates.
      const timer = setTimeout(() => {
        setPhase('closed')
        callback.current?.(offset > 0 ? 'right' : 'left')
      }, CLOSE_MS)
      return () => {
        cancelAnimationFrame(frame)
        clearTimeout(timer)
      }
    }
  }, [phase, offset])

  function onPointerDown(event: PointerEvent<T>) {
    if (!onSwiped || phase !== 'still' || (event.pointerType === 'mouse' && event.button !== 0)) return
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, at: event.timeStamp, swiping: false, speed: 0 }
  }

  function onPointerMove(event: PointerEvent<T>) {
    const start = pointer.current
    if (!start || event.pointerId !== start.id) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.swiping) {
      if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) {
        pointer.current = null // A scroll.
        return
      }
      if (Math.abs(dx) <= SLOP) return
      start.swiping = true
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setWidth(event.currentTarget.offsetWidth || 1)
      setPhase('dragging')
    }
    start.speed = (event.clientX - start.lastX) / Math.max(1, event.timeStamp - start.at)
    start.lastX = event.clientX
    start.at = event.timeStamp
    setOffset(dx)
  }

  function onPointerUp(event: PointerEvent<T>) {
    const start = pointer.current
    pointer.current = null
    if (!start?.swiping || event.pointerId !== start.id) return
    swiped.current = true // The click that follows isn't a tap.
    const far = Math.abs(offset) >= width * THRESHOLD
    const flicked = Math.abs(start.speed) >= FLICK_SPEED && Math.abs(offset) >= FLICK_DISTANCE && Math.sign(start.speed) === Math.sign(offset)
    if (!far && !flicked) {
      setOffset(0)
      setPhase('still')
      return
    }
    if (prefersLessMotion()) {
      setPhase('closed')
      onSwiped?.(offset > 0 ? 'right' : 'left')
      return
    }
    setOffset(Math.sign(offset) * width * 1.5)
    setPhase('flying')
  }

  function onPointerCancel() {
    if (!pointer.current?.swiping) {
      pointer.current = null
      return
    }
    pointer.current = null
    setOffset(0)
    setPhase('still')
  }

  // Keeps a swipe's last click from opening the phrase or pressing a button under the finger.
  function onClickCapture(event: MouseEvent<T>) {
    if (!swiped.current) return
    swiped.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, (offset / width) * MAX_TILT * 1.5))
  const style: CSSProperties = {
    ...(offset !== 0 && { transform: `translateX(${offset}px) rotate(${tilt}deg)` }),
    ...(phase === 'dragging' && { transition: 'none' }),
    ...(phase === 'flying' && { transition: `transform ${FLY_MS}ms ease-in` }),
    ...((phase === 'closing' || phase === 'closed') && {
      height: height ?? undefined,
      paddingTop: 0,
      paddingBottom: 0,
      marginBottom: height === 0 ? -10 : 0, // The list's gap goes too.
      borderWidth: height === 0 ? 0 : undefined,
      opacity: 0,
      overflow: 'hidden',
      transition: `height ${CLOSE_MS}ms ease, margin ${CLOSE_MS}ms ease, padding ${CLOSE_MS}ms ease`,
    }),
  }

  return {
    ref: element,
    handlers: onSwiped ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture } : {},
    style,
    /** Which way it's going, and how near letting go would swipe it away, from 0 to 1. */
    side: offset === 0 ? null : offset > 0 ? ('right' as const) : ('left' as const),
    progress,
    moving: phase !== 'still',
  }
}
