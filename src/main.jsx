import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { IS_DESKTOP } from './lib/config'
import App from './App'
import './index.css'
import { ThemeProvider } from './lib/theme'
import { AuthProvider } from './lib/auth'
import { seedIfEmpty } from './lib/db'
import ErrorBoundary from './components/ErrorBoundary'
import './lib/registerDemo' // demo report builderni ulaydi (DEMO rejim uchun)

// DEMO rejimda boshlang'ich ma'lumotlarni yaratish
try { seedIfEmpty() } catch (e) { console.error('seed xatosi:', e) }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          {/* Windows ilova file:// dan ochiladi — HashRouter kerak */}
          {IS_DESKTOP ? <HashRouter><App /></HashRouter> : <BrowserRouter><App /></BrowserRouter>}
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
