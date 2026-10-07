import { Link } from 'react-router-dom'
import { formatDate } from '../../utils/formatters'

// Shown when the run mapped no flood at all. An empty map is easy to read as "all clear",
// which is the one conclusion the method cannot support.
export default function NoFloodNotice({ imagery }) {
  const { before, after } = imagery ?? {}
  return (
    <div role="note" className="border-l-2 border-l-warning pl-3 text-[13px] leading-relaxed text-ink-soft">
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
