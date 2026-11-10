import { BookIcon } from './icons.tsx'

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <BookIcon />
      </span>
      <h1>Phrases</h1>
    </div>
  )
}
