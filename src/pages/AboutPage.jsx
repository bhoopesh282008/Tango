import { Link } from 'react-router-dom'
import { USE_MOCK } from '../config/apiConfig'
import { ATTRIBUTION } from '../utils/constants'

const METHOD = [
  [
    'Where the flood hit',
    'Sentinel-1 radar scenes from the same orbit track are calibrated, corrected for terrain with the Copernicus DEM and compared pixel by pixel. “Before” is the median of three images 12 days apart (the “before” scene and the two earlier ones), and a change counts only if it also exceeds what that ground normally varies between them, so ordinary change in a monsoon river is not mapped as flood. On valley floors, meaning ground within 30 m above and 600 m of a mapped river, a strong drop in backscatter is mapped as water or wet sediment and a strong rise as debris. Strong change over a large area anywhere else is marked uncertain.',
  ],
  [
    'Optical images, where the sky is clear',
    'Sentinel-2 can be added. It confirms what radar found and fills in valley-floor ground radar cannot see, using the nearest cloud-free look either side of the event. It never removes a radar detection. In monsoon most passes are cloudy: on the Trishuli scenes a third to a half of the area had a clear view on both sides of the event. Change that only the optical images show is marked “uncertain”; away from valley floors most of it is thin cloud or haze.',
  ],
  [
    'What was damaged',
    'Buildings and roads from OpenStreetMap, as mapped before the event, are flagged as damaged where they intersect the water and debris zones.',
  ],
  [
    'Who is cut off',
    'Damaged roads are removed from the road network. A settlement is cut off when it could reach a hospital by road before the event and can no longer do so. Beside that, the dashboard says whether it can still reach a town (a place mapped as a town or city), where the map has one.',
  ],
]

const LIMITS = [
  [
    'No early warning',
    'Sentinel-1 passes over the same place on the same track every 12 days. The system maps a flood after the next pass; it cannot warn of a glacier collapse or a flood in progress.',
  ],
  [
    'Steep terrain',
    'Radar cannot see slopes that are in layover or shadow. Those pixels are left out, so flooding there is missed; in a narrow gorge that can be most of the valley. Flood classes are also limited to valley floors, using height and distance limits chosen by us, so a debris flow down a gully with no mapped river is at best marked uncertain.',
  ],
  [
    'The flood model does worse than the thresholds here',
    'Water can be mapped by a neural network trained on the Kuro Siwo dataset, or by fixed backscatter thresholds. On Kuro Siwo test floods absent from training the network reached an IoU of 0.46 against 0.27 for the thresholds, with large differences between events. None of that data is Himalayan, and on the Trishuli scenes the network found less of the reference damage than the thresholds did. Debris always comes from the thresholds. Wet soil, crops, snow and unrelated landslides can be mistaken for flood change.',
  ],
  [
    'Most of the damage is missed',
    'The Trishuli flood map was compared with the Copernicus Emergency Management Service reference for the event (EMSR927), in the three reference areas it covers. Where the map shows flood it is almost always right (88% to 99% of the mapped area lies inside the reference), but it finds only 3% to 22% of the reference area and about one in five of the affected buildings. A second run further down the valley found 22% to 35%. Fresh debris often looks no different to the radar than the river bed it covers. Every count is a lower bound: an area with nothing marked is not known to be safe.',
  ],
  [
    'Some of what is mapped is not the flood',
    'Run on two images that are both from before the event, the same rule still marks 9% to 13% of the area it maps for the flood itself. That is ordinary change, such as a river at a different level, wet soil or farming. The comparison with the reference cannot show this, because its reference is a wide corridor that contains the river.',
  ],
  [
    'One image frame',
    'Sentinel-1 scenes are cut into frames along the orbit and the system reads one. An area that straddles two frames is mapped only where the chosen frame covers it, and the steadier baseline cannot be built there.',
  ],
  [
    'Damage is an overlap, not an inspection',
    'A building inside a flood zone is counted as damaged whether or not it was. A building destroyed outside the mapped zone is not counted. At 10 m resolution single houses are not resolved.',
  ],
  [
    'OpenStreetMap is incomplete',
    'Footpaths, new roads and small settlements may be missing. A settlement with no mapped road before the event is shown as “Access unknown”, not as cut off. OpenStreetMap records a population for very few settlements here, so the size of a settlement is given as its number of mapped buildings and no head count is shown. Each building is assigned to the nearest named place, and not every building is a home.',
  ],
  [
    'Road cuts are coarse',
    'A road segment touching a flood zone is removed whole from the road network (the road length shown is only the part inside a zone), and bridges are not assessed separately, so some settlements may be reported cut off when a passable route exists, and the reverse. Journey times on the route tool use assumed speeds by road class.',
  ],
  [
    'Priority score',
    'The rescue priority uses only the factors recorded for every cut-off settlement and rescales their weights. On real data that is usually the number of mapped buildings and the share of them in the flood zone, so it should be treated as a starting point for people who know the area.',
  ],
  [
    'The flood path is a drainage line',
    'The path traced from a point on the map follows the lowest ground on a 30 m elevation model. It shows which way water would run and which settlements lie along that line. It says nothing about depth, width, timing or how far a flood would reach.',
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
          <dd className="mt-0.5 max-w-[70ch] leading-relaxed text-ink-soft">{text}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Method and limitations</h1>
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
