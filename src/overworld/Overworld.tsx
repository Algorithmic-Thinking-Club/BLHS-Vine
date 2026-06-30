import { useEffect, useRef } from 'react'
import { startOverworld } from './water-iso'

// The overworld: the iso BLHS sea. Water is a real stylized-realistic shader
// (src/overworld/water-iso.ts) — Octopath-type living water that blends with the pixel
// world. Iso pixel-art islands + volumetric structures compose on top next.
export default function Overworld() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    let stop = () => {}
    try {
      stop = startOverworld(ref.current)
    } catch (e) {
      console.error(e)
    }
    return () => stop()
  }, [])

  return <div ref={ref} style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#0d1c22' }} />
}
