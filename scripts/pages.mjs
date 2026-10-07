// The decisions behind scripts/deploy-pages.mjs, kept apart from the git and npm calls so they
// can be tested without publishing anything.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// What a published run must contain to be shown (PIPELINE_FILES in src/config/apiConfig.js)
export const RUN_FILES = [
  'satellite.json',
  'flood_zones.geojson',
  'buildings.geojson',
  'roads.geojson',
  'infrastructure.json',
  'settlements.json',
]

// 'https://github.com/owner/Repo.git', 'git@github.com:owner/Repo.git' and the same without
// '.git' all name { owner: 'owner', repo: 'Repo' }.
export function parseRemote(url) {
  const match = /github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url).trim())
  if (!match) throw new Error(`"${url}" is not a GitHub remote, so the Pages address cannot be worked out.`)
  return { owner: match[1], repo: match[2] }
}

// A project is served under /<repo>/; a repository named <owner>.github.io is the owner's own
// site and is served from the root. `base` is what the app is built for, `dataUrl` where its
// run data ends up.
export function pagesTarget({ owner, repo }) {
  const userSite = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`
  const base = userSite ? '/' : `/${repo}/`
  return {
    base,
    dataUrl: `${base}data`,
    url: `https://${owner.toLowerCase()}.github.io${base}`,
  }
}

// The runs listed in <dataDir>/runs.json, and what is wrong with them. A deploy with a run that
// is missing a file would publish a dashboard that fails to load that area.
export function checkRuns(dataDir) {
  const listFile = join(dataDir, 'runs.json')
  if (!existsSync(listFile)) {
    return { runs: [], problems: [`${listFile} not found. Publish a run first (python run.py ... --publish).`] }
  }
  let list
  try {
    list = JSON.parse(readFileSync(listFile, 'utf-8'))
  } catch (error) {
    return { runs: [], problems: [`runs.json is not valid JSON (${error.message}).`] }
  }
  if (!Array.isArray(list) || list.length === 0) return { runs: [], problems: ['runs.json lists no runs.'] }

  const problems = []
  for (const run of list) {
    const missing = RUN_FILES.filter((file) => !existsSync(join(dataDir, run.id, file)))
    if (missing.length) problems.push(`${run.name ?? run.id}: missing ${missing.join(', ')}.`)
  }
  return { runs: list, problems }
}

// Bytes in a folder, all levels
export function folderSize(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const path = join(dir, entry.name)
    return total + (entry.isDirectory() ? folderSize(path) : statSync(path).size)
  }, 0)
}

export const megabytes = (bytes) => (bytes / 1048576).toFixed(1)

// GitHub Pages sites are limited to 1 GB; this warns well before that.
export const SIZE_WARNING_MB = 500
