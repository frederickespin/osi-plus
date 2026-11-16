import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { bootstrapMt01b2Frontend } from './lib/mt01b2FrontendBootstrap.ts'

void bootstrapMt01b2Frontend()

document.addEventListener('focusin', (event) => {
  const field = event.target
  if (!(field instanceof HTMLInputElement) || field.type !== 'number' || field.disabled || field.readOnly) return
  window.requestAnimationFrame(() => {
    if (field.isConnected) field.select()
  })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
