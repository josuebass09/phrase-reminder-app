import { useSyncExternalStore } from 'react'
import { useT } from './i18n.ts'
import { MoonIcon, SunIcon } from './icons.tsx'
import { getTheme, subscribeTheme, toggleTheme } from './theme.ts'

/** A toggle button for dark mode. It shows the moon in light mode and the sun in dark mode. */
export function ThemeToggle() {
  const t = useT()
  const dark = useSyncExternalStore(subscribeTheme, getTheme) === 'dark'
  return (
    <button className="bar-button" type="button" aria-label={t.darkMode} aria-pressed={dark} onClick={toggleTheme}>
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
