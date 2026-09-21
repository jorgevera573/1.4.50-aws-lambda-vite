import '@fontsource-variable/playfair-display'
import '@fontsource-variable/lora'
import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'

const root = document.getElementById('root')
if (!root) throw new Error('No se encontró el elemento #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
