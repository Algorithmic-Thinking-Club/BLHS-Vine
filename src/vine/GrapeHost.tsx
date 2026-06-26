import type { GrapeModule, VineServices } from './contract'
import { StandardGrape } from './StandardGrape'
import { PlainGrape } from './PlainGrape'

// Routes a grape to the right renderer for the session arm:
// - plain arm with quiz/clip content -> PlainGrape (the control), holding content constant
// - game arm -> the grape's own Component if it has one, else the config-driven StandardGrape
export function GrapeHost({ grape, services }: { grape: GrapeModule; services: VineServices }) {
  const props = { ...services, manifest: grape.manifest, content: grape.content }
  const hasContent = (grape.content.quiz?.length ?? 0) > 0 || (grape.content.clips?.length ?? 0) > 0

  if (services.mode === 'plain' && hasContent) {
    return <PlainGrape {...props} />
  }
  if (grape.Component) {
    const Custom = grape.Component
    return <Custom {...props} />
  }
  return <StandardGrape {...props} />
}
