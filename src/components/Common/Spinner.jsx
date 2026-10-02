import { Loader2 } from 'lucide-react'

export default function Spinner({ label, size = 20, className = '' }) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 text-sm text-ink-soft ${className}`}>
      <Loader2 size={size} className="animate-spin" aria-hidden />
      {label && <span>{label}…</span>}
    </span>
  )
}
