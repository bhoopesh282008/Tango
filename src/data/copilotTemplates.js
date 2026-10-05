// Copilot answers are assembled from the computed statistics, so every figure
// in an answer is the same figure the dashboard shows.
import { USE_MOCK } from '../config/apiConfig'
import { FACTOR_WEIGHTS } from '../utils/calculations'
import { ACCESS_LEVELS, DAMAGE_TYPES, PRIORITY_BANDS, PRIORITY_WEIGHTS } from '../utils/constants'
import { formatDate, formatNumber } from '../utils/formatters'
import { WORDING } from '../utils/wording'

const n = formatNumber
// Flooded road lengths are often tens of metres; one decimal would print them as 0.0.
const km = (value) => n(value, value < 1 ? 2 : 1)
const pct = (fraction) => Math.round(fraction * 100)
const bullets = (items) => items.map((item) => `• ${item}`).join('\n')
const numbered = (items) => items.map((item, i) => `${i + 1}. ${item}`).join('\n')

const NP_MONTHS = [
  'जनवरी', 'फेब्रुअरी', 'मार्च', 'अप्रिल', 'मे', 'जुन',
  'जुलाई', 'अगस्ट', 'सेप्टेम्बर', 'अक्टोबर', 'नोभेम्बर', 'डिसेम्बर',
]
const dateNp = (iso) => `${Number(iso.slice(8, 10))} ${NP_MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
// ', 23 Aug 2026 → 28 Aug 2026' when both scene dates are known
const period = ({ imagery }, format = formatDate) =>
  imagery.before && imagery.after ? `, ${format(imagery.before)} → ${format(imagery.after)}` : ''

const people = (value) => (value == null ? 'population not recorded' : `${n(value)} people`)
const peopleNp = (value) => (value == null ? 'जनसंख्या अभिलेखमा छैन' : `${n(value)} जना`)

// Real runs have hundreds of roads, bridges and settlements; an answer lists the first few.
const LIST_LIMIT = 10
const capped = (items, more) =>
  items.length > LIST_LIMIT ? [...items.slice(0, LIST_LIMIT), more(items.length - LIST_LIMIT)] : items
const moreEn = (count) => `and ${n(count)} more`
const moreNp = (count) => `र थप ${n(count)}`

// Where OpenStreetMap has no population, a settlement's size is its mapped buildings.
const byBuildings = (s) => s.sizeBasis === 'buildings'

const FACTORS = {
  population: { en: 'population', np: 'जनसंख्या' },
  damage: { en: 'structure damage', np: 'संरचना क्षति' },
  access: { en: 'access difficulty', np: 'पहुँचको कठिनाइ' },
  critical: { en: 'critical infrastructure', np: 'महत्त्वपूर्ण पूर्वाधार' },
  vulnerable: { en: 'vulnerable residents', np: 'जोखिममा रहेका बासिन्दा' },
  buildings: { en: 'settlement size in mapped buildings', np: 'नक्साङ्कित भवनका आधारमा बस्तीको आकार' },
}
// Factors the ranking is scored on (those every settlement has data for), and the rest.
const factorSplit = (s) => {
  const used = s.priority[0]?.factorsUsed ?? Object.keys(PRIORITY_WEIGHTS)
  return { used, missing: Object.keys(PRIORITY_WEIGHTS).filter((f) => !used.includes(f)) }
}
const known = (rows, field) => rows.some((p) => p[field] != null)

const band = (id) => PRIORITY_BANDS.find((b) => b.id === id)
const access = (level) => ACCESS_LEVELS[(level ?? 1) - 1] ?? ACCESS_LEVELS[0]
// 'On foot' -> 'on foot', but '4WD only' stays as it is
const lowerFirst = (text) => text.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())
const weight = (factor) => pct(FACTOR_WEIGHTS[factor])
const urgent = (s) => s.priority.filter((p) => p.band === 'critical' || p.band === 'high')

// The counts are what the map found, not everything that happened. With a reference check the
// note carries its figures; a run that was never checked says so; the demo data says nothing.
const range = ([low, high]) => (pct(low) === pct(high) ? `${pct(low)}%` : `${pct(low)}% to ${pct(high)}%`)
export const coverageNote = {
  en: ({ validation: v }) =>
    v
      ? `Lower bound: checked against ${v.reference} in ${v.areas} ${v.areas === 1 ? 'area' : 'areas'}, this map found ${range(v.recall)} of the affected area. An area with nothing marked is not known to be safe.`
      : USE_MOCK
        ? null
        : 'This map has not been checked against a reference. An area with nothing marked is not known to be safe.',
  np: ({ validation: v }) =>
    v
      ? `न्यूनतम अनुमान: ${v.reference} सँग ${v.areas} क्षेत्रमा तुलना गर्दा यस नक्साले प्रभावित क्षेत्रको ${range(v.recall).replace(' to ', ' देखि ')} मात्र पत्ता लगाएको छ। नक्सामा चिन्ह नलागेको क्षेत्र सुरक्षित छ भन्ने निश्चित छैन।`
      : USE_MOCK
        ? null
        : 'यो नक्सा कुनै सन्दर्भ नक्सासँग तुलना गरिएको छैन। नक्सामा चिन्ह नलागेको क्षेत्र सुरक्षित छ भन्ने निश्चित छैन।',
}

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
      `Flood impact covers ${n(s.floodedAreaKm2, 1)} km² ${s.areaName ? `in ${s.areaName}` : 'along the Trishuli corridor'} (Sentinel-1 change detection${period(s)}).`,
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
      `${n(s.damagedStructures)} of ${n(s.totalStructures)} mapped structures are damaged and ${n(s.damagedRoadKm, 1)} ${WORDING.en.roadKm}.`,
      ...(s.infrastructureAssessed
        ? [
            `${WORDING.en.bridges} (${s.bridgesDestroyed.length}):\n${bullets(capped(s.bridgesDestroyed.map((b) => b.name), moreEn))}`,
            `Health posts unreachable (${s.healthPostsUnreachable.length}):\n${bullets(capped(s.healthPostsUnreachable.map((h) => h.name), moreEn))}`,
            s.powerLinesAssessed
              ? `Power lines down (${n(s.powerLineKmDown, 1)} km):\n${bullets(s.powerLinesDown.map((p) => `${p.name}: ${n(p.length_km, 1)} km`))}`
              : 'Power lines were not assessed in this run.',
          ]
        : ['Bridges, health posts and power lines were not assessed in this run.']),
      `${WORDING.en.roadSections}:\n${bullets(capped(s.damagedRoadGroups.map((r) => `${r.name}: ${km(r.length_km)} km`), moreEn))}`,
    ].join('\n\n'),

  'cut-off': (s) =>
    [
      byBuildings(s)
        ? `${s.cutOff.length} of ${s.settlementRows.length} settlements are cut off by road. They contain ${n(s.buildingsInCutOff)} mapped buildings; OpenStreetMap does not record the population of most of them, so no head count is given.`
        : `${s.cutOff.length} of ${s.settlementRows.length} settlements are cut off by road, with ${n(s.populationAffected)} residents` +
          (s.populationUnknown ? ` (population not recorded for ${s.populationUnknown} of them).` : '.'),
      bullets(
        capped(
          s.cutOff.map((c) =>
            byBuildings(s)
              ? `${c.name}: ${n(c.total)} mapped buildings, ${n(c.damaged)} damaged`
              : `${c.name}: ${people(c.population)}, ${n(c.damaged)} of ${n(c.total)} structures damaged`,
          ),
          moreEn,
        ),
      ),
      s.connected.length
        ? `Still connected by road (${s.connected.length}): ${capped(s.connected.map((c) => c.name), moreEn).join(', ')}.`
        : null,
      s.unknownAccess.length
        ? `Access unknown (no road to them in the pre-event map) (${s.unknownAccess.length}): ${capped(s.unknownAccess.map((c) => c.name), moreEn).join(', ')}.`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n'),

  priority: (s) => {
    const issues = (p) =>
      [
        p.healthPostUnreachable && 'health post unreachable',
        p.bridgeDestroyed && WORDING.en.bridgeIssue,
        p.water_source_cut && 'water supply cut',
      ].filter(Boolean)
    const { used, missing } = factorSplit(s)
    return [
      'Cut-off settlements ranked by rescue priority score (0–100):',
      numbered(
        s.priority.slice(0, LIST_LIMIT).map((p) => {
          const problems = issues(p)
          return (
            `${p.name}: ${p.priority}/100, ${band(p.band).label.toLowerCase()}. ` +
            `${byBuildings(s) ? `${n(p.total)} mapped buildings` : people(p.population)}, ${pct(p.damageRatio)}% of structures damaged` +
            (p.access_difficulty != null ? `, access: ${lowerFirst(access(p.access_difficulty).label)}` : '') +
            (problems.length ? `; ${problems.join(', ')}.` : '.')
          )
        }),
      ),
      s.priority.length > LIST_LIMIT ? `${moreEn(s.priority.length - LIST_LIMIT)}, in the ranking on the dashboard.` : null,
      byBuildings(s)
        ? `${n(urgent(s).reduce((sum, p) => sum + p.total, 0))} mapped buildings are in critical or high priority settlements.`
        : `${n(urgent(s).reduce((sum, p) => sum + (p.population ?? 0), 0))} people are in critical or high priority settlements.`,
      known(s.priority, 'bridgeDestroyed') && known(s.priority, 'water_source_cut')
        ? `Main obstacles: ${s.priority.filter((p) => p.bridgeDestroyed).length} ${WORDING.en.withBridge}, ${s.priority.filter((p) => p.water_source_cut).length} with water supply cut.`
        : null,
      s.priority.length ? `Recommended first: ${s.priority[0].name}.` : null,
      missing.length
        ? `The score uses only the factors recorded for every settlement: ${used.map((f) => `${FACTORS[f].en} (${weight(f)}%)`).join(', ')}, rescaled to 100. Not scored, because the data is missing for some or all settlements: ${missing.map((f) => FACTORS[f].en).join(', ')}.`
        : `The score weighs population (${weight('population')}%), structure damage (${weight('damage')}%), access difficulty (${weight('access')}%), critical infrastructure (${weight('critical')}%) and vulnerable residents (${weight('vulnerable')}%). Access, water supply and age figures come from field reports, not from the satellite analysis.`,
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
      `${s.areaName ? `${s.areaName} क्षेत्रमा` : 'त्रिशूली करिडोरमा'} ${n(s.floodedAreaKm2, 1)} वर्ग कि.मी. क्षेत्र बाढीबाट प्रभावित छ (Sentinel-1 परिवर्तन विश्लेषण${period(s, dateNp)})।`,
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
      `नक्साङ्कन गरिएका ${n(s.totalStructures)} संरचनामध्ये ${n(s.damagedStructures)} क्षतिग्रस्त छन् र ${n(s.damagedRoadKm, 1)} ${WORDING.np.roadKm}।`,
      ...(s.infrastructureAssessed
        ? [
            `${WORDING.np.bridges} (${s.bridgesDestroyed.length}):\n${bullets(capped(s.bridgesDestroyed.map((b) => b.name_np ?? b.name), moreNp))}`,
            `पहुँच बाहिरका स्वास्थ्य चौकीहरू (${s.healthPostsUnreachable.length}):\n${bullets(capped(s.healthPostsUnreachable.map((h) => h.name_np ?? h.name), moreNp))}`,
            s.powerLinesAssessed
              ? `अवरुद्ध विद्युत् लाइन (${n(s.powerLineKmDown, 1)} कि.मी.):\n${bullets(s.powerLinesDown.map((p) => `${p.name_np ?? p.name}: ${n(p.length_km, 1)} कि.मी.`))}`
              : 'यस विश्लेषणमा विद्युत् लाइनको मूल्याङ्कन गरिएको छैन।',
          ]
        : ['यस विश्लेषणमा पुल, स्वास्थ्य चौकी र विद्युत् लाइनको मूल्याङ्कन गरिएको छैन।']),
      `${WORDING.np.roadSections}:\n${bullets(capped(s.damagedRoadGroups.map((r) => `${r.name_np ?? r.name}: ${km(r.length_km)} कि.मी.`), moreNp))}`,
    ].join('\n\n'),

  'cut-off': (s) =>
    [
      byBuildings(s)
        ? `${s.settlementRows.length} बस्तीमध्ये ${s.cutOff.length} बस्ती सडक सम्पर्कविहीन छन्। तिनमा ${n(s.buildingsInCutOff)} नक्साङ्कित भवन छन्; OpenStreetMap मा धेरैजसो बस्तीको जनसंख्या अभिलेख नभएकाले मानिसको सङ्ख्या दिइएको छैन।`
        : `${s.settlementRows.length} बस्तीमध्ये ${s.cutOff.length} बस्ती सडक सम्पर्कविहीन छन्, जहाँ ${n(s.populationAffected)} जना बसोबास गर्छन्।` +
          (s.populationUnknown ? ` (तीमध्ये ${s.populationUnknown} बस्तीको जनसंख्या अभिलेखमा छैन।)` : ''),
      bullets(
        capped(
          s.cutOff.map((c) =>
            byBuildings(s)
              ? `${c.name_np ?? c.name}: ${n(c.total)} नक्साङ्कित भवन, ${n(c.damaged)} क्षतिग्रस्त`
              : `${c.name_np ?? c.name}: ${peopleNp(c.population)}, ${n(c.total)} मध्ये ${n(c.damaged)} संरचना क्षतिग्रस्त`,
          ),
          moreNp,
        ),
      ),
      s.connected.length
        ? `सडक सम्पर्कमा रहेका (${s.connected.length}): ${capped(s.connected.map((c) => c.name_np ?? c.name), moreNp).join(', ')}।`
        : null,
      s.unknownAccess.length
        ? `पहुँचको अवस्था अज्ञात (बाढीअघिको नक्सामा यी बस्तीसम्म सडक छैन) (${s.unknownAccess.length}): ${capped(s.unknownAccess.map((c) => c.name_np ?? c.name), moreNp).join(', ')}।`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n'),

  priority: (s) => {
    const issues = (p) =>
      [
        p.healthPostUnreachable && 'स्वास्थ्य चौकी पहुँच बाहिर',
        p.bridgeDestroyed && WORDING.np.bridgeIssue,
        p.water_source_cut && 'खानेपानी अवरुद्ध',
      ].filter(Boolean)
    const { used, missing } = factorSplit(s)
    return [
      'उद्धार प्राथमिकता अङ्क (0–100) अनुसार सम्पर्कविहीन बस्तीहरू:',
      numbered(
        s.priority.slice(0, LIST_LIMIT).map((p) => {
          const problems = issues(p)
          return (
            `${p.name_np ?? p.name}: ${p.priority}/100, ${band(p.band).label_np}। ` +
            `${byBuildings(s) ? `${n(p.total)} नक्साङ्कित भवन` : peopleNp(p.population)}, ${pct(p.damageRatio)}% संरचना क्षतिग्रस्त` +
            (p.access_difficulty != null ? `, पहुँच: ${access(p.access_difficulty).label_np}।` : '।') +
            (problems.length ? ` ${problems.join(', ')}।` : '')
          )
        }),
      ),
      s.priority.length > LIST_LIMIT ? `${moreNp(s.priority.length - LIST_LIMIT)} बस्ती ड्यासबोर्डको सूचीमा छन्।` : null,
      byBuildings(s)
        ? `अति गम्भीर वा उच्च प्राथमिकताका बस्तीमा ${n(urgent(s).reduce((sum, p) => sum + p.total, 0))} नक्साङ्कित भवन छन्।`
        : `अति गम्भीर वा उच्च प्राथमिकताका बस्तीमा ${n(urgent(s).reduce((sum, p) => sum + (p.population ?? 0), 0))} जना छन्।`,
      known(s.priority, 'bridgeDestroyed') && known(s.priority, 'water_source_cut')
        ? `मुख्य अवरोध: ${s.priority.filter((p) => p.bridgeDestroyed).length} ${WORDING.np.withBridge}, ${s.priority.filter((p) => p.water_source_cut).length} बस्तीमा खानेपानी अवरुद्ध।`
        : null,
      s.priority.length ? `पहिलो उद्धारका लागि सिफारिस: ${s.priority[0].name_np ?? s.priority[0].name}।` : null,
      missing.length
        ? `अङ्कमा सबै बस्तीका लागि तथ्याङ्क उपलब्ध भएका पक्ष मात्र समावेश छन्: ${used.map((f) => `${FACTORS[f].np} (${weight(f)}%)`).join(', ')}, जसलाई 100 मा मिलाइएको छ। केही वा सबै बस्तीको तथ्याङ्क नभएकाले समावेश नगरिएका पक्ष: ${missing.map((f) => FACTORS[f].np).join(', ')}।`
        : `अङ्कमा जनसंख्या (${weight('population')}%), संरचना क्षति (${weight('damage')}%), पहुँचको कठिनाइ (${weight('access')}%), महत्त्वपूर्ण पूर्वाधार (${weight('critical')}%) र जोखिममा रहेका बासिन्दा (${weight('vulnerable')}%) समावेश छन्। पहुँच, खानेपानी र उमेरसम्बन्धी तथ्याङ्क स्थलगत प्रतिवेदनबाट आएका हुन्, भू-उपग्रह विश्लेषणबाट होइन।`,
    ]
      .filter(Boolean)
      .join('\n\n')
  },
}

export const templates = { en, np }
