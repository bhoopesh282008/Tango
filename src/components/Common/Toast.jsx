import { CheckCircle2, CircleAlert, X } from 'lucide-react'
import { useEffect } from 'react'
import { useUIStore } from '../../store/uiStore'

function Toast({ toast }) {
  const removeToast = useUIStore((s) => s.removeToast)

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), 3500)
    return () => clearTimeout(timer)
  }, [toast.id, removeToast])

  const isError = toast.type === 'error'
  return (
    <div className="card flex items-center gap-2 px-3 py-2 text-sm shadow-lg" role="status">
      {isError ? (
        <CircleAlert size={18} className="shrink-0 text-critical" aria-hidden />
      ) : (
        <CheckCircle2 size={18} className="shrink-0 text-success" aria-hidden />
      )}
      <span>{toast.msg}</span>
      <button
        type="button"
        onClick={() => removeToast(toast.id)}
        aria-label="Dismiss"
        className="ml-1 p-1 text-ink-soft"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export default function ToastHost() {
  const toasts = useUIStore((s) => s.toasts)

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-16 z-[1300] flex flex-col items-center gap-2 px-3">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} />
        </div>
      ))}
    </div>
  )
}
