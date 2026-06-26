import type { DistrictId, GrapeModule } from './contract'

const grapes = new Map<string, GrapeModule>()

export function registerGrape(grape: GrapeModule) {
  grapes.set(grape.manifest.id, grape)
}

export function getGrape(id: string): GrapeModule | undefined {
  return grapes.get(id)
}

export function allGrapes(): GrapeModule[] {
  return [...grapes.values()]
}

export function grapesByDistrict(district: DistrictId): GrapeModule[] {
  return allGrapes().filter((g) => g.manifest.placement.district === district)
}
