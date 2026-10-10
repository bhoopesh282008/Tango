// Spoken guidance, with the browser's own speech synthesis. English only: how many devices have a
// Nepali voice varies too much to rely on, and a silent or wrong voice in a rescue is worse than none.

export function speechAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'
}

// Says it now, cutting off whatever was being said: the latest instruction is the one that matters.
export function speak(text) {
  if (!speechAvailable() || !text) return false
  try {
    window.speechSynthesis.cancel()
    const utterance = new window.SpeechSynthesisUtterance(text)
    utterance.lang = 'en'
    window.speechSynthesis.speak(utterance)
    return true
  } catch {
    return false
  }
}

export function stopSpeaking() {
  if (!speechAvailable()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    // nothing was being said that could be stopped
  }
}

// "300 metres", "1.4 kilometres": rounded the way a person says it, not to the metre
export function spokenDistance(metres) {
  if (metres < 1000) {
    const rounded = metres < 100 ? Math.max(10, Math.round(metres / 10) * 10) : Math.round(metres / 50) * 50
    return `${rounded} metres`
  }
  return `${(Math.round(metres / 100) / 10).toFixed(1)} kilometres`
}

// What to say for this position on the route, and nothing that was already said. `said` is the
// memory between calls ({} to begin with) and is updated. Returns a list of sentences.
export function announcements(progress, said) {
  if (!progress) return []
  const lines = []
  if (progress.arrived) {
    if (!said.arrived) lines.push('You have arrived.')
    said.arrived = true
    return lines
  }

  const off = progress.offM > 60
  if (off && !said.off) lines.push('You are off the route.')
  said.off = off
  if (off) return lines

  const next = progress.upcoming
  if (next) {
    if (said.step !== next.startM) {
      said.step = next.startM
      said.near = false
      lines.push(`In ${spokenDistance(progress.toUpcomingM)}. ${next.text}.`)
    } else if (!said.near && progress.toUpcomingM <= 120) {
      said.near = true
      lines.push(`${next.text}.`)
    }
  }

  const water = progress.floodedAhead
  if (water) {
    const key = Math.round((progress.alongM + water.toM) / 10)
    if (water.inside && said.inside !== key) {
      said.inside = key
      lines.push('You are in a flooded stretch.')
    } else if (!water.inside && water.toM <= 400 && said.flood !== key) {
      said.flood = key
      lines.push(`Flooded stretch ahead in ${spokenDistance(water.toM)}, ${spokenDistance(water.lengthM)} long.`)
    }
  }
  return lines
}
