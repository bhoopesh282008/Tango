import { API_BASE_URL } from '../config/apiConfig'

async function request(path, { params, ...init } = {}) {
  const query = params ? `?${new URLSearchParams(params)}` : ''
  const response = await fetch(`${API_BASE_URL}${path}${query}`, init)
  if (!response.ok) {
    throw new Error(`Request to ${path} failed (${response.status})`)
  }
  return response.json()
}

export const get = (path, params) => request(path, { params })

export const post = (path, body) =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

// Resolves demo data after a short delay so loading states are exercised.
export const mock = (value, ms = 250) =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms))
