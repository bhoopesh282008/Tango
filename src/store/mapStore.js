import { create } from 'zustand'
import { MAP_DEFAULTS } from '../config/mapConfig'
import { DEFAULT_FILTERS } from '../utils/constants'

export const useMapStore = create((set) => ({
  zoom: MAP_DEFAULTS.zoom,
  center: MAP_DEFAULTS.center,
  baseMap: 'street',
  visibleLayers: {
    damage: true,
    buildings: true,
    roads: true,
    settlements: true,
    infrastructure: true,
    elevation: true,
  },
  filters: DEFAULT_FILTERS,
  highlightedSettlement: null,
  focus: null, // settlement the map should fly to
  measureMode: null, // 'distance' | 'area' | null
  measurePoints: [], // [lng, lat]
  pathMode: false, // flood-path tool: the next map click starts a trace
  floodPath: null, // { status } while working or failed, { line, lengthKm, settlements } when traced

  setView: (center, zoom) => set({ center, zoom }),
  setBaseMap: (baseMap) => set({ baseMap }),
  toggleLayer: (layerName) =>
    set((state) => ({
      visibleLayers: {
        ...state.visibleLayers,
        [layerName]: !state.visibleLayers[layerName],
      },
    })),
  setFilters: (filters) => set({ filters }),
  setHighlightedSettlement: (id) => set({ highlightedSettlement: id }),
  // A new object each time, so asking for the same settlement twice still moves the map.
  focusSettlement: (settlement) => set({ focus: { settlement } }),
  // The two map tools both take over clicks, so starting one stops the other.
  setMeasureMode: (measureMode) =>
    set((state) => ({ measureMode, measurePoints: [], pathMode: measureMode ? false : state.pathMode })),
  setPathMode: (pathMode) =>
    set((state) => ({
      pathMode,
      floodPath: null,
      measureMode: pathMode ? null : state.measureMode,
      measurePoints: pathMode ? [] : state.measurePoints,
    })),
  setFloodPath: (floodPath) => set({ floodPath }),
  addMeasurePoint: (p) => set((state) => ({ measurePoints: [...state.measurePoints, p] })),
  clearMeasure: () => set({ measurePoints: [] }),
}))
