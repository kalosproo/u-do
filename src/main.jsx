import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthProvider.jsx'
import { ThemeProvider } from './context/ThemeProvider.jsx'
import { FocusProvider } from './context/FocusProvider.jsx'
import { installGlobalErrorReporting } from './services/errorReporting'

installGlobalErrorReporting()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <FocusProvider>
          <App />
        </FocusProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
