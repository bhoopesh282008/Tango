import { useEffect, useMemo } from 'react'
import {
  getBuildings,
  getFloodZones,
  getInfrastructure,
  getRoads,
  getSatellite,
} from '../services/damageService'
import { getSettlements } from '../services/settlementsService'
import { useDataStore } from '../store/dataStore'
import { computeStats } from '../utils/calculations'

export async function loadDamageData() {
  const { loading, setData, setError } = useDataStore.getState()
  if (loading) return
  useDataStore.setState({ loading: true, error: null })
  try {
    const [satelliteData, floodZones, buildings, roads, infrastructure, settlements] =
      await Promise.all([
        getSatellite(),
        getFloodZones(),
        getBuildings(),
        getRoads(),
        getInfrastructure(),
        getSettlements(),
      ])
    setData({ satelliteData, floodZones, buildings, roads, infrastructure, settlements })
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
