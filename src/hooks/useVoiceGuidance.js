import { useEffect, useRef } from 'react'
import { announcements, speak, stopSpeaking } from '../services/speech'
import { useRouteStore } from '../store/routeStore'

// Speaks the next instruction, a flooded stretch ahead, being off the route and arrival, once each,
// while voice guidance is on. Nothing is said when it is off.
export function useVoiceGuidance(progress) {
  const voice = useRouteStore((s) => s.voice)
  const said = useRef({})

  useEffect(() => {
    if (!voice) {
      said.current = {}
      return
    }
    const lines = announcements(progress, said.current)
    if (lines.length) speak(lines.join(' '))
  }, [voice, progress])

  // Leaving navigation (or turning the voice off) stops what is being said
  useEffect(() => stopSpeaking, [voice])
}
