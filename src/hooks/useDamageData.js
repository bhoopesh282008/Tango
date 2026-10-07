import { useEffect } from 'react'
import {
  getBuildings,
  getFloodZones,
  getInfrastructure,
  getRoads,
  getSatellite,
} from '../services/damageService'
import { loadRuns } from '../config/run'
import { DataError } from '../services/guards'
import { getSettlements } from '../services/settlementsService'
import { useDataStore } from '../store/dataStore'
import { computeStats } from '../utils/calculations'

export const DATA_PARTS = {
  satelliteData: getSatellite,
  floodZones: getFloodZones,
  buildings: getBuildings,
  roads: getRoads,
  infrastructure: getInfrastructure,
  settlements: getSettlements,
}

export async function loadDamageData() {
  const { loading, setData, setError, markLoaded } = useDataStore.getState()
  if (loading) return
  useDataStore.setState({ loading: true, error: null, loadedParts: {} })
  try {
    // Which run to show has to be known before any of its files is asked for.
    useDataStore.setState(await loadRuns())
    const entries = await Promise.all(
      Object.entries(DATA_PARTS).map(async ([part, load]) => {
        const value = await load()
        markLoaded(part)
        return [part, value]
      }),
    )
    const data = Object.fromEntries(entries)
    setData(data, analyse(data))
  } catch (error) {
    setError(error.message || 'Could not load flood analysis data')
  }
}

// The figures are worked out here, once, not by every component that wants them. A record
// the analysis cannot read then fails the load, with a message and a retry, instead of
// throwing from inside whichever component asked first.
function analyse(data) {
  try {
    return computeStats(data)
  } catch (error) {
    throw new DataError(
      `The data was loaded but could not be analysed (${error.message}). The run may be incomplete, or written by a different version of the pipeline.`,
    )
  }
}

// Loads the dataset once and exposes it with the statistics derived from it.
export function useDamageData() {
  const data = useDataStore()

  useEffect(() => {
    if (!data.loaded && !data.error) loadDamageData()
  }, [data.loaded, data.error])

  return { data, stats: data.stats, loading: !data.loaded && !data.error, error: data.error, reload: loadDamageData }
}
