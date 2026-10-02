import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ErrorPage({
  title = 'Page not found',
  message = 'The page you are looking for does not exist.',
  onRetry,
}) {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <TriangleAlert size={36} className="mx-auto text-danger" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-ink-soft">{message}</p>
      <div className="mt-4 flex justify-center gap-2">
        {onRetry && (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
        )}
        <Link to="/" className="btn">
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
