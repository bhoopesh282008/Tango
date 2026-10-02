import Footer from '../Common/Footer'
import Header from '../Common/Header'
import ToastHost from '../Common/Toast'

export default function MainLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-5 lg:px-6">{children}</main>
      <Footer />
      <ToastHost />
    </div>
  )
}
