import { lazy, Suspense, useState } from 'react'
import { useDamageData } from '../../hooks/useDamageData'
import ErrorPage from '../../pages/ErrorPage'
import Spinner from '../Common/Spinner'
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
      <div className="flex justify-center py-24">
        <Spinner label="Loading satellite analysis" size={24} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      <SatelliteViewer
        before={data.satelliteData.before}
        after={data.satelliteData.after}
        comparisonValue={comparisonBlend}
        onComparisonChange={setComparisonBlend}
      />
      <StatisticsCards stats={stats} />
      <SettlementPriorityRanking stats={stats} />
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
      <DamageAnalysis stats={stats} />
    </div>
  )
}
