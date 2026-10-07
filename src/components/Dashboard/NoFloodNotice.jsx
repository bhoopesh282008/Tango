import { CircleHelp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDate } from '../../utils/formatters'

// Shown when the run mapped no flood at all. An empty map is easy to read as "all clear",
// which is the one conclusion the method cannot support.
export default function NoFloodNotice({ imagery }) {
  const { before, after } = imagery ?? {}
  return (
    <div role="note" className="card flex items-start gap-3 border-l-2 border-l-warning px-4 py-3 text-sm leading-relaxed text-ink-soft">
      <CircleHelp size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <p>
        <strong className="font-semibold text-ink">No flood was mapped in this area</strong>
        {before && after && ` between ${formatDate(before)} and ${formatDate(after)}`}. That is not proof that it is safe: a flood
        can be missed, and nothing here has been checked on the ground.{' '}
        <Link to="/about" className="underline">
          Method and limitations
        </Link>
      </p>
    </div>
  )
}
