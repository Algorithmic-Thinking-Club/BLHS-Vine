// The real, labeled BLHS campus SECTIONS — the unit of the section-by-section build.
//
// Each section is one recognizable part of the real campus. We build them ONE AT A TIME to the bar,
// each grounded 1:1 in the aerial + civil data + real BLHS photos (big things always 1:1; only the
// smallest details lean on grounded creativity when truth genuinely is not recoverable).
//
// IMPORTANT (sequence): the LABELS + scope below are set, but the exact
// `bounds` (tile rects) are deliberately TBD until the GEO-CORRECT v3 overlay is verified against the
// aerial and APPROVED. We do NOT pin section bounds onto an unverified canvas. After the overlay is
// approved, `bounds` is filled from the corrected campus.geo (footprints/fields/parking/etc.), shown
// for approval, and only THEN do we build. Status tracks each section through that pipeline.
//
// Rendered by the EDIT mode of the View/Edit toggle as a faint labeled boundary (read-only review tool).

export type SectionStatus =
  | 'bounds-tbd'      // label set; tile bounds await the approved geo overlay
  | 'bounds-set'      // explicit tile bounds defined from the corrected geo, awaiting approval
  | 'approved'        // bounds approved; cleared to build
  | 'building'        // actively being built to the bar
  | 'done'            // passed the screenshot-scrutinize gate vs the gold standard

// Tile-rect bounds [tx0, ty0, tx1, ty1] in the 3 ft/tile campus grid. null until set from the verified geo.
export type TileRect = [number, number, number, number]

export type Section = {
  id: string
  label: string
  blurb: string            // what real BLHS part this is (drives the 1:1 sourcing)
  bounds: TileRect | null
  status: SectionStatus
}

// <=10 sections: north/south lots, football/track, tennis, softball, portables,
// building core, courtyards, commons frontage, ten or fewer. My division:
export const SECTIONS: Section[] = [
  { id: 'football-track', label: 'Football & Track', blurb: 'Stadium: turf field, red track, blue bleachers, press box (NW). ~same footprint as the building core.', bounds: [104, 356, 260, 498], status: 'building' },
  { id: 'building-core', label: 'Building Core', blurb: 'The dense central academic complex (classrooms, gym, library). Small + dense, NOT the largest area. Placeholder facades until the A-series.', bounds: null, status: 'bounds-tbd' },
  { id: 'courtyards', label: 'Courtyards', blurb: 'The band-room courtyard + interior plazas carved into the building: concrete flatwork, gym wall enclosure, stairs, brick gate.', bounds: null, status: 'bounds-tbd' },
  { id: 'commons-frontage', label: 'Commons Frontage', blurb: 'Main entrance / Welcome Center frontage + the entry drive loop and roundabout. The arrival experience.', bounds: null, status: 'bounds-tbd' },
  { id: 'north-lot', label: 'North Lot & Transportation', blurb: 'The north parking lot + the bus/transportation area (marked stalls, drive aisles, bus loop).', bounds: null, status: 'bounds-tbd' },
  { id: 'south-lot', label: 'South Lot', blurb: 'The south/southeast student+visitor parking lot (marked stalls, cars in stalls).', bounds: null, status: 'bounds-tbd' },
  { id: 'portables', label: 'Portables', blurb: 'The portable-classroom cluster behind the buildings, in front of the transportation area.', bounds: null, status: 'bounds-tbd' },
  { id: 'tennis', label: 'Tennis Courts', blurb: 'The tennis court bank (real net lines, fencing).', bounds: null, status: 'bounds-tbd' },
  { id: 'diamonds', label: 'Softball & Baseball', blurb: 'The ball diamonds (E/SE): infield dirt, base paths, backstops, outfield.', bounds: null, status: 'bounds-tbd' },
  { id: 'grounds-frame', label: 'Grounds & Frame', blurb: 'The lawns, walkways, treelines, and forested property frame that tie the campus together (the non-built connective tissue + edge).', bounds: null, status: 'bounds-tbd' },
]

export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id)
