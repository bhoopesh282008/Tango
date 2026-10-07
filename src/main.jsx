import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/geist'
import './styles/global.css'
import App from './App.jsx'
import ErrorBoundary from './components/Common/ErrorBoundary'

// Opting in now to how React Router 7 behaves, which also silences its console warnings.
const ROUTER_FLAGS = { v7_startTransition: true, v7_relativeSplatPath: true }

// Where the site lives on its host: '/' normally, '/Tango/' on GitHub Pages (set by VITE_BASE).
// The router wants it without the trailing slash.
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* The last net: if the header or layout itself fails, there is still a message and a reload button. */}
    <ErrorBoundary>
      <BrowserRouter basename={BASENAME} future={ROUTER_FLAGS}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
