import { useRef, type JSX, type KeyboardEvent } from 'react'
import { BookIcon, MessagesIcon } from './icons.tsx'
import { panelId, tabId, type Tab } from './sections.ts'

const TABS: { id: Tab; label: string; icon: () => JSX.Element }[] = [
  { id: 'phrases', label: 'Phrases', icon: BookIcon },
  { id: 'chat', label: 'Chat', icon: MessagesIcon },
]

export interface TabsProps {
  tab: Tab
  onChange: (tab: Tab) => void
}

/**
 * The app's two sections. A segmented control on iOS and Material tabs on
 * Android (see styles.css), with the arrow keys of the ARIA tabs pattern.
 */
export function Tabs({ tab, onChange }: TabsProps) {
  const list = useRef<HTMLDivElement>(null)

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = TABS.findIndex(({ id }) => id === tab)
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id
    onChange(next)
    list.current?.querySelector<HTMLButtonElement>(`#${tabId(next)}`)?.focus()
  }

  return (
    <div className="tabs" role="tablist" aria-label="Sections" ref={list} onKeyDown={onKeyDown}>
      {TABS.map(({ id, label, icon: TabIcon }) => (
        <button
          key={id}
          id={tabId(id)}
          className="tab"
          type="button"
          role="tab"
          aria-selected={tab === id}
          aria-controls={panelId(id)}
          tabIndex={tab === id ? 0 : -1}
          onClick={() => onChange(id)}
        >
          <TabIcon />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
