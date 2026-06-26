// The real BLHS palette. Color-picked from the exterior photos + aerial, and refined against the
// PAC material samples (reference/floorplans-maps/rendered/pac-palette.png) + the AEP Span product
// spec (HR-36 "Cool Parchment" skin, "Cool Zinc Gray" accent). Muted / desaturated PNW tones,
// NOT vivid cartoon colors. Single source of truth for tints, backgrounds, and asset grading.
export const BLHS = {
  // AEP "Cool Parchment" metal skin (the warm-neutral light siding)
  parchment: 0xc8c4b6,
  parchmentLight: 0xdedacb,
  parchmentDark: 0x9a9788,
  // AEP "Cool Zinc Gray" accent / flytower metal (dark charcoal-grey)
  zinc: 0x5c6064,
  zincLight: 0x767a7e,
  // aged red brick + buff CMU band
  brick: 0x9e745e,
  brickLight: 0xb38a73,
  brickDark: 0x5e3d31,
  mortar: 0xb0a99a,
  buffCMU: 0xb6ab93,
  // roofs (dark charcoal shed/gable) + white fascia trim
  roof: 0x36363a,
  roofLight: 0x46464a,
  fascia: 0xeae8e0,
  // glazing (aluminum-mullion curtain wall)
  glass: 0x526b79,
  glassLight: 0x93aabb,
  mullion: 0xb8bcc0,
  // hardscape
  concrete: 0xc8c6bf,
  concreteDark: 0xa8a69e,
  asphalt: 0x3a3b3f,
  asphaltLine: 0xe0dccf,
  // landscape — sampled from the real aerial (reference/floorplans-maps/aerial-esri.png).
  // BLHS grass is DARK muted PNW green, not bright cartoon green.
  grass: 0x45563e,
  grassDark: 0x364532,
  grassLight: 0x59624e,
  grassDry: 0x707760, // sun-bleached/worn patches
  turf: 0x3f5236, // athletic field, a touch greener/saturated than lawn
  // stadium (Football & Track) — sampled from blhs-stadium-dusk-cheer-team.jpg
  fieldTurf: 0x2d6b2a,    // bright uniform synthetic field green (noticeably brighter than PNW lawn)
  fieldTurfLt: 0x377d32, // mowing-stripe light band
  fieldLine: 0xe8e0d0,    // white yard/hash + lane lines
  dirt: 0x8a6b4a,
  trackRed: 0x8b3a2a, // running-track surface (terracotta polyurethane, per the dusk photo)
  trackRedLt: 0xa0492f,
  bleacherTeal: 0x2a6a8a, // grandstand riser faces (school blue-teal, lighter than brand teal)
  tree: 0x233124,
  treeMid: 0x364532,
  treeLight: 0x59624e,
  // mascot / public art (teal geodesic dome, mascot brand) — UI/landmark only, never walls
  domeTeal: 0x2f8e82,
} as const

export const WORLD_BG = 0x39402c // muted ground-frame green behind the campus
