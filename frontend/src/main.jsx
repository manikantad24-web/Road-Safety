import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/schibsted-grotesk'
import './index.css'
import App from './App.jsx'
import { AdminProvider, SourceProvider, ToastProvider } from './context.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SourceProvider>
          <AdminProvider>
            <App />
          </AdminProvider>
        </SourceProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
