import { Download, Maximize, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react'
import { useRef, useState } from 'react'
import { USE_MOCK } from '../../config/apiConfig'
import { downloadBlob } from '../../services/exportService'
import { useUIStore } from '../../store/uiStore'
import { formatDate } from '../../utils/formatters'

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

function Scene({ image, flooded, zoom, svgRef }) {
  return (
    <div className="h-full w-full" style={{ transform: `scale(${zoom})` }}>
      {image?.url ? (
        <img
          src={image.url}
          alt={flooded ? 'Satellite image after the flood' : 'Satellite image before the flood'}
          loading="lazy"
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
    <section className="card p-4">
      <h2 className="section-title">Satellite scenes</h2>
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

export default function SatelliteViewer({ before, after, comparisonValue, onComparisonChange }) {
  const [zoom, setZoom] = useState(1)
  const afterSvg = useRef(null)
  const addToast = useUIStore((s) => s.addToast)
  const placeholder = !before?.url || !after?.url

  if (placeholder && !USE_MOCK) return <ScenesWithoutImagery before={before} after={after} />

  const download = () => {
    if (after?.url) {
      window.open(after.url, '_blank', 'noopener')
      return
    }
    const svg = new XMLSerializer().serializeToString(afterSvg.current)
    downloadBlob(svg, `trishuli-after-${after.date}.svg`, 'image/svg+xml')
    addToast('Image downloaded')
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
        <h2 className="section-title mr-auto">Satellite comparison</h2>
        <div className="no-print flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="sensor">
            Imagery layer
          </label>
          <select id="sensor" className="btn pr-2" defaultValue="s1">
            <option value="s1">Sentinel-1 radar</option>
            <option value="s2" disabled>
              Sentinel-2 optical (not available)
            </option>
            <option value="thermal" disabled>
              Thermal (not available)
            </option>
          </select>
          <div className="flex">
            <button
              type="button"
              className="btn w-10 rounded-r-none px-0"
              onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
              disabled={zoom <= 1}
              aria-label="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <button
              type="button"
              className="btn -ml-px w-10 rounded-none px-0"
              onClick={() => setZoom(1)}
              disabled={zoom === 1}
              aria-label="Fit image"
            >
              <Maximize size={16} />
            </button>
            <button
              type="button"
              className="btn -ml-px w-10 rounded-l-none px-0"
              onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
              disabled={zoom >= 3}
              aria-label="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
          </div>
          <button type="button" className="btn w-10 px-0" onClick={download} aria-label="Download after image">
            <Download size={16} />
          </button>
        </div>
      </div>

      <div className="relative h-[220px] select-none overflow-hidden bg-black sm:h-[320px] lg:h-[360px]">
        <div className="absolute inset-0">
          <Scene image={after} flooded zoom={zoom} svgRef={afterSvg} />
        </div>
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - comparisonValue}% 0 0)` }}>
          <Scene image={before} flooded={false} zoom={zoom} />
        </div>

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
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>

      <p className="px-3 py-2 text-xs text-ink-soft sm:px-4">
        {after.sensor}, {after.resolution} resolution. Drag to compare.
        {placeholder && ' Placeholder rendering: no satellite scene is loaded in demo mode.'}
      </p>
    </section>
  )
}
