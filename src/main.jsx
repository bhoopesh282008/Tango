import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/geist'
import './styles/global.css'
import App from './App.jsx'
import ErrorBoundary from './components/Common/ErrorBoundary'

// Opting in now to how React Router 7 behaves, which also silences its console warnings.
const ROUTER_FLAGS = { v7_startTransition: true, v7_relativeSplatPath: true }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* The last net: if the header or layout itself fails, there is still a message and a reload button. */}
    <ErrorBoundary>
      <BrowserRouter future={ROUTER_FLAGS}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
