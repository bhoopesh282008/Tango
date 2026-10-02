import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Spinner from './components/Common/Spinner'
import MainLayout from './components/Layout/MainLayout'
import { useUIStore } from './store/uiStore'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CopilotPage = lazy(() => import('./pages/CopilotPage'))
const ErrorPage = lazy(() => import('./pages/ErrorPage'))

export default function App() {
  const darkMode = useUIStore((s) => s.darkMode)

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
  }, [darkMode])

  return (
    <MainLayout>
      <Suspense fallback={<Spinner label="Loading" />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/copilot" element={<CopilotPage />} />
          <Route path="/404" element={<ErrorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </MainLayout>
  )
}
