// Switching between the run's real data and the bundled demo dataset, from the header.
//
// The data mode is fixed when the page loads (see apiConfig), so a switch is remembered in this
// browser and the page is loaded again, like a change of area: nothing from the other source can
// stay on screen.
import { SOURCE_KEY } from './apiConfig'

export function setDataSource(source) {
  try {
    if (source === 'demo') localStorage.setItem(SOURCE_KEY, 'demo')
    else localStorage.removeItem(SOURCE_KEY)
  } catch {
    return false // storage blocked: the choice could not be kept, so nothing is reloaded
  }
  window.location.reload()
  return true
}
