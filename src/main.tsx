import { createRoot } from 'react-dom/client'
import App from './App'
import { initCaptain } from './game/captain'
import './styles.css'
import './app/theme.css'

// No StrictMode: it double-invokes effects in dev, which races/poisons the Pixi canvas's async
// asset loads (the engine owns one long-lived WebGL context, not idempotent React state).
initCaptain() // ?captain=thor unlocks Ash's god tools, once per device
createRoot(document.getElementById('root')!).render(<App />)
