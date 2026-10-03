import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Bridge, Building2, ChevronDown, Droplets, Hospital, Route, Users, Zap } from 'lucide-react'
import { useState } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { USE_MOCK } from '../../config/apiConfig'
import { useUIStore } from '../../store/uiStore'
import { DAMAGE_TYPES } from '../../utils/constants'
import { formatNumber, formatPercent } from '../../utils/formatters'
import { WORDING } from '../../utils/wording'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const TONES = {
  blue: { border: 'border-l-primary', tint: 'bg-primary-soft', value: 'text-primary' },
  red: { border: 'border-l-critical', tint: 'bg-critical-soft', value: 'text-critical' },
  orange: { border: 'border-l-danger', tint: 'bg-danger-soft', value: 'text-danger' },
}

const CHART_ROWS = 10

// The three headline figures; each opens a breakdown.
function primaryCards(stats) {
  return [
    {
      id: 'area',
      label: 'Flooded area',
      value: formatNumber(stats.floodedAreaKm2, 1),
      unit: 'km²',
      // A pipeline run cannot tell open water from wet sediment on a valley floor.
      detail: `${formatNumber(stats.areaByType.water, 1)} km² ${USE_MOCK ? 'open water' : 'water or wet sediment'}`,
      icon: Droplets,
      tone: 'blue',
    },
    stats.sizeBasis === 'buildings'
      ? {
          // OpenStreetMap has no population for these settlements, so no head count is shown.
          id: 'population',
          label: 'Buildings in cut-off settlements',
          value: formatNumber(stats.buildingsInCutOff),
          unit: 'buildings',
          detail: `in ${stats.cutOff.length} settlements; population not recorded`,
          icon: Building2,
          tone: 'red',
        }
      : {
          id: 'population',
          label: 'Population affected',
          value: formatNumber(stats.populationAffected),
          unit: 'people',
          detail: `cut off in ${stats.cutOff.length} settlements`,
          icon: Users,
          tone: 'red',
        },
    {
      id: 'structures',
      label: 'Damaged structures',
      value: formatNumber(stats.damagedStructures),
      unit: 'structures',
      share: stats.totalStructures ? formatPercent(stats.damagedStructures / stats.totalStructures) : null,
      detail: `of ${formatNumber(stats.totalStructures)} mapped`,
      icon: Building2,
      tone: 'orange',
    },
  ]
}

function secondaryCards(stats) {
  const roads = {
    id: 'roads',
    label: WORDING.road,
    value: formatNumber(stats.damagedRoadKm, 1),
    unit: 'km',
    icon: Route,
    tone: 'orange',
  }
  // Without an infrastructure layer a zero would read as "none destroyed".
  if (!stats.infrastructureAssessed) return [roads]
  return [
    { id: 'bridges', label: WORDING.bridges, value: stats.bridgesDestroyed.length, icon: Bridge, tone: 'red' },
    {
      id: 'health',
      label: 'Health posts unreachable',
      value: stats.healthPostsUnreachable.length,
      icon: Hospital,
      tone: 'orange',
    },
    ...(stats.powerLinesAssessed
      ? [
          {
            id: 'power',
            label: 'Power lines down',
            value: formatNumber(stats.powerLineKmDown, 1),
            unit: 'km',
            icon: Zap,
            tone: 'orange',
          },
        ]
      : []),
    roads,
  ]
}

function barChart(labels, values, color, textColor, gridColor) {
  return (
    <Bar
      data={{ labels, datasets: [{ data: values, backgroundColor: color, borderRadius: 4 }] }}
      options={{
        indexAxis: 'y',
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { display: false } },
        },
      }}
    />
  )
}

function Breakdown({ id, stats }) {
  // Chart.js draws on canvas, so theme colours are passed in rather than inherited.
  const darkMode = useUIStore((s) => s.darkMode)
  const textColor = darkMode ? '#c0c0c0' : '#666666'
  const gridColor = darkMode ? '#2e2e48' : '#e0e0e0'
  const barColor = darkMode ? '#ff6b6b' : '#e03131'

  if (id === 'area') {
    const types = Object.keys(DAMAGE_TYPES)
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-52">
          <Doughnut
            data={{
              labels: types.map((t) => DAMAGE_TYPES[t].label),
              datasets: [
                {
                  data: types.map((t) => stats.areaByType[t]),
                  backgroundColor: types.map((t) => DAMAGE_TYPES[t].color),
                  borderWidth: 0,
                },
              ],
            }}
            options={{
              maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom', labels: { color: textColor } } },
            }}
          />
        </div>
        <ul className="self-center text-sm">
          {types.map((t) => (
            <li key={t} className="flex justify-between border-b border-line py-1.5 last:border-0">
              <span>{DAMAGE_TYPES[t].label}</span>
              <span className="font-semibold">{formatNumber(stats.areaByType[t], 1)} km²</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // A chart stays readable up to about ten bars; the rest are counted in the note.
  const top = (rows, value) => [...rows].sort((a, b) => value(b) - value(a)).slice(0, CHART_ROWS)
  const rest = (rows) => (rows.length > CHART_ROWS ? ` Largest ${CHART_ROWS} of ${rows.length} shown.` : '')

  if (id === 'structures') {
    const rows = top(stats.settlementRows, (r) => r.damaged)
    return (
      <div>
        <div className="h-72">
          {barChart(rows.map((r) => r.name), rows.map((r) => r.damaged), barColor, textColor, gridColor)}
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Damaged structures per settlement.{rest(stats.settlementRows)}
        </p>
      </div>
    )
  }

  const buildings = stats.sizeBasis === 'buildings'
  const size = (s) => (buildings ? s.total : s.population)
  const rows = top(stats.cutOff, size)
  return (
    <div>
      <div className="h-52">
        {barChart(rows.map((s) => s.name), rows.map(size), barColor, textColor, gridColor)}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        {buildings
          ? `Mapped buildings in the ${stats.cutOff.length} settlements with no road access. OpenStreetMap does not record their population, and not every building is a home.`
          : `Residents of the ${stats.cutOff.length} settlements with no road access.`}
        {rest(stats.cutOff)}
      </p>
    </div>
  )
}

export default function StatisticsCards({ stats }) {
  const [expanded, setExpanded] = useState(null)
  const primary = primaryCards(stats)
  const active = primary.find((c) => c.id === expanded)

  return (
    <section aria-label="Key statistics" className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {primary.map((card) => {
          const tone = TONES[card.tone]
          const isOpen = expanded === card.id
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setExpanded(isOpen ? null : card.id)}
              aria-expanded={isOpen}
              className={`flex items-start gap-3 rounded-xl border border-l-[5px] border-line p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md ${tone.border} ${tone.tint} ${
                isOpen ? 'ring-2 ring-primary' : ''
              }`}
            >
              <card.icon size={28} className={`mt-1 shrink-0 ${tone.value}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className={`text-3xl font-bold leading-tight ${tone.value}`}>{card.value}</span>
                  <span className="text-xs font-medium text-ink-soft">{card.unit}</span>
                  {card.share && (
                    <span className="rounded bg-surface px-1.5 py-0.5 text-xs font-semibold">{card.share}</span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs font-semibold uppercase tracking-wide text-ink">
                  {card.label}
                </span>
                <span className="mt-0.5 block text-xs text-ink-soft">{card.detail}</span>
              </span>
              <ChevronDown
                size={16}
                className={`no-print shrink-0 text-ink-soft transition ${isOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
          )
        })}
      </div>

      {active && (
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold">{active.label}: breakdown</h3>
          <Breakdown id={active.id} stats={stats} />
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {secondaryCards(stats).map((card) => {
          const tone = TONES[card.tone]
          return (
            <div
              key={card.id}
              className={`flex items-center gap-3 rounded-xl border border-l-[5px] border-line px-3 py-2.5 shadow-sm ${tone.border} ${tone.tint}`}
            >
              <card.icon size={22} className={`shrink-0 ${tone.value}`} aria-hidden />
              <div className="flex min-w-0 flex-col-reverse">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink">{card.label}</dt>
                <dd className="text-lg font-bold leading-tight">
                  <span className={tone.value}>{card.value}</span>
                  {card.unit && <span className="ml-1 text-xs font-medium text-ink-soft">{card.unit}</span>}
                </dd>
              </div>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
