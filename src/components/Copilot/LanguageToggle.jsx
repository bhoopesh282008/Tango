const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'np', label: 'नेपाली' },
]

export default function LanguageToggle({ language, onChange }) {
  return (
    <div role="group" aria-label="Response language" className="flex">
      {LANGUAGES.map((lang, i) => (
        <button
          key={lang.id}
          type="button"
          onClick={() => onChange(lang.id)}
          aria-pressed={language === lang.id}
          className={`btn ${i === 0 ? 'rounded-r-none' : '-ml-px rounded-l-none'} ${
            language === lang.id ? 'btn-primary' : ''
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  )
}
