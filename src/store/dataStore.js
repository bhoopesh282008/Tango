import { create } from 'zustand'

export const useDataStore = create((set) => ({
  satelliteData: { before: null, after: null },
  floodZones: null,
  buildings: null,
  roads: null,
  settlements: [],
  infrastructure: [],
  loaded: false,
  loading: false,
  error: null,

  setData: (data) => set({ ...data, loaded: true, loading: false, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}))
