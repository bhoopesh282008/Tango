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
    elevation: false,
  },
  filters: DEFAULT_FILTERS,
  highlightedSettlement: null,
  measureMode: null, // 'distance' | 'area' | null
  measurePoints: [], // [lng, lat]

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
  setMeasureMode: (measureMode) => set({ measureMode, measurePoints: [] }),
  addMeasurePoint: (p) => set((state) => ({ measurePoints: [...state.measurePoints, p] })),
  clearMeasure: () => set({ measurePoints: [] }),
}))
