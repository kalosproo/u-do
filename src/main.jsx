import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthProvider.jsx'
import { ThemeProvider } from './context/ThemeProvider.jsx'
import { FocusProvider } from './context/FocusProvider.jsx'
import { StudyRoomProvider } from './context/StudyRoomProvider.jsx'
import { installGlobalErrorReporting } from './services/errorReporting'
import './services/install'

installGlobalErrorReporting()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <FocusProvider>
          <StudyRoomProvider>
            <App />
          </StudyRoomProvider>
        </FocusProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
