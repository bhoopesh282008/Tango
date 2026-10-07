import { create } from 'zustand'

export const useDataStore = create((set) => ({
  satelliteData: { before: null, after: null },
  // Published pipeline runs, and the one on screen (see config/run.js)
  runs: [],
  run: null,
  floodZones: null,
  buildings: null,
  roads: null,
  settlements: [],
  infrastructure: [],
  // Every figure derived from the layers above, worked out once when they arrive
  stats: null,
  loaded: false,
  // Which datasets have arrived so far, for the splash screen's progress
  loadedParts: {},
  loading: false,
  error: null,

  setData: (data, stats) => set({ ...data, stats, loaded: true, loading: false, error: null }),
  markLoaded: (part) => set((state) => ({ loadedParts: { ...state.loadedParts, [part]: true } })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}))
