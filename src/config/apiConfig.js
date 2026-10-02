export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

// With no backend configured the services answer from src/data.
export const USE_MOCK = !API_BASE_URL

export const ENDPOINTS = {
  satelliteBefore: '/satellite/before',
  satelliteAfter: '/satellite/after',
  damageAnalysis: '/damage-analysis',
  infrastructure: '/infrastructure',
  settlements: '/settlements',
  buildings: '/buildings',
  roads: '/roads',
  copilotAsk: '/copilot/ask',
}
