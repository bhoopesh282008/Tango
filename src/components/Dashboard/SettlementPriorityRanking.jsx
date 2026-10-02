import { Building2, Footprints, MapPin, ShieldAlert, Users } from 'lucide-react'
import { useState } from 'react'
import { USE_MOCK } from '../../config/apiConfig'
import { useMapStore } from '../../store/mapStore'
import { ACCESS_LEVELS, PRIORITY_BANDS } from '../../utils/constants'
import { formatNumber, formatPercent } from '../../utils/formatters'

const SORTS = [
  { id: 'priority', label: 'Priority', compare: (a, b) => a.rank - b.rank },
  { id: 'population', label: 'Population', compare: (a, b) => b.population - a.population },
  { id: 'damage', label: 'Damage', compare: (a, b) => b.damageRatio - a.damageRatio },
  {
    id: 'access',
    label: 'Access',
    compare: (a, b) => (b.access_difficulty ?? 1) - (a.access_difficulty ?? 1) || a.rank - b.rank,
  },
]

// Yellow and green need dark text to stay readable.
const BAND_STYLE = {
  critical: { border: 'border-l-critical', fill: 'bg-critical', chip: 'bg-critical text-white' },
  high: { border: 'border-l-danger', fill: 'bg-danger', chip: 'bg-danger text-white' },
  medium: { border: 'border-l-warning', fill: 'bg-warning', chip: 'bg-warning text-[#1a1a1a]' },
  low: { border: 'border-l-success', fill: 'bg-success', chip: 'bg-success text-[#1a1a1a]' },
}

function Metric({ icon: Icon, label, children }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-soft">
        <Icon size={13} aria-hidden /> {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink">{children}</dd>
    </div>
  )
}

function PriorityCard({ settlement: s }) {
  const focusSettlement = useMapStore((state) => state.focusSettlement)
  const band = PRIORITY_BANDS.find((b) => b.id === s.band)
  const style = BAND_STYLE[s.band]
  const access = ACCESS_LEVELS[(s.access_difficulty ?? 1) - 1] ?? ACCESS_LEVELS[0]
  const critical = [
    s.healthPostUnreachable && 'Health post unreachable',
    s.bridgeDestroyed && 'Bridge destroyed',
    s.water_source_cut && 'Water supply cut',
  ].filter(Boolean)

  return (
    <li className={`card flex flex-col border-l-[5px] p-4 ${style.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{s.name}</h3>
          <p className="text-xs text-ink-soft">Cut off: no road access</p>
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${style.chip}`}
          aria-label={`Priority rank ${s.rank}`}
        >
          #{s.rank}
        </span>
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${style.chip}`}>
          {band.label}
        </span>
        <span className="text-sm">
          <span className="text-xl font-bold">{s.priority}</span>
          <span className="text-ink-soft"> / 100</span>
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-alt"
        role="meter"
        aria-label="Rescue priority score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={s.priority}
      >
        <div className={`h-full ${style.fill}`} style={{ width: `${s.priority}%` }} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-surface-alt p-3">
        <Metric icon={Users} label="Population">
          {formatNumber(s.population)}
        </Metric>
        <Metric icon={Building2} label="Damage">
          {formatNumber(s.damaged)} / {formatNumber(s.total)} ({formatPercent(s.damageRatio)})
        </Metric>
        <Metric icon={Footprints} label="Access">
          {access.label}
        </Metric>
        <Metric icon={ShieldAlert} label="Critical">
          {critical.length ? critical.join(', ') : 'None reported'}
        </Metric>
      </dl>

      <button type="button" className="btn no-print mt-3 w-full" onClick={() => focusSettlement(s)}>
        <MapPin size={16} aria-hidden /> Show on map
      </button>
    </li>
  )
}

export default function SettlementPriorityRanking({ stats }) {
  const [sortId, setSortId] = useState('priority')
  const sort = SORTS.find((s) => s.id === sortId)
  const settlements = [...stats.priority].sort(sort.compare)

  if (settlements.length === 0) return null

  return (
    <section aria-labelledby="priority-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="priority-heading" className="section-title mr-auto">
          Rescue priority ranking{' '}
          <span className="text-xs font-normal text-ink-soft">
            {settlements.length} cut-off settlements
          </span>
        </h2>
        <div className="no-print flex" role="group" aria-label="Sort settlements by">
          {SORTS.map((option, i) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSortId(option.id)}
              aria-pressed={sortId === option.id}
              className={`btn ${i > 0 ? '-ml-px' : ''} ${
                i === 0 ? 'rounded-r-none' : i === SORTS.length - 1 ? 'rounded-l-none' : 'rounded-none'
              } ${sortId === option.id ? 'btn-active' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {settlements.map((settlement) => (
          <PriorityCard key={settlement.id} settlement={settlement} />
        ))}
      </ul>

      <p className="mt-2 text-xs text-ink-soft">
        Score out of 100: population 35%, structure damage 25%, access difficulty 20%, critical
        infrastructure 15%, vulnerable residents 5%. The rank number always follows the priority
        score. Access, water supply and age figures come from field reports, not from the satellite
        analysis{USE_MOCK ? '; in demo mode they are illustrative' : ''}.
      </p>
    </section>
  )
}
