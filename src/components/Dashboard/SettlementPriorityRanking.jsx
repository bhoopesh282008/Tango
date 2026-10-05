import { CircleAlert, CircleCheck, MapPin, Siren, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { USE_MOCK } from '../../config/apiConfig'
import { useMapStore } from '../../store/mapStore'
import { FACTOR_WEIGHTS, summarisePriority } from '../../utils/calculations'
import { ACCESS_LEVELS, PRIORITY_BANDS, PRIORITY_WEIGHTS } from '../../utils/constants'

const FACTOR_LABELS = {
  population: 'population',
  damage: 'structure damage',
  access: 'access difficulty',
  critical: 'critical infrastructure',
  vulnerable: 'vulnerable residents',
  buildings: 'settlement size in mapped buildings',
}

// Cards shown before "Show all"; a real run can have dozens of cut-off settlements.
const CARD_LIMIT = 8
import { formatNumber, formatPercent } from '../../utils/formatters'
import { WORDING } from '../../utils/wording'
import { MeterFill } from '../Common/Animated'

const SORTS = [
  { id: 'priority', label: 'Priority', compare: (a, b) => a.rank - b.rank },
  {
    id: 'population',
    label: 'Population',
    // Listed as "Buildings" and ordered by them when populations are not recorded
    buildingsLabel: 'Buildings',
    compare: (a, b) => (b.population ?? -1) - (a.population ?? -1) || b.total - a.total,
  },
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
    text: 'text-critical',
    chip: 'bg-critical text-critical-on',
  },
  high: {
    icon: TriangleAlert,
    border: 'border-l-danger',
    tint: 'bg-danger-soft',
    fill: 'bg-danger',
    text: 'text-danger',
    chip: 'bg-danger text-[#1a1a1a]',
  },
  medium: {
    icon: CircleAlert,
    border: 'border-l-warning',
    tint: 'bg-warning-soft',
    fill: 'bg-warning',
    text: 'text-warning',
    chip: 'bg-warning text-[#1a1a1a]',
  },
  low: {
    icon: CircleCheck,
    border: 'border-l-success',
    tint: 'bg-success-soft',
    fill: 'bg-success',
    text: 'text-success',
    chip: 'bg-success text-[#1a1a1a]',
  },
}

function RiskSummary({ priority, buildings }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
      {summarisePriority(priority).map((band) => (
        <li key={band.id} className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-[2px] ${BAND_STYLE[band.id].fill}`} aria-hidden />
          <span className="font-medium">
            <span className="num">{band.count}</span> {band.label}
          </span>
          <span className="text-ink-soft">
            {buildings ? `${formatNumber(band.buildings)} buildings` : `${formatNumber(band.people)} people`}
          </span>
        </li>
      ))}
    </ul>
  )
}

// One grid for the header and every row, so the columns line up. On phones a row is
// rank, name, score and the map button, with the rest on a second line.
const ROW =
  'grid grid-cols-[1.75rem_minmax(0,1fr)_auto_2.5rem] items-center gap-x-3 gap-y-1 px-4 lg:grid-cols-[1.75rem_minmax(0,1.3fr)_10rem_6.5rem_5.5rem_minmax(0,1.6fr)_2.5rem] lg:gap-x-4'

function PriorityRow({ settlement: s, buildings, hidden }) {
  const focusSettlement = useMapStore((state) => state.focusSettlement)
  const band = PRIORITY_BANDS.find((b) => b.id === s.band)
  const style = BAND_STYLE[s.band]
  const access = s.access_difficulty != null ? ACCESS_LEVELS[s.access_difficulty - 1] : null
  const notes = [
    access && `Access: ${access.label}`,
    s.healthPostUnreachable && 'Health post unreachable',
    s.bridgeDestroyed && WORDING.bridgeIssue,
    s.water_source_cut && 'Water supply cut',
  ].filter(Boolean)
  const size = buildings ? formatNumber(s.total) : s.population != null ? formatNumber(s.population) : 'No data'
  const sizeUnit = buildings ? 'buildings' : s.population != null ? 'people' : ''

  return (
    <li className={`${ROW} py-3 transition-colors duration-150 hover:bg-[var(--surface-2)] ${hidden ? 'hidden print:grid' : ''}`}>
      <span className="num text-sm text-ink-muted" aria-label={`Priority rank ${s.rank}`}>
        {s.rank}
      </span>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold leading-tight">{s.name}</h3>
        <p className={`mt-0.5 flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
          <style.icon size={12} aria-hidden /> {band.label}
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="num w-7 text-right text-base font-semibold leading-none">{s.priority}</span>
        <div
          className="h-1 w-16 overflow-hidden rounded-full bg-[var(--surface-2)] lg:w-auto lg:flex-1"
          role="meter"
          aria-label="Rescue priority score"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={s.priority}
        >
          <MeterFill fraction={s.priority / 100} className={style.fill} />
        </div>
      </div>
      <span className="num hidden text-sm lg:block">{size}</span>
      <span className="num hidden text-sm lg:block">{formatPercent(s.damageRatio)}</span>
      <span className="hidden min-w-0 text-xs leading-snug text-ink-soft lg:block">{notes.join(' · ')}</span>
      <button
        type="button"
        className="btn no-print w-10 px-0"
        onClick={() => focusSettlement(s)}
        aria-label={`Show ${s.name} on map`}
        title="Show on map"
      >
        <MapPin size={16} aria-hidden />
      </button>
      <p className="col-span-3 col-start-2 text-xs leading-snug text-ink-soft lg:hidden">
        {size} {sizeUnit} · {formatPercent(s.damageRatio)} damaged
        {notes.length > 0 && ` · ${notes.join(', ')}`}
      </p>
    </li>
  )
}

export default function SettlementPriorityRanking({ stats }) {
  const [sortId, setSortId] = useState('priority')
  const [showAll, setShowAll] = useState(false)
  const buildings = stats.sizeBasis === 'buildings'
  // Sorting by access is offered only when the data has access levels.
  const sorts = SORTS.filter((o) => o.id !== 'access' || stats.priority.some((p) => p.access_difficulty != null))
  const sort = SORTS.find((s) => s.id === sortId)
  const settlements = [...stats.priority].sort(sort.compare)

  if (settlements.length === 0) return null

  const used = settlements[0].factorsUsed
  const missing = Object.keys(PRIORITY_WEIGHTS).filter((f) => !used.includes(f))

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
          {sorts.map((option, i) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSortId(option.id)}
              aria-pressed={sortId === option.id}
              className={`btn ${i > 0 ? '-ml-px' : ''} ${
                i === 0 ? 'rounded-r-none' : i === sorts.length - 1 ? 'rounded-l-none' : 'rounded-none'
              } ${sortId === option.id ? 'btn-active' : ''}`}
            >
              {(buildings && option.buildingsLabel) || option.label}
            </button>
          ))}
        </div>
      </div>

      <RiskSummary priority={stats.priority} buildings={buildings} />

      <div className="card mt-3 overflow-hidden">
        <div className={`${ROW} hidden border-b border-line py-2 text-xs font-medium text-ink-muted lg:grid`} aria-hidden>
          <span>#</span>
          <span>Settlement</span>
          <span>Score</span>
          <span>{buildings ? 'Buildings' : 'People'}</span>
          <span>Damaged</span>
          <span>Notes</span>
          <span />
        </div>
        <ul className="divide-y divide-line">
          {settlements.map((settlement, i) => (
            <PriorityRow
              key={settlement.id}
              settlement={settlement}
              buildings={buildings}
              hidden={!showAll && i >= CARD_LIMIT}
            />
          ))}
        </ul>
      </div>
      {settlements.length > CARD_LIMIT && (
        <button type="button" className="btn no-print mt-3" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
          {showAll ? `Show first ${CARD_LIMIT}` : `Show all ${settlements.length}`}
        </button>
      )}

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
          {used.map((f) => `${FACTOR_LABELS[f]} ${Math.round(FACTOR_WEIGHTS[f] * 100)}%`).join(', ')},
          rescaled to add up to 100%. Not scored, because the data is missing for some or all
          settlements: {missing.map((f) => FACTOR_LABELS[f]).join(', ')}.
          A score built from fewer factors is a weaker guide; treat the order as provisional.
        </p>
      )}
    </section>
  )
}
