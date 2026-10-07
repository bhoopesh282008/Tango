import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Component } from 'react'

// A new deploy replaces the hashed files an open page still asks for, so a lazy page or
// chunk then fails to load. That is not a bug in the page: the fix is to reload it.
const isStaleBuild = (error) =>
  /dynamically imported module|importing a module script failed|ChunkLoadError/i.test(`${error?.name} ${error?.message}`)

// What shows where a part of the app failed. Plain links and buttons only: it must work
// when the router, the store or the layout is the thing that broke.
export function Failure({ stale = false, error, onRetry, title, message, compact = false }) {
  return (
    <div
      role="alert"
      className={`card mx-auto max-w-md p-6 text-center ${compact ? '' : 'mt-10'}`}
    >
      <TriangleAlert size={32} className="mx-auto text-danger" aria-hidden />
      <h2 className="mt-3 text-lg font-semibold">{title ?? (stale ? 'This page is out of date' : 'Something went wrong')}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {message ??
          (stale
            ? 'A newer version of the dashboard was published while this page was open. Reload to get it.'
            : 'The dashboard hit an unexpected error. Your data is not affected. Try again, or reload the page.')}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {onRetry && !stale && (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
        )}
        <button type="button" className={`btn ${stale ? 'btn-primary' : ''}`} onClick={() => window.location.reload()}>
          <RefreshCw size={16} aria-hidden /> Reload the page
        </button>
      </div>
      {error?.message && (
        <details className="mt-4 text-left text-xs text-ink-soft">
          <summary className="cursor-pointer">Technical detail</summary>
          <p className="mt-1 break-words font-mono">{String(error.message)}</p>
        </details>
      )}
    </div>
  )
}

// Catches an error thrown while rendering anything below it, so one failing part does not
// blank the whole page. `resetKey` clears the error when it changes (the route, say), and
// `fallback({ error, stale, reset })` replaces the default message.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('A part of the dashboard failed:', error, info?.componentStack)
  }

  componentDidUpdate(previous) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const stale = isStaleBuild(error)
    if (this.props.fallback) return this.props.fallback({ error, stale, reset: this.reset })
    return <Failure stale={stale} error={error} onRetry={this.reset} />
  }
}
