import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { ThemeProvider } from './lib/theme'
import { AuthProvider } from './lib/auth'
import { seedIfEmpty } from './lib/db'
import './lib/registerDemo' // demo report builderni ulaydi (DEMO rejim uchun)

// DEMO rejimda boshlang'ich ma'lumotlarni yaratish
seedIfEmpty()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
