import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// No StrictMode: it double-invokes effects in dev, which races/poisons the Pixi canvas's async
// asset loads (the engine owns one long-lived WebGL context, not idempotent React state).
createRoot(document.getElementById('root')!).render(<App />)
