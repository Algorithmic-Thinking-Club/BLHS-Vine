import { createRoot } from 'react-dom/client'
import App from './App'
import { initCaptain } from './game/captain'
import './styles.css'
import './app/theme.css'

// No StrictMode: it double-invokes effects in dev, which races/poisons the Pixi canvas's async
// asset loads (the engine owns one long-lived WebGL context, not idempotent React state).
initCaptain() // ?captain=thor unlocks Ash's god tools, once per device

// server sync (§7.7): pull the newer save if one exists upstream, then push on every write.
// Both no-op silently until a database is configured — the local save stays the truth.
import('./game/net').then(({ startStateSync, pullState }) => { startStateSync(); void pullState() })

// Preload BOTH game faces before anything renders. Without this, the first dialogue line
// fetches Deckhand mid-cutscene and font-display blanks the text while it loads — the
// "dialogue is empty" bug Ash hit three times (his cold cache vs our warm test browser).
for (const [family, url] of [['Harbormaster', '/fonts/Harbormaster.ttf'], ['Deckhand', '/fonts/Deckhand.ttf']] as const) {
  const face = new FontFace(family, `url(${url})`)
  face.load().then((f) => document.fonts.add(f)).catch(() => { /* fallback face carries it */ })
}

createRoot(document.getElementById('root')!).render(<App />)
