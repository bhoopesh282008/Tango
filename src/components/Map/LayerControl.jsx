import { BASE_MAPS } from '../../config/mapConfig'
import { useMapStore } from '../../store/mapStore'
import { MAP_LAYERS } from '../../utils/constants'

export default function LayerControl() {
  const { visibleLayers, toggleLayer, baseMap, setBaseMap } = useMapStore()

  return (
    <div className="text-sm">
      <fieldset>
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Layers</legend>
        {MAP_LAYERS.map((layer) => (
          <label key={layer.id} className="flex min-h-[40px] cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--primary)]"
              checked={visibleLayers[layer.id]}
              onChange={() => toggleLayer(layer.id)}
            />
            {layer.label}
          </label>
        ))}
      </fieldset>

      <fieldset className="mt-2 border-t border-line pt-2">
        <legend className="sr-only">Base map</legend>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Base map</span>
        {Object.entries(BASE_MAPS).map(([id, base]) => (
          <label key={id} className="flex min-h-[40px] cursor-pointer items-center gap-2.5">
            <input
              type="radio"
              name="basemap"
              className="h-4 w-4 accent-[var(--primary)]"
              checked={baseMap === id}
              onChange={() => setBaseMap(id)}
            />
            {base.label}
          </label>
        ))}
      </fieldset>
    </div>
  )
}
