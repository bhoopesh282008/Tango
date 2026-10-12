import { useCallback, useRef, useState } from 'react'

// Failed tile requests from one source, with none arriving from it in between, before the map says so
export const TILE_FAILURES_BEFORE_NOTICE = 4

// A tile that came over the network. The run's own layers are GeoJSON handed to the map, which
// never fail this way; they are left out so that they cannot hide a basemap that is not answering.
const isNetworkTile = (event) => !!event?.tile && event.target?.getSource?.(event.sourceId)?.type !== 'geojson'

// A tile server that is busy, blocked or offline fails quietly: the basemap stays blank and the
// page looks broken. MapLibre raises an error event, carrying the tile and the source, for each
// failed request (it leaves out 404s, which are normal) and a data event for each tile that
// arrives. Several failures from one source with nothing arriving from it between them mean its
// server is not answering. Counted per source: the street labels keep arriving from their own
// server while the imagery fails, and must not hide it.
export function useTileHealth() {
  const failures = useRef(new Map()) // source id -> failed requests since a tile last arrived
  const dismissed = useRef(false)
  const [failing, setFailing] = useState(false)

  const onError = useCallback((event) => {
    if (!isNetworkTile(event)) return
    const id = event.sourceId ?? ''
    const count = (failures.current.get(id) ?? 0) + 1
    failures.current.set(id, count)
    if (count >= TILE_FAILURES_BEFORE_NOTICE && !dismissed.current) setFailing(true)
  }, [])

  const onData = useCallback((event) => {
    if (!isNetworkTile(event)) return
    const id = event.sourceId ?? ''
    if (!failures.current.delete(id)) return
    // The notice stays while any other source is still failing
    const stillFailing = [...failures.current.values()].some((count) => count >= TILE_FAILURES_BEFORE_NOTICE)
    if (!stillFailing) setFailing(false)
  }, [])

  // The person has read it: keep it off until the basemap changes
  const dismiss = useCallback(() => {
    dismissed.current = true
    setFailing(false)
  }, [])

  // A different basemap starts afresh
  const reset = useCallback(() => {
    failures.current.clear()
    dismissed.current = false
    setFailing(false)
  }, [])

  return { failing, onError, onData, dismiss, reset }
}
