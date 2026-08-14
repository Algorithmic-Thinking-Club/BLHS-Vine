// dev-only wrapper: the painted-scene runtime on the reference stand-in image
import PaintedScene from './PaintedScene'
import { TOWN_SQUARE_DEMO } from './scenes'

export default function PaintDemo() {
  return <PaintedScene spec={TOWN_SQUARE_DEMO} />
}
