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

  return (
    <div className="flex flex-col gap-4 pb-20">
      <Reveal>
        <SatelliteViewer
          before={data.satelliteData.before}
          after={data.satelliteData.after}
          comparisonValue={comparisonBlend}
          onComparisonChange={setComparisonBlend}
        />
      </Reveal>
      <CoverageNotice validation={stats.validation} />
      <Reveal order={2}>
        <StatisticsCards stats={stats} />
      </Reveal>
      <Reveal order={3}>
        <SettlementPriorityRanking stats={stats} />
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
        <DamageAnalysis stats={stats} />
      </Reveal>
    </div>
  )
}
