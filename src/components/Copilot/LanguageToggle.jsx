const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'np', label: 'नेपाली' },
]

// Two options in one outline; the chosen one is filled with ink.
export default function LanguageToggle({ language, onChange }) {
  return (
    <div role="group" aria-label="Response language" className="inline-flex rounded-[4px] border border-line p-0.5">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.id}
          type="button"
          onClick={() => onChange(lang.id)}
          aria-pressed={language === lang.id}
          className={`min-h-[36px] rounded-[3px] px-3.5 text-sm font-medium transition-colors duration-150 ${
            language === lang.id ? 'bg-primary text-[color:var(--on-primary)]' : 'text-ink-soft hover:bg-[var(--surface-2)] hover:text-ink'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  )
}
