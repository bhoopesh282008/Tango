import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { APP } from '../utils/constants'

const TITLES = {
  '/': 'Dashboard',
  '/copilot': 'Copilot',
  '/about': 'Method and limitations',
  '/report': 'Situation report',
}

// Page changes inside the app do not reload the page, so the things a reload does for free
// are done here: the tab title names the page, the view starts at the top, and keyboard and
// screen-reader focus moves to the new content instead of staying on the link that was used.
export function useRouteChange() {
  const { pathname } = useLocation()
  // Compared with the page already shown, not a "first run" flag: StrictMode runs effects
  // twice on load in development, and the second run would look like a page change.
  const shown = useRef(pathname)

  useEffect(() => {
    document.title = `${TITLES[pathname] ?? 'Page not found'} · ${APP.name} ${APP.subtitle}`
    if (shown.current === pathname) return
    shown.current = pathname
    window.scrollTo?.(0, 0)
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [pathname])
}
