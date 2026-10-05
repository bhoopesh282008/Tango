import { useEffect, useMemo } from 'react'
import {
  getBuildings,
  getFloodZones,
  getInfrastructure,
  getRoads,
  getSatellite,
} from '../services/damageService'
import { loadRuns } from '../config/run'
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
    setData(Object.fromEntries(entries))
  } catch (error) {
    setError(error.message || 'Could not load flood analysis data')
  }
}

// Loads the dataset once and exposes it with the statistics derived from it.
export function useDamageData() {
  const data = useDataStore()

  useEffect(() => {
    if (!data.loaded && !data.error) loadDamageData()
  }, [data.loaded, data.error])

  const stats = useMemo(
    () => (data.loaded ? computeStats(data) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.loaded, data.floodZones, data.buildings, data.roads, data.settlements, data.infrastructure],
  )

  return { data, stats, loading: !data.loaded && !data.error, error: data.error, reload: loadDamageData }
}
