// Copilot answers are assembled from the computed statistics, so every figure
// in an answer is the same figure the dashboard shows.
import { DAMAGE_TYPES, EVENT } from '../utils/constants'
import { formatNumber } from '../utils/formatters'

const n = formatNumber
const pct = (fraction) => Math.round(fraction * 100)
const bullets = (items) => items.map((item) => `• ${item}`).join('\n')
const numbered = (items) => items.map((item, i) => `${i + 1}. ${item}`).join('\n')
const day = (iso) => Number(iso.slice(8))

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

  priority: (s) =>
    [
      'Cut-off settlements ranked by population × share of structures damaged:',
      numbered(
        s.priority.map((p) => `${p.name}: ${n(p.population)} people, ${pct(p.damageRatio)}% of structures damaged`),
      ),
      s.healthPostsUnreachable.length
        ? `No road access to: ${s.healthPostsUnreachable.map((h) => h.name).join(', ')}.`
        : null,
      'This ranking is calculated from the satellite analysis only. It does not reflect what the satellite cannot see: injuries, supplies, weather or reports from the ground.',
    ]
      .filter(Boolean)
      .join('\n\n'),
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

  priority: (s) =>
    [
      'सम्पर्कविहीन बस्तीहरूको प्राथमिकता क्रम (जनसंख्या × क्षतिग्रस्त संरचनाको अनुपात):',
      numbered(
        s.priority.map((p) => `${p.name_np ?? p.name}: ${n(p.population)} जना, ${pct(p.damageRatio)}% संरचना क्षतिग्रस्त`),
      ),
      s.healthPostsUnreachable.length
        ? `सडक पहुँच नभएका: ${s.healthPostsUnreachable.map((h) => h.name_np ?? h.name).join(', ')}।`
        : null,
      'यो क्रम भू-उपग्रह विश्लेषणबाट मात्र गणना गरिएको हो। भू-उपग्रहले देख्न नसक्ने कुराहरू (घाइते, आपूर्ति, मौसम वा स्थलगत जानकारी) यसमा समावेश छैनन्।',
    ]
      .filter(Boolean)
      .join('\n\n'),
}

export const templates = { en, np }
