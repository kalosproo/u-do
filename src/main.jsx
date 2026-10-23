import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/adhd.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthProvider.jsx'
import { ThemeProvider } from './context/ThemeProvider.jsx'
import { FocusProvider } from './context/FocusProvider.jsx'
import { StudyRoomProvider } from './context/StudyRoomProvider.jsx'
import { AdhdProvider } from './context/AdhdProvider.jsx'
import { installGlobalErrorReporting } from './services/errorReporting'
import './services/install'

installGlobalErrorReporting()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <AdhdProvider>
          <FocusProvider>
            <StudyRoomProvider>
              <App />
            </StudyRoomProvider>
          </FocusProvider>
        </AdhdProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
