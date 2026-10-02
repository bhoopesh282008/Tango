// Copilot answers are assembled from the computed statistics, so every figure
// in an answer is the same figure the dashboard shows.
import { ACCESS_LEVELS, DAMAGE_TYPES, EVENT, PRIORITY_BANDS, PRIORITY_WEIGHTS } from '../utils/constants'
import { formatNumber } from '../utils/formatters'

const n = formatNumber
const pct = (fraction) => Math.round(fraction * 100)
const bullets = (items) => items.map((item) => `• ${item}`).join('\n')
const numbered = (items) => items.map((item, i) => `${i + 1}. ${item}`).join('\n')
const day = (iso) => Number(iso.slice(8))

const band = (id) => PRIORITY_BANDS.find((b) => b.id === id)
const access = (level) => ACCESS_LEVELS[(level ?? 1) - 1] ?? ACCESS_LEVELS[0]
// 'On foot' -> 'on foot', but '4WD only' stays as it is
const lowerFirst = (text) => text.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())
const weight = (factor) => pct(PRIORITY_WEIGHTS[factor])
const urgent = (s) => s.priority.filter((p) => p.band === 'critical' || p.band === 'high')

const en = {
  title: {
    'flood-extent': 'Where did the flood hit?',
    infrastructure: 'Damaged infrastructure',
    'cut-off': 'Cut-off settlements',
    priority: 'Priority rescue zones',
    report: 'Situation report',
  },

  'flood-extent': (s) => {
    const worst = [...s.settlementRows].sort((a, b) => b.damaged - a.damaged).slice(0, 3)
    return [
      `Flood impact covers ${n(s.floodedAreaKm2, 1)} km² along the Trishuli corridor (Sentinel-1 change detection, ${day(EVENT.beforeDate)} Aug → ${day(EVENT.afterDate)} Aug 2026).`,
      bullets([
        `Open water: ${n(s.areaByType.water, 1)} km²`,
        `Debris and sediment: ${n(s.areaByType.debris, 1)} km²`,
        `Uncertain, needs verification: ${n(s.areaByType.uncertain, 1)} km²`,
      ]),
      `Largest affected reaches:\n${numbered(
        s.zones.slice(0, 3).map(
          (z) => `${z.name}: ${n(z.area_km2, 1)} km² (${DAMAGE_TYPES[z.type].label.toLowerCase()}, ${pct(z.confidence)}% confidence)`,
        ),
      )}`,
      `Settlements with the most damaged structures: ${worst.map((w) => `${w.name} (${n(w.damaged)})`).join(', ')}.`,
    ].join('\n\n')
  },

  infrastructure: (s) =>
    [
      `${n(s.damagedStructures)} of ${n(s.totalStructures)} mapped structures are damaged and ${n(s.damagedRoadKm, 1)} km of road is destroyed.`,
      `Bridges destroyed (${s.bridgesDestroyed.length}):\n${bullets(s.bridgesDestroyed.map((b) => b.name))}`,
      `Health posts unreachable (${s.healthPostsUnreachable.length}):\n${bullets(s.healthPostsUnreachable.map((h) => h.name))}`,
      `Power lines down (${n(s.powerLineKmDown, 1)} km):\n${bullets(s.powerLinesDown.map((p) => `${p.name}: ${n(p.length_km, 1)} km`))}`,
      `Destroyed road sections:\n${bullets(s.damagedRoads.map((r) => `${r.name}: ${n(r.length_km, 1)} km`))}`,
    ].join('\n\n'),

  'cut-off': (s) =>
    [
      `${s.cutOff.length} of ${s.settlementRows.length} settlements are cut off by road, with ${n(s.populationAffected)} residents.`,
      bullets(
        s.cutOff.map((c) => `${c.name}: ${n(c.population)} people, ${n(c.damaged)} of ${n(c.total)} structures damaged`),
      ),
      `Still connected by road: ${s.connected.map((c) => c.name).join(', ')}.`,
    ].join('\n\n'),

  priority: (s) => {
    const issues = (p) =>
      [
        p.healthPostUnreachable && 'health post unreachable',
        p.bridgeDestroyed && 'bridge destroyed',
        p.water_source_cut && 'water supply cut',
      ].filter(Boolean)
    return [
      'Cut-off settlements ranked by rescue priority score (0–100):',
      numbered(
        s.priority.map((p) => {
          const problems = issues(p)
          return (
            `${p.name}: ${p.priority}/100, ${band(p.band).label.toLowerCase()}. ` +
            `${n(p.population)} people, ${pct(p.damageRatio)}% of structures damaged, ` +
            `access: ${lowerFirst(access(p.access_difficulty).label)}` +
            (problems.length ? `; ${problems.join(', ')}.` : '.')
          )
        }),
      ),
      `${n(urgent(s).reduce((sum, p) => sum + p.population, 0))} people are in critical or high priority settlements.`,
      `Main obstacles: ${s.priority.filter((p) => p.bridgeDestroyed).length} settlements with a destroyed bridge, ${s.priority.filter((p) => p.water_source_cut).length} with water supply cut.`,
      s.priority.length ? `Recommended first: ${s.priority[0].name}.` : null,
      `The score weighs population (${weight('population')}%), structure damage (${weight('damage')}%), access difficulty (${weight('access')}%), critical infrastructure (${weight('critical')}%) and vulnerable residents (${weight('vulnerable')}%). Access, water supply and age figures come from field reports, not from the satellite analysis.`,
    ]
      .filter(Boolean)
      .join('\n\n')
  },
}

const np = {
  title: {
    'flood-extent': 'बाढीले कहाँ असर गर्‍यो?',
    infrastructure: 'क्षतिग्रस्त पूर्वाधार',
    'cut-off': 'सम्पर्कविहीन बस्तीहरू',
    priority: 'प्राथमिक उद्धार क्षेत्र',
    report: 'स्थिति प्रतिवेदन',
  },

  'flood-extent': (s) => {
    const worst = [...s.settlementRows].sort((a, b) => b.damaged - a.damaged).slice(0, 3)
    return [
      `त्रिशूली करिडोरमा ${n(s.floodedAreaKm2, 1)} वर्ग कि.मी. क्षेत्र बाढीबाट प्रभावित छ (Sentinel-1 परिवर्तन विश्लेषण, ${day(EVENT.beforeDate)} अगस्ट → ${day(EVENT.afterDate)} अगस्ट 2026)।`,
      bullets([
        `खुला पानी: ${n(s.areaByType.water, 1)} वर्ग कि.मी.`,
        `गेग्रान र थिग्रो: ${n(s.areaByType.debris, 1)} वर्ग कि.मी.`,
        `अनिश्चित, प्रमाणीकरण आवश्यक: ${n(s.areaByType.uncertain, 1)} वर्ग कि.मी.`,
      ]),
      `सबैभन्दा बढी प्रभावित खण्डहरू:\n${numbered(
        s.zones.slice(0, 3).map(
          (z) => `${z.name_np ?? z.name}: ${n(z.area_km2, 1)} वर्ग कि.मी. (${DAMAGE_TYPES[z.type].label_np}, ${pct(z.confidence)}% विश्वसनीयता)`,
        ),
      )}`,
      `सबैभन्दा बढी संरचना क्षति भएका बस्तीहरू: ${worst.map((w) => `${w.name_np ?? w.name} (${n(w.damaged)})`).join(', ')}।`,
    ].join('\n\n')
  },

  infrastructure: (s) =>
    [
      `नक्साङ्कन गरिएका ${n(s.totalStructures)} संरचनामध्ये ${n(s.damagedStructures)} क्षतिग्रस्त छन् र ${n(s.damagedRoadKm, 1)} कि.मी. सडक भत्किएको छ।`,
      `भत्किएका पुलहरू (${s.bridgesDestroyed.length}):\n${bullets(s.bridgesDestroyed.map((b) => b.name_np ?? b.name))}`,
      `पहुँच बाहिरका स्वास्थ्य चौकीहरू (${s.healthPostsUnreachable.length}):\n${bullets(s.healthPostsUnreachable.map((h) => h.name_np ?? h.name))}`,
      `अवरुद्ध विद्युत् लाइन (${n(s.powerLineKmDown, 1)} कि.मी.):\n${bullets(s.powerLinesDown.map((p) => `${p.name_np ?? p.name}: ${n(p.length_km, 1)} कि.मी.`))}`,
      `भत्किएका सडक खण्डहरू:\n${bullets(s.damagedRoads.map((r) => `${r.name_np ?? r.name}: ${n(r.length_km, 1)} कि.मी.`))}`,
    ].join('\n\n'),

  'cut-off': (s) =>
    [
      `${s.settlementRows.length} बस्तीमध्ये ${s.cutOff.length} बस्ती सडक सम्पर्कविहीन छन्, जहाँ ${n(s.populationAffected)} जना बसोबास गर्छन्।`,
      bullets(
        s.cutOff.map((c) => `${c.name_np ?? c.name}: ${n(c.population)} जना, ${n(c.total)} मध्ये ${n(c.damaged)} संरचना क्षतिग्रस्त`),
      ),
      `सडक सम्पर्कमा रहेका: ${s.connected.map((c) => c.name_np ?? c.name).join(', ')}।`,
    ].join('\n\n'),

  priority: (s) => {
    const issues = (p) =>
      [
        p.healthPostUnreachable && 'स्वास्थ्य चौकी पहुँच बाहिर',
        p.bridgeDestroyed && 'पुल भत्किएको',
        p.water_source_cut && 'खानेपानी अवरुद्ध',
      ].filter(Boolean)
    return [
      'उद्धार प्राथमिकता अङ्क (0–100) अनुसार सम्पर्कविहीन बस्तीहरू:',
      numbered(
        s.priority.map((p) => {
          const problems = issues(p)
          return (
            `${p.name_np ?? p.name}: ${p.priority}/100, ${band(p.band).label_np}। ` +
            `${n(p.population)} जना, ${pct(p.damageRatio)}% संरचना क्षतिग्रस्त, ` +
            `पहुँच: ${access(p.access_difficulty).label_np}।` +
            (problems.length ? ` ${problems.join(', ')}।` : '')
          )
        }),
      ),
      `अति गम्भीर वा उच्च प्राथमिकताका बस्तीमा ${n(urgent(s).reduce((sum, p) => sum + p.population, 0))} जना छन्।`,
      `मुख्य अवरोध: ${s.priority.filter((p) => p.bridgeDestroyed).length} बस्तीमा पुल भत्किएको, ${s.priority.filter((p) => p.water_source_cut).length} बस्तीमा खानेपानी अवरुद्ध।`,
      s.priority.length ? `पहिलो उद्धारका लागि सिफारिस: ${s.priority[0].name_np ?? s.priority[0].name}।` : null,
      `अङ्कमा जनसंख्या (${weight('population')}%), संरचना क्षति (${weight('damage')}%), पहुँचको कठिनाइ (${weight('access')}%), महत्त्वपूर्ण पूर्वाधार (${weight('critical')}%) र जोखिममा रहेका बासिन्दा (${weight('vulnerable')}%) समावेश छन्। पहुँच, खानेपानी र उमेरसम्बन्धी तथ्याङ्क स्थलगत प्रतिवेदनबाट आएका हुन्, भू-उपग्रह विश्लेषणबाट होइन।`,
    ]
      .filter(Boolean)
      .join('\n\n')
  },
}

export const templates = { en, np }
