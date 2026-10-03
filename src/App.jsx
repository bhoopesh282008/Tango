import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Spinner from './components/Common/Spinner'
import MainLayout from './components/Layout/MainLayout'
import SplashScreen from './components/Splash/SplashScreen'
import { useUIStore } from './store/uiStore'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CopilotPage = lazy(() => import('./pages/CopilotPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
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

export default function App() {
  const [entered, setEntered] = useState(hasEntered)
  const darkMode = useUIStore((s) => s.darkMode)

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
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
    <MainLayout>
      <Suspense fallback={<Spinner label="Loading" />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/copilot" element={<CopilotPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/404" element={<ErrorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </MainLayout>
  )
}
