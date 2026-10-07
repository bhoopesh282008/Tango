import { useLocation } from 'react-router-dom'
import { useRouteChange } from '../../hooks/useRouteChange'
import Footer from '../Common/Footer'
import Header from '../Common/Header'
import ToastHost from '../Common/Toast'

export default function MainLayout({ children }) {
  useRouteChange()
  // The dashboard is a working surface (figures and the rescue list beside a map) and uses the
  // whole window; the other pages are text and keep a readable width.
  const fluid = useLocation().pathname === '/'
  return (
    <div className="flex min-h-screen flex-col" style={{ minHeight: '100dvh' }}>
      <a href="#main" className="skip-link no-print">
        Skip to content
      </a>
      <Header />
      <main
        id="main"
        tabIndex={-1}
        className={`w-full flex-1 outline-none ${fluid ? '' : 'mx-auto max-w-7xl px-3 py-4 sm:px-5 lg:px-6'}`}
      >
        {children}
      </main>
      <Footer />
      <ToastHost />
    </div>
  )
}
