import { lazy, Suspense, useState } from 'react'
import { useDamageData } from '../../hooks/useDamageData'
import ErrorPage from '../../pages/ErrorPage'
import Reveal from '../Common/Reveal'
import Spinner from '../Common/Spinner'
import CoverageNotice from './CoverageNotice'
import DamageAnalysis from './DamageAnalysis'
import SatelliteViewer from './SatelliteViewer'
import SettlementPriorityRanking from './SettlementPriorityRanking'
import StatisticsCards from './StatisticsCards'

// The map library is the largest dependency, so it loads after the figures are on screen.
const FloodMap = lazy(() => import('../Map/FloodMap'))

export default function Dashboard() {
  const { data, stats, loading, error, reload } = useDamageData()
  const [comparisonBlend, setComparisonBlend] = useState(50)

  if (error) {
    return <ErrorPage title="Could not load flood data" message={error} onRetry={reload} />
  }
  if (loading) {
    return (
      <div className="flex flex-col gap-4 pb-20" role="status" aria-label="Loading satellite analysis">
        <div className="skeleton h-64 sm:h-80" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
        <div className="skeleton h-40" />
        <span className="sr-only">Loading satellite analysis…</span>
      </div>
    )
  }

  // The order follows what a reader needs first: how much (and how far to trust it), where,
  // who to reach first, then the pictures the map was made from. The figures used to sit
  // below a 560 px satellite picture, out of sight on a laptop screen.
  return (
    <div className="flex flex-col gap-4 pb-20">
      {/* The page's title for screen readers; sighted readers get it from the header. */}
      <h1 className="sr-only">Flood damage dashboard{stats.areaName ? `: ${stats.areaName}` : ''}</h1>
      <CoverageNotice validation={stats.validation} />
      <Reveal>
        <StatisticsCards stats={stats} />
      </Reveal>
      <Suspense
        fallback={
          <div className="card flex h-[60vh] min-h-[360px] items-center justify-center lg:h-[560px]">
            <Spinner label="Loading map" />
          </div>
        }
      >
        <FloodMap
          data={data}
          settlementRows={stats.settlementRows}
          priority={stats.priority}
          confidence={stats.meanConfidence}
        />
      </Suspense>
      <Reveal>
        <SettlementPriorityRanking stats={stats} />
      </Reveal>
      <Reveal>
        <SatelliteViewer
          before={data.satelliteData.before}
          after={data.satelliteData.after}
          detail={data.satelliteData.detail}
          comparisonValue={comparisonBlend}
          onComparisonChange={setComparisonBlend}
        />
      </Reveal>
      <Reveal>
        <DamageAnalysis stats={stats} />
      </Reveal>
    </div>
  )
}
