import { featureCollection, point } from '@turf/turf'

export function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const csvCell = (value) => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// Leading BOM so Excel reads the Nepali names as UTF-8.
const toCsv = (rows) => `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`

export function settlementsCsv(stats) {
  return toCsv([
    ['id', 'name', 'name_np', 'lat', 'lng', 'population', 'road_access', 'structures_total', 'structures_damaged'],
    ...stats.settlementRows.map((s) => [
      s.id, s.name, s.name_np, s.lat, s.lng, s.population,
      s.connected ? 'connected' : 'cut off', s.total, s.damaged,
    ]),
  ])
}

export function statisticsCsv(stats) {
  return toCsv([
    ['metric', 'value', 'unit'],
    ['Flooded area', stats.floodedAreaKm2, 'km2'],
    ['Flooded area: water', stats.areaByType.water, 'km2'],
    ['Flooded area: debris', stats.areaByType.debris, 'km2'],
    ['Flooded area: uncertain', stats.areaByType.uncertain, 'km2'],
    ['Damaged structures', stats.damagedStructures, 'count'],
    ['Mapped structures', stats.totalStructures, 'count'],
    ['Road destroyed', stats.damagedRoadKm, 'km'],
    ['Population in cut-off settlements', stats.populationAffected, 'people'],
    ['Settlements cut off', stats.cutOff.length, 'count'],
    ['Bridges destroyed', stats.bridgesDestroyed.length, 'count'],
    ['Health posts unreachable', stats.healthPostsUnreachable.length, 'count'],
    ['Power lines down', stats.powerLineKmDown, 'km'],
  ])
}

const tagged = (collection, layer) =>
  collection.features.map((f) => ({ ...f, properties: { layer, ...f.properties } }))

export function combinedGeoJson({ floodZones, buildings, roads, settlements, infrastructure }) {
  return JSON.stringify(
    featureCollection([
      ...tagged(floodZones, 'flood_zone'),
      ...tagged(roads, 'road'),
      ...tagged(buildings, 'building'),
      ...settlements.map(({ lat, lng, ...props }) => point([lng, lat], { layer: 'settlement', ...props })),
      ...infrastructure.map(({ lat, lng, ...props }) => point([lng, lat], { layer: 'infrastructure', ...props })),
    ]),
  )
}
