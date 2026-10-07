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
    <div className="lg:grid lg:h-[calc(100dvh-3.25rem)] lg:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)]" role="status" aria-label="Loading satellite analysis">
      <div className="space-y-5 border-line p-5 lg:border-r">
        <div className="skeleton h-24" />
        <div className="grid grid-cols-2 gap-5">
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
        </div>
        <div className="skeleton h-40" />
      </div>
      <div className="skeleton m-5 h-80 lg:m-0 lg:h-auto lg:rounded-none" />
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

  // One working surface. From the large breakpoint the figures and the rescue list are a column
  // beside the map, and the map fills the window under the header; the column scrolls on its
  // own. Below that the three stack as figures, map, list. (`contents` lets the column's two
  // parts be ordered around the map on a phone without a second copy of either.)
  return (
    <>
      {/* The page's title for screen readers; sighted readers get it from the header. */}
      <h1 className="sr-only">Flood damage dashboard{stats.areaName ? `: ${stats.areaName}` : ''}</h1>

      <div className="flex flex-col lg:grid lg:h-[calc(100dvh-3.25rem)] lg:min-h-[34rem] lg:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)]">
        <div className="contents lg:block lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:border-line">
          <div className="order-1">
            <Situation stats={stats} />
            <div className="px-5 pb-4">
              {stats.zones.length === 0 ? <NoFloodNotice imagery={stats.imagery} /> : <CoverageNotice validation={stats.validation} />}
            </div>
          </div>
          <div className="order-3">
            <SettlementPriorityRanking stats={stats} />
          </div>
        </div>

        <div className="order-2 h-[68dvh] min-h-[22rem] border-y border-line lg:h-auto lg:min-h-0 lg:border-y-0">
          <MapBoundary
            data={data}
            settlementRows={stats.settlementRows}
            priority={stats.priority}
            confidence={stats.meanConfidence}
          />
        </div>
      </div>

      <Evidence stats={stats}>
        <SatelliteViewer
          before={data.satelliteData.before}
          after={data.satelliteData.after}
          detail={data.satelliteData.detail}
          comparisonValue={comparisonBlend}
          onComparisonChange={setComparisonBlend}
        />
      </Evidence>
    </>
  )
}
