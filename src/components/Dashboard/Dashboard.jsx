import { useState } from 'react'
import { useDamageData } from '../../hooks/useDamageData'
import ErrorPage from '../../pages/ErrorPage'
import Spinner from '../Common/Spinner'
import FloodMap from '../Map/FloodMap'
import DamageAnalysis from './DamageAnalysis'
import SatelliteViewer from './SatelliteViewer'
import StatisticsCards from './StatisticsCards'

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
      <FloodMap data={data} />
      <DamageAnalysis stats={stats} />
    </div>
  )
}
