import { ArrowLeft, Printer } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Spinner from '../components/Common/Spinner'
import LanguageToggle from '../components/Copilot/LanguageToggle'
import { USE_MOCK } from '../config/apiConfig'
import { coverageNote } from '../data/copilotTemplates'
import { useDamageData } from '../hooks/useDamageData'
import { useCopilotStore } from '../store/copilotStore'
import { ATTRIBUTION, DAMAGE_TYPES, EVENT, PRIORITY_BANDS } from '../utils/constants'
import { formatDate, formatNumber, formatPercent } from '../utils/formatters'
import { WORDING } from '../utils/wording'
import ErrorPage from './ErrorPage'

// The one-page situation report the brief asks for. Every figure comes from
// computeStats, the same source as the dashboard and the copilot. The page is
// laid out for a single sheet of A4; the rows of the priority table are capped
// so that it stays one page whatever the run contains.
const TOP_ROWS = 8

// The Nepali was written without review by a native speaker (see the About page).
const TEXT = {
  en: {
    title: 'Situation report',
    event: 'Event',
    imagery: 'Satellite images',
    generated: 'Generated',
    demo: 'Demo data: figures are illustrative.',
    where: 'Where the flood hit',
    flooded: 'Mapped flood area',
    damaged: 'What was damaged',
    buildings: (n, total) => `${n} of ${total} mapped buildings in a flood zone`,
    roads: (km) => `${km} km of road ${USE_MOCK ? 'destroyed' : 'in a flood zone'}`,
    bridges: (n) => `${n} ${USE_MOCK ? 'bridges destroyed' : 'bridges in a flood zone'}`,
    health: (n) => `${n} health facilities unreachable by road`,
    notAssessed: 'Bridges and health facilities were not assessed in this run.',
    cutOff: 'Who is cut off',
    cutOffLine: (n, total) => `${n} of ${total} settlements have lost their road connection to a hospital.`,
    unknown: (n) => `${n} more had no mapped road before the event, so their access is unknown.`,
    priority: 'Rescue priority',
    columns: ['#', 'Settlement', 'Score', 'Band', 'Size', 'Damaged', 'Also'],
    buildingsUnit: 'buildings',
    peopleUnit: 'people',
    noData: 'no data',
    more: (n) => `and ${n} more cut-off settlements, in the ranking on the dashboard.`,
    none: 'No settlement is cut off in the mapped data.',
    healthIssue: 'health post unreachable',
    bridgeIssue: WORDING.en.bridgeIssue,
    waterIssue: 'water supply cut',
    map: 'North up. Red: cut off, numbered by priority. Green: connected. Grey: access unknown.',
    limits:
      'From Sentinel-1 radar change between the two images, pre-event OpenStreetMap and the Copernicus DEM. A satellite estimate from an educational prototype: confirm on the ground before acting on it.',
    print: 'Print or save as PDF',
    back: 'Dashboard',
  },
  np: {
    title: 'स्थिति प्रतिवेदन',
    event: 'घटना',
    imagery: 'भू-उपग्रह तस्बिर',
    generated: 'तयार मिति',
    demo: 'नमुना तथ्याङ्क: सङ्ख्याहरू उदाहरणका लागि मात्र हुन्।',
    where: 'बाढीले कहाँ असर गर्‍यो',
    flooded: 'नक्साङ्कित बाढी क्षेत्र',
    damaged: 'के-के क्षति भयो',
    buildings: (n, total) => `नक्साङ्कित ${total} भवनमध्ये ${n} बाढी क्षेत्रभित्र`,
    roads: (km) => `${km} ${WORDING.np.roadKm}`,
    bridges: (n) => `${WORDING.np.bridges}: ${n}`,
    health: (n) => `सडकबाट पहुँच नभएका स्वास्थ्य संस्था: ${n}`,
    notAssessed: 'यस विश्लेषणमा पुल र स्वास्थ्य संस्थाको मूल्याङ्कन गरिएको छैन।',
    cutOff: 'को सम्पर्कविहीन छ',
    cutOffLine: (n, total) => `${total} बस्तीमध्ये ${n} बस्तीको अस्पतालसम्मको सडक सम्पर्क टुटेको छ।`,
    unknown: (n) => `थप ${n} बस्तीमा घटनाअघि नै नक्साङ्कित सडक थिएन, त्यसैले तिनको पहुँच अज्ञात छ।`,
    priority: 'उद्धार प्राथमिकता',
    columns: ['क्रम', 'बस्ती', 'अङ्क', 'तह', 'आकार', 'क्षति', 'थप'],
    buildingsUnit: 'भवन',
    peopleUnit: 'जना',
    noData: 'तथ्याङ्क छैन',
    more: (n) => `र थप ${n} सम्पर्कविहीन बस्ती ड्यासबोर्डको सूचीमा छन्।`,
    none: 'नक्साङ्कित तथ्याङ्कमा कुनै बस्ती सम्पर्कविहीन छैन।',
    healthIssue: 'स्वास्थ्य चौकी पहुँच बाहिर',
    bridgeIssue: WORDING.np.bridgeIssue,
    waterIssue: 'खानेपानी आपूर्ति अवरुद्ध',
    map: 'माथि उत्तर। रातो: सम्पर्कविहीन, प्राथमिकता क्रमसहित। हरियो: सम्पर्कमा। खैरो: पहुँच अज्ञात।',
    limits:
      'दुई तस्बिरबीचको Sentinel-1 राडार परिवर्तन, घटनाअघिको OpenStreetMap र Copernicus DEM बाट तयार। यो शैक्षिक प्रोटोटाइपको भू-उपग्रह अनुमान हो: कारबाही गर्नुअघि स्थलगत रूपमा पुष्टि गर्नुहोस्।',
    print: 'छाप्नुहोस् वा PDF मा सुरक्षित गर्नुहोस्',
    back: 'ड्यासबोर्ड',
  },
}

const ZONE_COLOUR = { water: 'var(--water)', debris: 'var(--debris)', uncertain: 'var(--uncertain)' }
const firstPoint = (geometry) =>
  geometry.type === 'Polygon' ? geometry.coordinates[0][0] : geometry.coordinates[0][0][0]

// A small locator: flood zones and settlements placed by longitude and latitude.
// It is a sketch of where things are, drawn from the data; it has no basemap.
function Locator({ data, stats, caption }) {
  const points = data.settlements.map((s) => [s.lng, s.lat])
  const box = data.satelliteData.area?.bbox ?? [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ]
  const [west, south, east, north] = box
  if (![west, south, east, north].every(Number.isFinite) || east <= west || north <= south) return null

  // A degree of longitude is shorter than a degree of latitude away from the equator.
  const squeeze = Math.cos((((south + north) / 2) * Math.PI) / 180)
  const width = 300
  const height = Math.round((width * (north - south)) / ((east - west) * squeeze))
  const x = (lng) => ((lng - west) / (east - west)) * width
  const y = (lat) => ((north - lat) / (north - south)) * height
  const ranked = new Map(stats.priority.slice(0, TOP_ROWS).map((p) => [p.id, p.rank]))

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full border border-line bg-[var(--surface-2)]" role="img" aria-label={caption}>
        {data.floodZones.features.map((f, i) => {
          const [lng, lat] = firstPoint(f.geometry)
          return <rect key={i} x={x(lng) - 1} y={y(lat) - 1} width="2" height="2" fill={ZONE_COLOUR[f.properties.type]} />
        })}
        {stats.settlementRows
          .filter((s) => s.connected !== false)
          .map((s) => (
            <circle key={s.id} cx={x(s.lng)} cy={y(s.lat)} r="1.6" fill={s.connected ? '#1f9d55' : '#868e96'} />
          ))}
        {stats.cutOff.map((s) => (
          <g key={s.id}>
            <circle cx={x(s.lng)} cy={y(s.lat)} r={ranked.has(s.id) ? 5.5 : 2.6} fill="#e03131" stroke="#ffffff" strokeWidth="0.8" />
            {ranked.has(s.id) && (
              <text x={x(s.lng)} y={y(s.lat) + 2.4} textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#ffffff">
                {ranked.get(s.id)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 text-[10px] leading-snug text-ink-soft">{caption}</figcaption>
    </figure>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="border-b border-line pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{title}</h2>
      <div className="mt-1.5 space-y-1 text-[13px] leading-snug">{children}</div>
    </section>
  )
}

export default function ReportPage() {
  const { data, stats, loading, error, reload } = useDamageData()
  const language = useCopilotStore((s) => s.language)
  const setLanguage = useCopilotStore((s) => s.setLanguage)
  const t = TEXT[language] ?? TEXT.en
  const np = language === 'np'

  // Print styles hide the app's header and footer on this page only.
  useEffect(() => {
    document.documentElement.dataset.page = 'report'
    return () => {
      delete document.documentElement.dataset.page
    }
  }, [])

  if (error) return <ErrorPage title="Could not load flood data" message={error} onRetry={reload} />
  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading satellite analysis" size={24} />
      </div>
    )
  }

  const n = formatNumber
  const top = stats.priority.slice(0, TOP_ROWS)
  const buildings = stats.sizeBasis === 'buildings'
  const note = (coverageNote[language] ?? coverageNote.en)(stats)
  const bandLabel = (id) => {
    const band = PRIORITY_BANDS.find((b) => b.id === id)
    return np ? band.label_np : band.label
  }
  const name = (row) => (np ? (row.name_np ?? row.name) : row.name)
  const issues = (p) =>
    [p.healthPostUnreachable && t.healthIssue, p.bridgeDestroyed && t.bridgeIssue, p.water_source_cut && t.waterIssue]
      .filter(Boolean)
      .join(', ')

  return (
    <div className="mx-auto flex max-w-[210mm] flex-col gap-3 pb-10">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link to="/" className="btn">
          <ArrowLeft size={16} aria-hidden /> {t.back}
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <LanguageToggle language={language} onChange={setLanguage} />
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Printer size={16} aria-hidden /> {t.print}
          </button>
        </div>
      </div>

      <article lang={np ? 'ne' : 'en'} className="report-sheet card flex flex-col gap-3 p-6 text-ink">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b-2 border-ink pb-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{t.title}</p>
            <h1 className="text-xl font-semibold leading-tight tracking-tight">{stats.areaName ?? EVENT.location}</h1>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 text-[11px] leading-snug text-ink-soft">
            {data.satelliteData.event && (
              <>
                <dt>{t.event}</dt>
                <dd className="num text-ink">{formatDate(data.satelliteData.event)}</dd>
              </>
            )}
            {stats.imagery.before && stats.imagery.after && (
              <>
                <dt>{t.imagery}</dt>
                <dd className="num text-ink">
                  {formatDate(stats.imagery.before)} / {formatDate(stats.imagery.after)}
                </dd>
              </>
            )}
            <dt>{t.generated}</dt>
            <dd className="num text-ink">{formatDate(new Date().toISOString().slice(0, 10))}</dd>
          </dl>
        </header>

        {USE_MOCK && <p className="border-l-2 border-l-warning pl-2 text-xs font-medium">{t.demo}</p>}
        {note && <p className="border-l-2 border-l-warning pl-2 text-xs leading-snug">{note}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="flex flex-col gap-3">
            <Section title={t.where}>
              <p>
                <span className="num text-2xl font-semibold leading-none">{n(stats.floodedAreaKm2, 1)}</span> km²{' '}
                <span className="text-ink-soft">{t.flooded}</span>
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                {Object.entries(DAMAGE_TYPES).map(([type, meta]) => (
                  <li key={type} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: meta.color }} aria-hidden />
                    {np ? meta.label_np : meta.label}{' '}
                    <span className="num font-medium">{n(stats.areaByType[type], 1)} km²</span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title={t.damaged}>
              <p>{t.buildings(n(stats.damagedStructures), n(stats.totalStructures))}</p>
              <p>{t.roads(n(stats.damagedRoadKm, 1))}</p>
              {stats.infrastructureAssessed ? (
                <>
                  <p>{t.bridges(stats.bridgesDestroyed.length)}</p>
                  <p>{t.health(stats.healthPostsUnreachable.length)}</p>
                </>
              ) : (
                <p className="text-ink-soft">{t.notAssessed}</p>
              )}
            </Section>

            <Section title={t.cutOff}>
              <p className="font-medium">{t.cutOffLine(stats.cutOff.length, stats.settlementRows.length)}</p>
              {stats.unknownAccess.length > 0 && <p className="text-ink-soft">{t.unknown(stats.unknownAccess.length)}</p>}
            </Section>
          </div>
          <Locator data={data} stats={stats} caption={t.map} />
        </div>

        <Section title={t.priority}>
          {top.length === 0 ? (
            <p>{t.none}</p>
          ) : (
            // Seven columns need more than a phone is wide: the table scrolls inside its own box
            // there (focusable, so the keyboard can scroll it) and prints at full width.
            <div
              role="region"
              aria-label={t.priority}
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be focusable so the keyboard can scroll it
              tabIndex={0}
              className="overflow-x-auto print:overflow-visible"
            >
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-ink-soft">
                  {t.columns.map((column) => (
                    <th key={column} className="border-b border-line py-1 pr-2 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top.map((p) => (
                  <tr key={p.id} className="border-b border-line align-top">
                    <td className="num py-1 pr-2 text-ink-soft">{p.rank}</td>
                    <td className="py-1 pr-2 font-semibold">{name(p)}</td>
                    <td className="num py-1 pr-2 font-semibold">{p.priority}</td>
                    <td className="py-1 pr-2">{bandLabel(p.band)}</td>
                    <td className="num py-1 pr-2">
                      {buildings
                        ? `${n(p.total)} ${t.buildingsUnit}`
                        : p.population != null
                          ? `${n(p.population)} ${t.peopleUnit}`
                          : t.noData}
                    </td>
                    <td className="num py-1 pr-2">{formatPercent(p.damageRatio)}</td>
                    <td className="py-1 text-ink-soft">{issues(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          {stats.priority.length > top.length && (
            <p className="text-xs text-ink-soft">{t.more(stats.priority.length - top.length)}</p>
          )}
        </Section>

        <footer className="mt-auto border-t border-line pt-2 text-[10px] leading-snug text-ink-soft">
          <p>{t.limits}</p>
          <p className="mt-1" lang="en">
            {ATTRIBUTION.join(' ')}
          </p>
        </footer>
      </article>
    </div>
  )
}
