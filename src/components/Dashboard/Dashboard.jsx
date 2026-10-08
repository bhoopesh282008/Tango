import { useState } from 'react'
import { useDamageData } from '../../hooks/useDamageData'
import ErrorPage from '../../pages/ErrorPage'
import MapBoundary from '../Map/MapBoundary'
import CoverageNotice from './CoverageNotice'
import Evidence from './Evidence'
import NoFloodNotice from './NoFloodNotice'
import SatelliteViewer from './SatelliteViewer'
import SettlementPriorityRanking from './SettlementPriorityRanking'
import Situation from './Situation'

// Same shape as the loaded page, so nothing jumps when the data arrives.
function Loading() {
  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.25rem)]" role="status" aria-label="Loading satellite analysis">
      <div className="grid grid-cols-2 gap-6 border-b border-line px-3 py-5 sm:px-5 md:grid-cols-4">
        <div className="skeleton h-20" />
        <div className="skeleton h-20" />
        <div className="skeleton h-20" />
        <div className="skeleton h-20" />
      </div>
      <div className="skeleton m-5 h-80 lg:m-0 lg:h-auto lg:flex-1 lg:rounded-none" />
      <span className="sr-only">Loading satellite analysis…</span>
    </div>
  )
}

export default function Dashboard() {
  const { data, stats, loading, error, reload } = useDamageData()
  const [comparisonBlend, setComparisonBlend] = useState(50)

  if (error) {
    return <ErrorPage title="Could not load flood data" message={error} onRetry={reload} />
  }
  if (loading) return <Loading />

  // The first screen is the answer and the map: four figures with the note on how far to trust
  // them, and under them the map filling what is left of the window. The ranked list of
  // settlements comes next, as a table the width of the page, then the evidence.
  return (
    <>
      {/* The page's title for screen readers; sighted readers get it from the header. */}
      <h1 className="sr-only">Flood damage dashboard{stats.areaName ? `: ${stats.areaName}` : ''}</h1>

      <div className="flex flex-col lg:h-[calc(100dvh-3.25rem)] lg:min-h-[38rem]">
        <Situation stats={stats}>
          {stats.zones.length === 0 ? <NoFloodNotice imagery={stats.imagery} /> : <CoverageNotice validation={stats.validation} nullTest={stats.nullTest} />}
        </Situation>

        <div className="h-[68dvh] min-h-[22rem] lg:h-auto lg:min-h-[22rem] lg:flex-1">
          <MapBoundary
            data={data}
            settlementRows={stats.settlementRows}
            priority={stats.priority}
            confidence={stats.meanConfidence}
          />
        </div>
      </div>

      <SettlementPriorityRanking stats={stats} />

      <Evidence stats={stats}>
        <SatelliteViewer
          before={data.satelliteData.before}
          after={data.satelliteData.after}
          detail={data.satelliteData.detail}
          outlines={data.satelliteData.outlines}
          comparisonValue={comparisonBlend}
          onComparisonChange={setComparisonBlend}
        />
      </Evidence>
    </>
  )
}
