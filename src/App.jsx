import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/Common/ErrorBoundary'
import Spinner from './components/Common/Spinner'
import MainLayout from './components/Layout/MainLayout'
import SplashScreen from './components/Splash/SplashScreen'
import { useUIStore } from './store/uiStore'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CopilotPage = lazy(() => import('./pages/CopilotPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const ReportPage = lazy(() => import('./pages/ReportPage'))
const ErrorPage = lazy(() => import('./pages/ErrorPage'))

// The splash is shown once per browser session, so reloads go straight to the dashboard.
const ENTERED_KEY = 'tango-entered'
function hasEntered() {
  try {
    return sessionStorage.getItem(ENTERED_KEY) === '1'
  } catch {
    return false
  }
}

// A page that fails to render shows a message in its place, with the header still usable, and
// the error is cleared when the reader goes to another page.
function RouteBoundary({ children }) {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}

export default function App() {
  const [entered, setEntered] = useState(hasEntered)
  const darkMode = useUIStore((s) => s.darkMode)

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    // The browser's own chrome (address bar on phones) follows the page background.
    const background = getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim()
    if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
  }, [darkMode])

  if (!entered) {
    return (
      <SplashScreen
        onReady={() => {
          try {
            sessionStorage.setItem(ENTERED_KEY, '1')
          } catch {
            // Storage unavailable: the splash simply shows again next load.
          }
          setEntered(true)
        }}
      />
    )
  }

  return (
    // "user": with the system's reduce-motion setting on, movement is dropped and only fades remain.
    <MotionConfig reducedMotion="user">
      <MainLayout>
        <RouteBoundary>
          <Suspense fallback={<Spinner label="Loading" />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/copilot" element={<CopilotPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/report" element={<ReportPage />} />
              <Route path="/404" element={<ErrorPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </RouteBoundary>
      </MainLayout>
    </MotionConfig>
  )
}
