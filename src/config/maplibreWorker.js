// MapLibre 6 loads its worker from a separate file; let Vite bundle it and hand over the URL.
// Import this module once from anything that renders a map.
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(workerUrl)
