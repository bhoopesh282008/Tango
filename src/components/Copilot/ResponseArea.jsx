import { formatPercent } from '../../utils/formatters'
import Spinner from '../Common/Spinner'

export default function ResponseArea({ response, loading }) {
  if (!response) {
    return (
      <div className="card flex min-h-[200px] items-center justify-center p-6 text-center text-sm text-ink-soft">
        {loading ? (
          <Spinner label="Reading satellite analysis" />
        ) : (
          'Choose a question above. Answers are assembled from the satellite analysis shown on the dashboard.'
        )}
      </div>
    )
  }

  return (
    <article className="card relative" lang={response.language === 'np' ? 'ne' : 'en'} aria-busy={loading}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="section-title">{response.title}</h2>
        {loading && <Spinner size={16} />}
      </header>
      <div
        className={`max-h-[55vh] overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed print:max-h-none ${
          loading ? 'opacity-50' : ''
        }`}
      >
        {response.answer}
      </div>
      <footer className="border-t border-line px-4 py-2 text-xs text-ink-soft" lang="en">
        Source: {response.dataSource}
        {response.confidence != null && ` · Model confidence ${formatPercent(response.confidence)}`}
      </footer>
    </article>
  )
}
