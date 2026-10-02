// Demo dataset standing in for the flood-analysis backend.
// Everything here is illustrative: geometry is generated around approximate
// settlement locations in the Trishuli corridor, not taken from real imagery.
import {
  area,
  buffer,
  featureCollection,
  length,
  lineSliceAlong,
  lineString,
  point,
  pointToLineDistance,
  polygon,
} from '@turf/turf'
import settlementSeed from './settlements.json'

const KM = { units: 'kilometers' }
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d

export const satellite = {
  before: { url: null, date: '2026-08-23', sensor: 'Sentinel-1 GRD (VV)', resolution: '10 m', cloudCover: null },
  after: { url: null, date: '2026-08-28', sensor: 'Sentinel-1 GRD (VV)', resolution: '10 m', cloudCover: null },
}

// River centreline, north to south: [lng, lat]
const RIVER = [
  [85.378, 28.277],
  [85.372, 28.255],
  [85.362, 28.225],
  [85.352, 28.195],
  [85.34, 28.163],
  [85.326, 28.135],
  [85.31, 28.102],
  [85.285, 28.065],
  [85.26, 28.032],
  [85.22, 27.998],
  [85.188, 27.972],
  [85.16, 27.94],
]
const riverLine = lineString(RIVER)

// One zone per river reach (segment index into RIVER), radius in km.
const REACHES = [
  { name: 'Rasuwagadhi–Timure reach', name_np: 'रसुवागढी–टिमुरे खण्ड', type: 'water', confidence: 0.93, radius: 0.35 },
  { name: 'Timure–Lingling reach', name_np: 'टिमुरे–लिङलिङ खण्ड', type: 'water', confidence: 0.95, radius: 0.45 },
  { name: 'Lingling–Ghattekhola reach', name_np: 'लिङलिङ–घट्टेखोला खण्ड', type: 'debris', confidence: 0.81, radius: 0.4 },
  { name: 'Ghattekhola–Syabrubesi reach', name_np: 'घट्टेखोला–स्याफ्रुबेसी खण्ड', type: 'water', confidence: 0.91, radius: 0.5 },
  { name: 'Syabrubesi–Thulo Bharkhu reach', name_np: 'स्याफ्रुबेसी–ठूलो भार्खु खण्ड', type: 'water', confidence: 0.96, radius: 0.6 },
  { name: 'Thulo Bharkhu–Dhunche reach', name_np: 'ठूलो भार्खु–धुन्चे खण्ड', type: 'uncertain', confidence: 0.52, radius: 0.35 },
  { name: 'Dhunche–Ramche upper reach', name_np: 'धुन्चे–राम्चे माथिल्लो खण्ड', type: 'water', confidence: 0.88, radius: 0.4 },
  { name: 'Dhunche–Ramche lower reach', name_np: 'धुन्चे–राम्चे तल्लो खण्ड', type: 'debris', confidence: 0.74, radius: 0.35 },
  { name: 'Ramche–Kalikasthan reach', name_np: 'राम्चे–कालिकास्थान खण्ड', type: 'water', confidence: 0.9, radius: 0.45 },
  { name: 'Kalikasthan–Betrawati reach', name_np: 'कालिकास्थान–बेत्रावती खण्ड', type: 'water', confidence: 0.92, radius: 0.55 },
  { name: 'Betrawati downstream reach', name_np: 'बेत्रावती तल्लो खण्ड', type: 'uncertain', confidence: 0.46, radius: 0.4 },
]

// Off-channel deposits detected on the slopes.
const FANS = [
  { at: [85.39, 28.262], name: 'Timure landslide fan', name_np: 'टिमुरे पहिरो क्षेत्र', type: 'debris', confidence: 0.68, radius: 0.5 },
  { at: [85.334, 28.183], name: 'Ghattekhola debris fan', name_np: 'घट्टेखोला गेग्रान क्षेत्र', type: 'debris', confidence: 0.62, radius: 0.45 },
  { at: [85.298, 28.074], name: 'Dhunche south slope', name_np: 'धुन्चे दक्षिणी भिरालो', type: 'uncertain', confidence: 0.38, radius: 0.4 },
]

// Tuned once so the zone areas sum to the event's reported 42.3 km².
const BUFFER_SCALE = 0.9129

export function buildFloodZones(scale = BUFFER_SCALE) {
  const shapes = [
    ...REACHES.map((r, i) => ({ ...r, geom: lineString([RIVER[i], RIVER[i + 1]]) })),
    ...FANS.map((f) => ({ ...f, geom: point(f.at) })),
  ]
  return featureCollection(
    shapes.map(({ geom, radius, at, ...props }, i) => {
      const zone = buffer(geom, radius * scale, { ...KM, steps: 8 })
      zone.properties = {
        id: `z${String(i + 1).padStart(2, '0')}`,
        ...props,
        area_km2: round(area(zone) / 1e6),
      }
      return zone
    }),
  )
}

export const floodZones = buildFloodZones()

export const settlements = settlementSeed.map(
  ({ structures_total, structures_damaged, ...s }) => s,
)

// Deterministic PRNG so the generated footprints are identical on every load.
function mulberry32(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildBuildings() {
  const rand = mulberry32(20260828)
  const features = []
  for (const s of settlementSeed) {
    const candidates = []
    for (let i = 0; i < s.structures_total; i++) {
      const r = 0.45 * Math.sqrt(rand())
      const theta = rand() * 2 * Math.PI
      const lat = s.lat + (r * Math.cos(theta)) / 111
      const lng = s.lng + (r * Math.sin(theta)) / 98
      const h = 0.00004 + rand() * 0.00004
      candidates.push({ lat, lng, h, toRiver: pointToLineDistance(point([lng, lat]), riverLine, KM) })
    }
    // Structures closest to the channel are the ones flagged as damaged.
    candidates.sort((a, b) => a.toRiver - b.toRiver)
    candidates.forEach(({ lat, lng, h }, i) => {
      features.push(
        polygon(
          [[
            [lng - h, lat - h],
            [lng + h, lat - h],
            [lng + h, lat + h],
            [lng - h, lat + h],
            [lng - h, lat - h],
          ]],
          { id: `b-${s.id}-${i}`, settlement_id: s.id, damaged: i < s.structures_damaged },
        ),
      )
    })
  }
  return featureCollection(features)
}

export const buildings = buildBuildings()

// Highway following the valley through every settlement, north to south.
// Breaks are given as [startKm, endKm] measured from Rasuwagadhi.
const ROAD_BREAKS = [
  [1.0, 2.4],
  [6.8, 8.9],
  [10.5, 12.0],
  [14.6, 15.8],
]

function buildRoads() {
  const highway = lineString(settlementSeed.map((s) => [s.lng, s.lat]))
  const total = length(highway, KM)
  const cuts = [0, ...ROAD_BREAKS.flat(), total]
  const features = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const [from, to] = [cuts[i], cuts[i + 1]]
    const section = lineSliceAlong(highway, from, to, KM)
    const label = `${from.toFixed(1)}–${to.toFixed(1)}`
    section.properties = {
      id: `r${i + 1}`,
      name: `Pasang Lhamu Highway km ${label}`,
      name_np: `पासाङ ल्हामु राजमार्ग कि.मी. ${label}`,
      damaged: i % 2 === 1,
      length_km: round(length(section, KM)),
    }
    features.push(section)
  }
  return featureCollection(features)
}

export const roads = buildRoads()

export const infrastructure = [
  { id: 'i01', type: 'bridge', name: 'Miteri (Friendship) Bridge, Rasuwagadhi', name_np: 'मितेरी पुल, रसुवागढी', lat: 28.2775, lng: 85.3785, status: 'destroyed' },
  { id: 'i02', type: 'bridge', name: 'Ghattekhola Bridge', name_np: 'घट्टेखोला पुल', lat: 28.196, lng: 85.353, status: 'destroyed' },
  { id: 'i03', type: 'bridge', name: 'Syabrubesi Bridge', name_np: 'स्याफ्रुबेसी पुल', lat: 28.16, lng: 85.341, status: 'destroyed' },
  { id: 'i04', type: 'bridge', name: 'Betrawati Bridge', name_np: 'बेत्रावती पुल', lat: 27.974, lng: 85.186, status: 'operational' },
  { id: 'i05', type: 'health_post', name: 'Timure Health Post', name_np: 'टिमुरे स्वास्थ्य चौकी', lat: 28.254, lng: 85.371, status: 'unreachable' },
  { id: 'i06', type: 'health_post', name: 'Syabrubesi Health Post', name_np: 'स्याफ्रुबेसी स्वास्थ्य चौकी', lat: 28.164, lng: 85.339, status: 'unreachable' },
  { id: 'i07', type: 'health_post', name: 'Rasuwa District Hospital, Dhunche', name_np: 'रसुवा जिल्ला अस्पताल, धुन्चे', lat: 28.109, lng: 85.298, status: 'operational' },
  { id: 'i08', type: 'power_line', name: '33 kV line, Timure–Lingling', name_np: '३३ के.भी. लाइन, टिमुरे–लिङलिङ', lat: 28.24, lng: 85.367, status: 'down', length_km: 2.6 },
  { id: 'i09', type: 'power_line', name: '11 kV feeder, Ghattekhola–Syabrubesi', name_np: '११ के.भी. फिडर, घट्टेखोला–स्याफ्रुबेसी', lat: 28.18, lng: 85.346, status: 'down', length_km: 1.5 },
]
