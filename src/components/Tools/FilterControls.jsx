import { useState } from 'react'
import { useMapStore } from '../../store/mapStore'
import { DAMAGE_TYPES, DEFAULT_FILTERS, EVENT, SIZE_CLASSES } from '../../utils/constants'
import { formatDate } from '../../utils/formatters'

export default function FilterControls({ onApplied }) {
  const applied = useMapStore((s) => s.filters)
  const setFilters = useMapStore((s) => s.setFilters)
  // Edits stay local until Apply so the map does not redraw on every slider tick.
  const [draft, setDraft] = useState(applied)

  const apply = (filters) => {
    setDraft(filters)
    setFilters(filters)
    onApplied?.()
  }

  return (
    <form
      className="text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        apply(draft)
      }}
    >
      <label htmlFor="confidence" className="flex justify-between font-medium">
        Confidence threshold
        <span className="font-semibold text-primary">{draft.confidence}%</span>
      </label>
      <input
        id="confidence"
        type="range"
        min="0"
        max="100"
        step="5"
        value={draft.confidence}
        onChange={(e) => setDraft({ ...draft, confidence: Number(e.target.value) })}
        className="mt-1 h-8 w-full accent-[var(--primary)]"
      />

      <fieldset className="mt-2">
        <legend className="font-medium">Damage type</legend>
        <div className="flex flex-wrap gap-x-4">
          {Object.entries(DAMAGE_TYPES).map(([type, meta]) => (
            <label key={type} className="flex min-h-[40px] cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={draft.types[type]}
                onChange={() =>
                  setDraft({ ...draft, types: { ...draft.types, [type]: !draft.types[type] } })
                }
              />
              <span className="h-3 w-3 rounded-sm" style={{ background: meta.color }} aria-hidden />
              {meta.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="size" className="mt-2 block font-medium">
        Area size
      </label>
      <select
        id="size"
        className="btn mt-1 w-full justify-start"
        value={draft.size}
        onChange={(e) => setDraft({ ...draft, size: e.target.value })}
      >
        {SIZE_CLASSES.map((size) => (
          <option key={size.id} value={size.id}>
            {size.label}
          </option>
        ))}
      </select>

      <p className="mt-3 text-xs text-ink-soft">
        Change detected between {formatDate(EVENT.beforeDate)} and {formatDate(EVENT.afterDate)}.
      </p>

      <div className="mt-3 flex gap-2">
        <button type="submit" className="btn btn-primary flex-1">
          Apply
        </button>
        <button type="button" className="btn flex-1" onClick={() => apply(DEFAULT_FILTERS)}>
          Reset
        </button>
      </div>
    </form>
  )
}
