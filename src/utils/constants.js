export const EVENT = {
  name: 'Trishuli Flood',
  location: 'Trishuli corridor, Rasuwa, Nepal',
  beforeDate: '2026-08-23',
  afterDate: '2026-08-28',
}

export const DAMAGE_TYPES = {
  water: { label: 'Water', label_np: 'पानी', color: '#1e90ff', hint: 'Open water detected with high confidence' },
  debris: { label: 'Debris', label_np: 'गेग्रान', color: '#ff6b35', hint: 'Sediment, landslide or debris deposit' },
  uncertain: { label: 'Uncertain', label_np: 'अनिश्चित', color: '#ffd700', hint: 'Change detected, needs verification' },
}

// Zone size classes by area in km²
export const SIZE_CLASSES = [
  { id: 'all', label: 'All sizes' },
  { id: 'large', label: 'Large (≥ 4.5 km²)' },
  { id: 'medium', label: 'Medium (2–4.5 km²)' },
  { id: 'small', label: 'Small (< 2 km²)' },
]
export const SIZE_LIMITS = { small: 2, large: 4.5 }

export const DEFAULT_FILTERS = {
  confidence: 50,
  types: { water: true, debris: true, uncertain: true },
  size: 'all',
}

export const MAP_LAYERS = [
  { id: 'damage', label: 'Damage overlay' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'roads', label: 'Roads' },
  { id: 'settlements', label: 'Settlements' },
  { id: 'infrastructure', label: 'Bridges, health posts, power' },
  { id: 'elevation', label: 'Terrain shading' },
]

export const INFRA_TYPES = {
  bridge: { label: 'Bridge', letter: 'B' },
  health_post: { label: 'Health post', letter: 'H' },
  power_line: { label: 'Power line', letter: 'P' },
}

// access_difficulty 1-5 as reported from the field
export const ACCESS_LEVELS = [
  { label: 'Vehicle track', label_np: 'सवारी बाटो' },
  { label: '4WD only', label_np: 'फोर-ह्विल सवारी मात्र' },
  { label: 'On foot', label_np: 'पैदल' },
  { label: 'On foot or helicopter', label_np: 'पैदल वा हेलिकप्टर' },
  { label: 'Helicopter only', label_np: 'हेलिकप्टर मात्र' },
]

// Rescue priority score bands, highest first: a score above `above` falls in the band.
export const PRIORITY_BANDS = [
  { id: 'critical', above: 80, label: 'Critical', label_np: 'अति गम्भीर' },
  { id: 'high', above: 60, label: 'High', label_np: 'उच्च' },
  { id: 'medium', above: 40, label: 'Medium', label_np: 'मध्यम' },
  { id: 'low', above: -1, label: 'Low', label_np: 'न्यून' },
]

export const PRIORITY_WEIGHTS = {
  population: 0.35,
  damage: 0.25,
  access: 0.2,
  critical: 0.15,
  vulnerable: 0.05,
}

export const QUESTIONS = [
  { id: 'flood-extent', en: 'Where did the flood hit?', np: 'बाढीले कहाँ असर गर्‍यो?' },
  { id: 'infrastructure', en: 'Damaged infrastructure?', np: 'क्षतिग्रस्त पूर्वाधार?' },
  { id: 'cut-off', en: 'Which settlements cut off?', np: 'कुन बस्ती सम्पर्कविहीन छन्?' },
  { id: 'priority', en: 'Priority rescue zones?', np: 'प्राथमिक उद्धार क्षेत्र?' },
]
