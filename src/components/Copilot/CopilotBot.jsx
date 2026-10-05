import { Bot } from 'lucide-react'
import { Link } from 'react-router-dom'

// The way into the copilot from the dashboard: a labelled button, kept in reach while scrolling.
export default function CopilotBot() {
  return (
    <Link
      to="/copilot"
      className="btn no-print fixed bottom-5 right-5 z-[999] h-11 gap-2 border-[var(--border-strong)] px-4 shadow-md"
    >
      <Bot size={17} aria-hidden />
      <span>
        Copilot<span className="sr-only">: open the situation-report copilot</span>
      </span>
    </Link>
  )
}
