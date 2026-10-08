import { create } from 'zustand'

// The route being planned or followed. Places are { lng, lat, label, key?, source }: `key` is set
// when the place is a settlement or health post from the data, `source` is 'gps' for the device.
export const useRouteStore = create((set) => ({
  from: null,
  to: null,
  // which point the next map tap sets: 'from' | 'to' | null
  pick: null,
  // 'avoid' keeps off every flagged road section; 'fastest' goes the shortest way regardless
  preference: 'avoid',
  // only changes the time estimate
  travel: 'vehicle',
  // { fastest, avoid, avoidBlocked } or { error } from planRoutes, or null
  plan: null,

  // live navigation
  navigating: false,
  // 'idle' | 'waiting' | 'tracking' | 'denied' | 'unavailable' | 'timeout'
  gps: 'idle',
  gpsMessage: null,
  fix: null,
  following: true,

  setFrom: (from) => set({ from }),
  setTo: (to) => set({ to }),
  swap: () => set((s) => ({ from: s.to, to: s.from })),
  setPick: (pick) => set({ pick }),
  setPreference: (preference) => set({ preference }),
  setTravel: (travel) => set({ travel }),
  setPlan: (plan) => set({ plan }),
  setFix: (fix) => set({ fix, gps: 'tracking', gpsMessage: null }),
  setGps: (gps, gpsMessage = null) => set({ gps, gpsMessage }),
  setFollowing: (following) => set({ following }),
  startNavigation: () => set({ navigating: true, following: true, gps: 'waiting', gpsMessage: null, fix: null }),
  stopNavigation: () => set({ navigating: false, gps: 'idle', gpsMessage: null, fix: null }),
  clearRoute: () => set({ from: null, to: null, plan: null, pick: null, navigating: false, gps: 'idle', gpsMessage: null, fix: null }),
}))

// The route the screen is showing: the one that avoids flooding, or the fastest, as chosen.
export const activeRoute = (plan, preference) => (plan && !plan.error ? (preference === 'avoid' ? plan.avoid : plan.fastest) : null) ?? null
