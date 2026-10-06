import { CheckCircle2, CircleAlert, X } from 'lucide-react'
import { useEffect } from 'react'
import { useUIStore } from '../../store/uiStore'

// An error is worth reading twice; a confirmation is not.
const SHOWN_FOR = { success: 3500, error: 8000 }

function Toast({ toast }) {
  const removeToast = useUIStore((s) => s.removeToast)

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), SHOWN_FOR[toast.type] ?? SHOWN_FOR.success)
    return () => clearTimeout(timer)
  }, [toast.id, toast.type, removeToast])

  const isError = toast.type === 'error'
  return (
    <div
      className="card flex items-center gap-2 py-2 pl-3 pr-1.5 text-sm shadow-lg"
      role={isError ? 'alert' : 'status'}
    >
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
        className="-my-1.5 ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-surface-alt"
      >
        <X size={14} aria-hidden />
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
