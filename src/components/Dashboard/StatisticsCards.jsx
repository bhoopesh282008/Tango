import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Building2, ChevronDown, Droplets, Route, Users } from 'lucide-react'
import { useState } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { useUIStore } from '../../store/uiStore'
import { DAMAGE_TYPES } from '../../utils/constants'
import { formatNumber } from '../../utils/formatters'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const TONES = {
  blue: { icon: 'bg-primary-soft text-primary', value: 'text-primary' },
  red: { icon: 'bg-critical-soft text-critical', value: 'text-critical' },
  orange: { icon: 'bg-danger-soft text-danger', value: 'text-danger' },
}

function buildCards(stats) {
  return [
    {
      id: 'area',
      label: 'Flooded area',
      value: formatNumber(stats.floodedAreaKm2, 1),
      unit: 'km²',
      icon: Droplets,
      tone: 'blue',
    },
    {
      id: 'structures',
      label: 'Damaged structures',
      value: formatNumber(stats.damagedStructures),
      unit: `of ${formatNumber(stats.totalStructures)} mapped`,
      icon: Building2,
      tone: 'red',
    },
    {
      id: 'roads',
      label: 'Road damage',
      value: formatNumber(stats.damagedRoadKm, 1),
      unit: 'km destroyed',
      icon: Route,
      tone: 'orange',
    },
    {
      id: 'population',
      label: 'Population affected',
      value: formatNumber(stats.populationAffected),
      unit: 'people cut off',
      icon: Users,
      tone: 'red',
    },
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
  const textColor = darkMode ? '#cccccc' : '#666666'
  const gridColor = darkMode ? '#3d3d3d' : '#e0e0e0'

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

  if (id === 'structures') {
    const rows = [...stats.settlementRows].sort((a, b) => b.damaged - a.damaged)
    return (
      <div className="h-72">
        {barChart(rows.map((r) => r.name), rows.map((r) => r.damaged), '#e03131', textColor, gridColor)}
      </div>
    )
  }

  if (id === 'roads') {
    return (
      <ul className="text-sm">
        {stats.damagedRoads.map((r) => (
          <li key={r.id} className="flex justify-between gap-3 border-b border-line py-1.5 last:border-0">
            <span>{r.name}</span>
            <span className="shrink-0 font-semibold">{formatNumber(r.length_km, 1)} km</span>
          </li>
        ))}
        <li className="pt-2 text-xs text-ink-soft">
          {formatNumber(stats.damagedRoadKm, 1)} km destroyed of {formatNumber(stats.totalRoadKm, 1)} km
          mapped.
        </li>
      </ul>
    )
  }

  return (
    <div>
      <div className="h-52">
        {barChart(
          stats.cutOff.map((s) => s.name),
          stats.cutOff.map((s) => s.population),
          '#e03131',
          textColor,
          gridColor,
        )}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        Residents of the {stats.cutOff.length} settlements with no road access.
      </p>
    </div>
  )
}

export default function StatisticsCards({ stats }) {
  const [expanded, setExpanded] = useState(null)
  const cards = buildCards(stats)
  const active = cards.find((c) => c.id === expanded)

  return (
    <section aria-label="Key statistics">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => {
          const tone = TONES[card.tone]
          const isOpen = expanded === card.id
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setExpanded(isOpen ? null : card.id)}
              aria-expanded={isOpen}
              className={`card p-3 text-left transition duration-150 hover:-translate-y-0.5 hover:shadow-md sm:p-4 ${
                isOpen ? 'ring-2 ring-primary' : ''
              }`}
            >
              <span className="flex items-center justify-between">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone.icon}`}>
                  <card.icon size={20} aria-hidden />
                </span>
                <ChevronDown
                  size={16}
                  className={`no-print text-ink-soft transition ${isOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </span>
              <span className={`mt-2 block text-2xl font-bold leading-tight sm:text-3xl ${tone.value}`}>
                {card.value}
              </span>
              <span className="block text-xs text-ink-soft">{card.unit}</span>
              <span className="mt-1 block text-sm font-medium text-ink">{card.label}</span>
            </button>
          )
        })}
      </div>

      {active && (
        <div className="card mt-3 p-4">
          <h3 className="mb-3 text-sm font-semibold">{active.label}: breakdown</h3>
          <Breakdown id={active.id} stats={stats} />
        </div>
      )}
    </section>
  )
}
