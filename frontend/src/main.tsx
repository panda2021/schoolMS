import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import { ThemeProvider } from './ui/theme/ThemeProvider'
import { LanguageProvider } from './i18n/LanguageProvider'
import { ToastProvider } from './ui/components/toast/ToastProvider'
import { FeatureProvider } from './ui/features/FeatureProvider'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <ToastProvider>
            <FeatureProvider>
              <App />
            </FeatureProvider>
          </ToastProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
