import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { bootstrapMt01b2Frontend } from './lib/mt01b2FrontendBootstrap.ts'

void bootstrapMt01b2Frontend()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
