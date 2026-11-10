import { useSyncExternalStore } from 'react'
import { MoonIcon, SunIcon } from './icons.tsx'
import { getTheme, subscribeTheme, toggleTheme } from './theme.ts'

/** A toggle button for dark mode. It shows the moon in light mode and the sun in dark mode. */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeTheme, getTheme) === 'dark'
  return (
    <button className="bar-button" type="button" aria-label="Dark mode" aria-pressed={dark} onClick={toggleTheme}>
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
