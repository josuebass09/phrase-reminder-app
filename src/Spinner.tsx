/**
 * A busy indicator: a ring that turns. It's decorative, so the control or text
 * next to it says what is happening.
 */
export function Spinner() {
  return (
    <span className="spinner" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
      </svg>
    </span>
  )
}
