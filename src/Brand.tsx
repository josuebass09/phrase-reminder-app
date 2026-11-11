import { useT } from './i18n.ts'
import { BookIcon } from './icons.tsx'

export function Brand() {
  const t = useT()
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <BookIcon />
      </span>
      <h1>{t.appName}</h1>
    </div>
  )
}
