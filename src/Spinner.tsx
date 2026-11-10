/**
 * A busy indicator in the platform's own style: iOS's spoked activity indicator,
 * or Material's circular progress indicator on Android. It's decorative, so the
 * control or text next to it says what is happening.
 */
export function Spinner() {
  if (document.documentElement.dataset.platform === 'android') {
    return (
      <span className="spinner spinner-android" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
        </svg>
      </span>
    )
  }
  return (
    <span className="spinner spinner-ios" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}
