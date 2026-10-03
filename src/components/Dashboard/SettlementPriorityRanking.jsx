import { CircleAlert, CircleCheck, MapPin, Siren, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { USE_MOCK } from '../../config/apiConfig'
import { useMapStore } from '../../store/mapStore'
import { summarisePriority } from '../../utils/calculations'
import { ACCESS_LEVELS, PRIORITY_BANDS, PRIORITY_WEIGHTS } from '../../utils/constants'

const FACTOR_LABELS = {
  population: 'population',
  damage: 'structure damage',
  access: 'access difficulty',
  critical: 'critical infrastructure',
  vulnerable: 'vulnerable residents',
}
import { formatNumber, formatPercent } from '../../utils/formatters'

const SORTS = [
  { id: 'priority', label: 'Priority', compare: (a, b) => a.rank - b.rank },
  { id: 'population', label: 'Population', compare: (a, b) => (b.population ?? -1) - (a.population ?? -1) },
  { id: 'damage', label: 'Damage', compare: (a, b) => b.damageRatio - a.damageRatio },
  {
    id: 'access',
    label: 'Access',
    compare: (a, b) => (b.access_difficulty ?? 0) - (a.access_difficulty ?? 0) || a.rank - b.rank,
  },
]

// Each band is told apart by icon and label as well as colour.
// Orange, yellow and green carry dark text; they are too light for white.
const BAND_STYLE = {
  critical: {
    icon: Siren,
    border: 'border-l-critical',
    tint: 'bg-critical-soft',
    fill: 'bg-critical',
    chip: 'bg-critical text-critical-on',
  },
  high: {
    icon: TriangleAlert,
    border: 'border-l-danger',
    tint: 'bg-danger-soft',
    fill: 'bg-danger',
    chip: 'bg-danger text-[#1a1a1a]',
  },
  medium: {
    icon: CircleAlert,
    border: 'border-l-warning',
    tint: 'bg-warning-soft',
    fill: 'bg-warning',
    chip: 'bg-warning text-[#1a1a1a]',
  },
  low: {
    icon: CircleCheck,
    border: 'border-l-success',
    tint: 'bg-success-soft',
    fill: 'bg-success',
    chip: 'bg-success text-[#1a1a1a]',
  },
}

function RiskSummary({ priority }) {
  return (
    <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {summarisePriority(priority).map((band) => {
        const style = BAND_STYLE[band.id]
        return (
          <li
            key={band.id}
            className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 ${style.border} ${style.tint}`}
          >
            <style.icon size={22} className="shrink-0 text-ink" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                {band.count} {band.label}
              </span>
              <span className="block text-xs text-ink-soft">
                {band.peopleUnknown === band.count
                  ? 'population not recorded'
                  : `${formatNumber(band.people)} people` +
                    (band.peopleUnknown ? `, ${band.peopleUnknown} not recorded` : '')}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Metric({ label, children }) {
  return (
    // Value above its label visually; label first in the markup, as a definition list needs.
    <div className="flex min-w-0 flex-col-reverse px-1 text-center">
      <dt className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="text-sm font-bold leading-tight text-ink">{children}</dd>
    </div>
  )
}

function PriorityCard({ settlement: s }) {
  const focusSettlement = useMapStore((state) => state.focusSettlement)
  const band = PRIORITY_BANDS.find((b) => b.id === s.band)
  const style = BAND_STYLE[s.band]
  const access = s.access_difficulty != null ? ACCESS_LEVELS[s.access_difficulty - 1] : null
  const issues = [
    s.healthPostUnreachable && 'Health post unreachable',
    s.bridgeDestroyed && 'Bridge destroyed',
    s.water_source_cut && 'Water supply cut',
  ].filter(Boolean)

  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border border-l-[6px] border-line p-4 shadow-sm ${style.border} ${style.tint}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${style.chip}`}
          aria-label={`Priority rank ${s.rank}`}
        >
          #{s.rank}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold leading-tight">{s.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide">
            <style.icon size={13} aria-hidden /> {band.label}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold leading-none">{s.priority}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-soft">of 100</div>
        </div>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface"
        role="meter"
        aria-label="Rescue priority score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={s.priority}
      >
        <div className={`h-full rounded-full ${style.fill}`} style={{ width: `${s.priority}%` }} />
      </div>

      <dl className="grid grid-cols-3 divide-x divide-line border-y border-line py-2">
        <Metric label="People">{s.population != null ? formatNumber(s.population) : 'No data'}</Metric>
        <Metric label="Damaged">{formatPercent(s.damageRatio)}</Metric>
        <Metric label="Access">{access?.label ?? 'No data'}</Metric>
      </dl>

      {issues.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Critical infrastructure issues">
          {issues.map((issue) => (
            <li key={issue} className="rounded bg-surface px-2 py-1 text-xs font-medium">
              {issue}
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="btn no-print mt-auto w-full" onClick={() => focusSettlement(s)}>
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

  const used = settlements[0].factorsUsed
  const missing = Object.keys(FACTOR_LABELS).filter((f) => !used.includes(f))

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

      <RiskSummary priority={stats.priority} />

      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {settlements.map((settlement) => (
          <PriorityCard key={settlement.id} settlement={settlement} />
        ))}
      </ul>

      {missing.length === 0 ? (
        <p className="mt-2 text-xs text-ink-soft">
          Score out of 100: population 35%, structure damage 25%, access difficulty 20%, critical
          infrastructure 15%, vulnerable residents 5%. The rank number always follows the priority
          score. Access, water supply and age figures come from field reports, not from the
          satellite analysis{USE_MOCK ? '; in demo mode they are illustrative' : ''}.
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-soft">
          Score out of 100, from the factors recorded for every settlement:{' '}
          {used.map((f) => `${FACTOR_LABELS[f]} ${Math.round(PRIORITY_WEIGHTS[f] * 100)}%`).join(', ')},
          rescaled to add up to 100%. Not scored, because the data is missing for some or all
          settlements: {missing.map((f) => FACTOR_LABELS[f]).join(', ')}.
          A score built from fewer factors is a weaker guide; treat the order as provisional.
        </p>
      )}
    </section>
  )
}
