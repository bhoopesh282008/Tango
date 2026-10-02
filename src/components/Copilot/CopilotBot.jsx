import { Bot } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function CopilotBot() {
  return (
    <Link
      to="/copilot"
      title="Situation-Report Copilot"
      aria-label="Open Situation-Report Copilot"
      className="no-print fixed bottom-6 right-6 z-[999] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-transform hover:scale-110"
    >
      <Bot size={28} aria-hidden />
    </Link>
  )
}
