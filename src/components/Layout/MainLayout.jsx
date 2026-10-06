import { useRouteChange } from '../../hooks/useRouteChange'
import Footer from '../Common/Footer'
import Header from '../Common/Header'
import ToastHost from '../Common/Toast'

export default function MainLayout({ children }) {
  useRouteChange()
  return (
    <div className="flex min-h-screen flex-col" style={{ minHeight: '100dvh' }}>
      <a href="#main" className="skip-link no-print">
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 outline-none sm:px-5 lg:px-6">{children}</main>
      <Footer />
      <ToastHost />
    </div>
  )
}
