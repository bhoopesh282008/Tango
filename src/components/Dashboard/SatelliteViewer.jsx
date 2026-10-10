import { Download, Maximize, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react'
import { useRef, useState } from 'react'
import { USE_MOCK } from '../../config/apiConfig'
import { downloadBlob } from '../../services/exportService'
import { useUIStore } from '../../store/uiStore'
import { formatDate } from '../../utils/formatters'

const MAX_ZOOM = 8

const RIVER = 'M 620 -10 C 600 60, 560 90, 540 150 S 430 220, 380 260 S 240 320, 150 380'
const VILLAGES = [
  [598, 40], [560, 108], [520, 168], [452, 214], [395, 238], [330, 292], [250, 318], [640, 150], [300, 180],
]

// Stand-in for a radar scene, drawn when the backend supplies no image URL.
// Open water returns little signal, so it renders dark, as in real SAR imagery.
function SarScene({ flooded, uid, svgRef }) {
  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 360"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      role="img"
      aria-label={flooded ? 'Radar scene after the flood' : 'Radar scene before the flood'}
    >
      <defs>
        <filter id={`${uid}-relief`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.009 0.014" numOctaves="5" seed="11" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.3" intercept="-0.32" />
            <feFuncG type="linear" slope="1.3" intercept="-0.32" />
            <feFuncB type="linear" slope="1.3" intercept="-0.32" />
            <feFuncA type="linear" slope="0" intercept="1" />
          </feComponentTransfer>
        </filter>
        <filter id={`${uid}-speckle`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="3" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <filter id={`${uid}-soft`}>
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      <rect width="800" height="360" fill="#6b6b6b" />
      <rect width="800" height="360" filter={`url(#${uid}-relief)`} />

      {VILLAGES.map(([x, y], i) => (
        <g key={i} fill="#f2f2f2">
          <rect x={x} y={y} width="5" height="5" />
          <rect x={x + 9} y={y + 4} width="4" height="4" />
          <rect x={x - 7} y={y + 8} width="5" height="4" />
          <rect x={x + 3} y={y + 12} width="4" height="5" />
        </g>
      ))}

      {flooded && (
        <g>
          <path d={RIVER} fill="none" stroke="#0e0e0e" strokeWidth="34" strokeLinecap="round" filter={`url(#${uid}-soft)`} />
          <ellipse cx="535" cy="150" rx="46" ry="26" fill="#0e0e0e" filter={`url(#${uid}-soft)`} />
          <ellipse cx="385" cy="258" rx="58" ry="24" fill="#0e0e0e" filter={`url(#${uid}-soft)`} />
          <ellipse cx="640" cy="92" rx="30" ry="18" fill="#e4e4e4" opacity="0.75" filter={`url(#${uid}-soft)`} />
          <ellipse cx="470" cy="176" rx="24" ry="14" fill="#e4e4e4" opacity="0.7" filter={`url(#${uid}-soft)`} />
        </g>
      )}
      <path d={RIVER} fill="none" stroke="#0e0e0e" strokeWidth={flooded ? 12 : 6} strokeLinecap="round" />

      <rect width="800" height="360" filter={`url(#${uid}-speckle)`} opacity="0.32" />
    </svg>
  )
}

function Scene({ url, flooded, zoom, origin, svgRef, onShape }) {
  return (
    <div
      className="h-full w-full"
      style={{ transform: `scale(${zoom})`, transformOrigin: `${origin.x}% ${origin.y}%` }}
    >
      {url ? (
        <img
          src={url}
          decoding="async"
          alt={flooded ? 'Satellite image after the flood' : 'Satellite image before the flood'}
          // A picture that is already in the cache can finish before the load handler is attached.
          ref={(img) => img?.complete && img.naturalWidth && onShape?.(img.naturalWidth / img.naturalHeight)}
          onLoad={(e) => onShape?.(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
          // The picture fills the box; no-data pixels are transparent over the stage's hatch.
          className="h-full w-full object-cover"
        />
      ) : (
        <SarScene flooded={flooded} uid={flooded ? 'after' : 'before'} svgRef={svgRef} />
      )}
    </div>
  )
}

// Shown instead of the drawn stand-in when real data is loaded without images:
// a sketch of a radar scene next to real figures would pass for the real scene.
function ScenesWithoutImagery({ before, after }) {
  const scenes = [
    ['Before', before],
    ['After', after],
  ]
  return (
    <section aria-labelledby="scenes-heading">
      <h3 id="scenes-heading" className="section-title">
        Satellite scenes
      </h3>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        {scenes.map(([label, scene]) => (
          <div key={label} className="min-w-0">
            <dt className="font-semibold">
              {label} · {scene ? formatDate(scene.date) : 'not recorded'}
            </dt>
            {scene && (
              <dd className="mt-0.5 text-xs text-ink-soft">
                {scene.sensor}, {scene.resolution}
                {scene.relative_orbit != null && ` · track ${scene.relative_orbit} ${scene.orbit_state ?? ''}`}
                {scene.id && <span className="block break-all">{scene.id}</span>}
              </dd>
            )}
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-soft">
        Scene imagery is not exported by the pipeline yet, so there is no before/after picture to
        compare. The flood zones on the map come from these two scenes.
      </p>
    </section>
  )
}

// What the greys and the hatch in the pictures mean. Dark in radar is not always water, so
// the legend says what else it can be; the hatch is where the satellite has no data at all.
function Legend({ optical, outlined }) {
  const items = optical
    ? [
        ['bg-[#111]', 'Dark: water, or shadow'],
        ['no-data', 'Hatched: cloud, no data'],
      ]
    : [
        ['bg-[#111]', 'Dark: little radar return (calm water, or ground turned away from the satellite)'],
        ['bg-[#f0f0f0]', 'Bright: rough or steep ground facing the satellite'],
        ['no-data', 'Hatched: no data (radar layover and shadow, left out)'],
      ]
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft" aria-label="Picture key">
      {items.map(([swatch, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-3 w-4 shrink-0 border border-line ${swatch}`} />
          {label}
        </li>
      ))}
      {outlined.map((kind) => (
        <li key={kind} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-4 shrink-0 border-2 bg-[#777]"
            style={{ borderColor: `var(--${kind})` }}
          />
          Outline: {OUTLINES[kind]} mapped
        </li>
      ))}
    </ul>
  )
}

// The flood zone types that are outlined, in drawing order (the least certain first, so it
// never covers the others), and how the key names them.
const OUTLINES = {
  uncertain: 'uncertain change',
  debris: 'debris',
  water: 'water or wet sediment',
}

// The flood zones as outlines over the pictures. The paths are in the picture's own pixels
// (the pipeline cut them to the same grid), so the same viewBox as the picture puts each one
// on its place at any size and zoom. The picture is zoomed by a CSS transform, which a
// non-scaling stroke does not see, so the stroke is made thinner by the zoom to stay one width.
function ZoneOutlines({ outline, zoom, origin }) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ transform: `scale(${zoom})`, transformOrigin: `${origin.x}% ${origin.y}%` }}
    >
      <svg
        viewBox={`0 0 ${outline.width} ${outline.height}`}
        // The picture is drawn to fill the box, so the outlines are fitted the same way
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        fill="none"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        data-testid="zone-outlines"
      >
        {Object.keys(OUTLINES)
          .filter((kind) => outline.paths[kind])
          .map((kind) => (
            <g key={kind}>
              <path d={outline.paths[kind]} stroke="rgba(0,0,0,0.6)" strokeWidth={3 / zoom} vectorEffect="non-scaling-stroke" />
              <path d={outline.paths[kind]} stroke={`var(--${kind})`} strokeWidth={1.25 / zoom} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
      </svg>
    </div>
  )
}

export default function SatelliteViewer({ before, after, detail, outlines, comparisonValue, onComparisonChange }) {
  const [zoom, setZoom] = useState(1)
  // Width over height of the real picture, once it has loaded. The stage takes this shape,
  // so the slider runs across the picture and not across empty space beside it.
  const [shape, setShape] = useState(null)
  // The point the zoom holds still, as a percentage of the stage. It follows the mouse.
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const afterSvg = useRef(null)
  const addToast = useUIStore((s) => s.addToast)
  const [sensor, setSensor] = useState('s1')
  const placeholder = !before?.url || !after?.url
  const hasOptical = !!(before?.optical_url && after?.optical_url)
  // A run can add a full-resolution close-up of where it mapped the most flood. It opens
  // first: across the whole area the two radar pictures are hard to tell apart.
  const hasDetail = !!(before?.detail_url && after?.detail_url)
  const [view, setView] = useState('detail')
  const optical = sensor === 's2' && hasOptical
  const closeUp = hasDetail && view === 'detail' && !optical
  const urlOf = (scene) => (optical ? scene?.optical_url : closeUp ? scene?.detail_url : scene?.url)
  // The zones are outlined on whichever picture is showing (the optical pictures are on the radar's
  // grid, so the whole-area outlines fit them too). Only if they are the picture's shape: a file
  // from another run would draw the zones in the wrong place, which is worse than not drawing them.
  const [showOutline, setShowOutline] = useState(true)
  // The box is square and the picture fills it, so a picture that is not square loses a little at two edges
  const trimmed = !placeholder && shape && Math.abs(shape - 1) > 0.02
  const candidate = closeUp ? outlines?.detail : outlines?.whole
  const outline =
    candidate && shape && Math.abs(candidate.width / candidate.height / shape - 1) < 0.01 ? candidate : null

  const lookAt = (event) => {
    if (zoom === 1 || event.pointerType !== 'mouse') return
    const box = event.currentTarget.getBoundingClientRect()
    setOrigin({
      x: Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - box.top) / box.height) * 100)),
    })
  }

  if (placeholder && !USE_MOCK) return <ScenesWithoutImagery before={before} after={after} />

  const download = () => {
    if (after?.url) {
      window.open(urlOf(after), '_blank', 'noopener')
      return
    }
    const svg = new XMLSerializer().serializeToString(afterSvg.current)
    downloadBlob(svg, `trishuli-after-${after.date}.svg`, 'image/svg+xml')
    addToast('Image downloaded')
  }

  return (
    <section aria-labelledby="compare-heading">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-2">
        <h3 id="compare-heading" className="section-title mr-auto">
          Before and after
        </h3>
        <div className="no-print flex flex-wrap items-center gap-1">
          {hasDetail && !optical && (
            <div className="flex" role="group" aria-label="Picture extent">
              {[
                ['detail', 'Flood area'],
                ['whole', 'Whole area'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setView(id)
                    setZoom(1)
                  }}
                  aria-pressed={view === id}
                  className="btn-quiet"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {outline && (
            <button
              type="button"
              onClick={() => setShowOutline((on) => !on)}
              aria-pressed={showOutline}
              className="btn-quiet"
              title="Outline the flood zones the map shows, over both pictures"
            >
              Mapped flood
            </button>
          )}
          {/* A choice only when there is one: a run is radar only unless optical images were added. */}
          {hasOptical && (
            <div className="flex" role="group" aria-label="Imagery">
              {[
                ['s1', 'Radar', 'Sentinel-1 radar: sees through cloud, the flood map is made from it'],
                ['s2', 'Optical', 'Sentinel-2 optical, false colour: a camera, blocked by cloud'],
              ].map(([id, label, hint]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSensor(id)}
                  aria-pressed={sensor === id}
                  className="btn-quiet"
                  title={hint}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex">
            <button
              type="button"
              className="btn-quiet w-10 px-0"
              onClick={() => setZoom((z) => Math.max(1, z / 2))}
              disabled={zoom <= 1}
              aria-label="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <button
              type="button"
              className="btn-quiet w-10 px-0"
              onClick={() => setZoom(1)}
              disabled={zoom === 1}
              aria-label="Fit image"
            >
              <Maximize size={16} />
            </button>
            <button
              type="button"
              className="btn-quiet w-10 px-0"
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 2))}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
          </div>
          <button type="button" className="btn-quiet w-10 px-0" onClick={download} aria-label="Download after image">
            <Download size={16} />
          </button>
        </div>
      </div>

      <div className="flex">
      {/* One box for every picture, so switching between the whole area and the close-up never
          changes its size. The picture fills it (the whole area is a little taller than wide, so
          its top and bottom edges are trimmed; the caption says so). */}
      <div
        className={`compare-stage relative select-none overflow-hidden ${
          placeholder ? 'h-[220px] w-full bg-black sm:h-[320px] lg:h-[360px]' : 'no-data aspect-square w-full max-w-[560px]'
        }`}
        onPointerMove={lookAt}
      >
        <div className="absolute inset-0">
          <Scene url={urlOf(after)} flooded zoom={zoom} origin={origin} svgRef={afterSvg} onShape={setShape} />
        </div>
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - comparisonValue}% 0 0)` }}>
          <Scene url={urlOf(before)} flooded={false} zoom={zoom} origin={origin} />
        </div>

        {outline && showOutline && <ZoneOutlines outline={outline} zoom={zoom} origin={origin} />}

        <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
          Before · {formatDate(before.date)}
        </span>
        <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
          After · {formatDate(after.date)}
        </span>

        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: `${comparisonValue}%` }}
        >
          <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-md">
            <MoveHorizontal size={18} aria-hidden />
          </span>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          value={comparisonValue}
          onChange={(e) => onComparisonChange(Number(e.target.value))}
          aria-label="Before and after comparison"
          aria-valuetext={`${comparisonValue}% before, ${100 - comparisonValue}% after`}
          // Sideways drags move the slider; vertical ones still scroll the page.
          className="absolute inset-0 h-full w-full cursor-ew-resize touch-pan-y opacity-0"
        />
        {zoom > 1 && (
          <span className="num pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
            {zoom}×
          </span>
        )}
      </div>
      </div>

      {!placeholder && (
        <Legend
          optical={optical}
          outlined={outline && showOutline ? Object.keys(OUTLINES).filter((kind) => outline.paths[kind]) : []}
        />
      )}

      <p className="max-w-prose pt-2 text-xs leading-relaxed text-ink-soft">
        {sensor === 's2' && hasOptical
          ? 'Sentinel-2, near infrared / red / green: vegetation shows red, water dark. Each pixel is the nearest clear look to the event; cloud is hatched.'
          : after.sensor
            ? `${after.sensor}${after.resolution ? `, ${after.resolution} resolution` : ''}. Radar sends its own signal, so it sees through monsoon cloud and works at night; the flood map is made from the change between these two images.`
            : 'Radar backscatter: water dark, rough ground bright.'}
        {!hasOptical && !placeholder && ' This run uses radar only; optical Sentinel-2 images were not added.'}
      </p>
      <p className="max-w-prose pt-1.5 text-xs leading-relaxed text-ink-soft">
        {closeUp &&
          `Close-up at full resolution: the ${detail?.width_km ?? ''} × ${detail?.height_km ?? ''} km where the map found the most flood${
            detail?.near ? `, near ${detail.near}` : ''
          }. `}
        {outline && showOutline &&
          'The outlines are the flood zones mapped from this pair, drawn in the same place over both pictures. '}
        {trimmed && 'The picture is trimmed at its edges to fill the box; the download button opens it whole. '}
        Drag to compare.{!placeholder && ' Zoom in, then move the pointer over the picture to look around.'}
        {placeholder && ' Placeholder rendering: no satellite scene is loaded in demo mode.'}
      </p>
    </section>
  )
}
