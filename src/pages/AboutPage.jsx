import { Link } from 'react-router-dom'
import { USE_MOCK } from '../config/apiConfig'
import { ATTRIBUTION } from '../utils/constants'

const METHOD = [
  [
    'Where the flood hit',
    'Two Sentinel-1 radar scenes from the same orbit track, one before and one after the event, are calibrated, corrected for terrain with the Copernicus DEM and compared pixel by pixel. A strong drop in backscatter over a dark surface is mapped as water, a strong rise as debris, and a weaker change as uncertain.',
  ],
  [
    'What was damaged',
    'Buildings and roads from OpenStreetMap, as mapped before the event, are flagged as damaged where they intersect the water and debris zones.',
  ],
  [
    'Who is cut off',
    'Damaged roads are removed from the road network. A settlement is cut off when it could reach a hospital by road before the event and can no longer do so.',
  ],
]

const LIMITS = [
  [
    'No early warning',
    'Sentinel-1 passes over the same place on the same track every 12 days. The system maps a flood after the next pass; it cannot warn of a glacier collapse or a flood in progress.',
  ],
  [
    'Steep terrain',
    'Radar cannot see slopes that are in layover or shadow, which is a large share of a Himalayan valley. Those pixels are left out, so flooding there is missed. Slopes steeper than 20° are also excluded to limit false alarms.',
  ],
  [
    'Fixed thresholds, not a trained model',
    'Water and debris are separated with fixed backscatter thresholds. Wet soil, crops, snow and landslides unrelated to the flood can be mistaken for flood change. The confidence value reflects how far a change exceeds the threshold; it is not a measured accuracy.',
  ],
  [
    'Not validated',
    'The flood map has not yet been compared with the Copernicus Emergency Management Service reference for this event (EMSR927), so its accuracy is unknown.',
  ],
  [
    'Damage is an overlap, not an inspection',
    'A building inside a flood zone is counted as damaged whether or not it was. A building destroyed outside the mapped zone is not counted. At 10 m resolution single houses are not resolved.',
  ],
  [
    'OpenStreetMap is incomplete',
    'Footpaths, new roads and small settlements may be missing. A settlement with no mapped road before the event is shown as “Access unknown”, not as cut off. Population is shown only where OpenStreetMap records it.',
  ],
  [
    'Road cuts are coarse',
    'A road segment touching a flood zone is removed whole, and bridges are not assessed separately, so some settlements may be reported cut off when a passable route exists, and the reverse.',
  ],
  [
    'Priority score',
    'The rescue priority uses only the factors the data provides and rescales their weights. With few factors it mostly reflects population and should be treated as a starting point for people who know the area.',
  ],
  [
    'Nepali text',
    'The Nepali wording in the copilot has not been reviewed by a native speaker.',
  ],
]

function Entries({ items }) {
  return (
    <dl className="mt-3 space-y-3 text-sm">
      {items.map(([term, text]) => (
        <div key={term}>
          <dt className="font-semibold">{term}</dt>
          <dd className="mt-0.5 text-ink-soft">{text}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-10">
      <div>
        <h1 className="text-xl font-bold">Method and limitations</h1>
        <p className="mt-1 text-sm text-ink-soft">
          This is an educational prototype, not an operational tool. Every figure is an estimate from
          satellite data and must be confirmed on the ground.
        </p>
        {USE_MOCK && (
          <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-sm">
            The dashboard is currently showing bundled demo data. Its figures and imagery are
            illustrative and were not produced by the method described here.
          </p>
        )}
      </div>

      <section className="card p-4" aria-labelledby="method-heading">
        <h2 id="method-heading" className="section-title">
          How the results are produced
        </h2>
        <Entries items={METHOD} />
      </section>

      <section className="card p-4" aria-labelledby="limits-heading">
        <h2 id="limits-heading" className="section-title">
          What the system cannot do
        </h2>
        <Entries items={LIMITS} />
      </section>

      <section className="card p-4" aria-labelledby="sources-heading">
        <h2 id="sources-heading" className="section-title">
          Data sources
        </h2>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
          {ATTRIBUTION.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-soft">
          Published damage maps, including Copernicus EMS products, are not used as inputs. No images
          of people affected by the disaster are used.
        </p>
      </section>

      <Link to="/" className="btn self-start">
        Back to dashboard
      </Link>
    </div>
  )
}
