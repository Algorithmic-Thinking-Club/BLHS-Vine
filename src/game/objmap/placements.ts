// PAW HARBOR — the composition data. ONE entry per placement, verbatim from the authored
// composition ("Paw Harbor — the mole, the market row, and the brig at the pier head").
//
// COORDINATE SPACE: a 1600x1000 authored world-pixel frame. x runs right, y runs DOWN the
// screen. Sea occupies the TOP edge (small y). Every (x, y) is the sprite's FEET CONTACT
// POINT — anchor (0.5, 1.0) on the trimmed texture — so the engine y-sorts on y directly:
// larger y draws in front.
//
// SCALE LAW: the scene is authored at 11 px/ft. `scale` is the FINAL sprite multiplier
// (11 / that file's texelScale, already multiplied by the depth cheat: far x0.88, mid x1.00,
// near x1.08). Verified against the art: ship.png is 174x166 and 174*1.75 = 305 wide, which
// is exactly the "~305x291" the composition claims for the focal brig. Do NOT "fix" the
// lighthouse or the beacon reading small — that under-scale IS the aerial perspective.
//
// FLIP LAW: flip only on rocks, riprap, crates, barrels, rope coils, nets, bollards, boats
// and logs — shading local enough that mirroring does not reverse the sun. Never on a
// building, awning, lamp, statue, gate, ship or palm (house-v5 is reused twice unflipped at
// two scales for exactly this reason).

export type Layer = 'far' | 'mid' | 'near'
export type Placement = {
  file: string      // repo path; the loader strips the leading "public/"
  x: number         // authored world px, feet contact point
  y: number
  scale: number     // final sprite multiplier
  flip?: boolean
  layer: Layer
  note?: string
}

export const PLACEMENTS: Placement[] = [
  // ---- FAR (feet y 96-350): open water and the harbor mouth. The backdrop wall that closes
  // the top of the frame; nothing here has ground contact the player can reach. ----
  { file: 'public/art/intro/port/ship-sailing.png', x: 430, y: 165, scale: 1.15, layer: 'far', note: 'vessel standing out to sea; rig runs off the top of the frame to establish the far wall' },
  { file: 'public/art/island/harbor/sloop.png', x: 762, y: 118, scale: 0.5, layer: 'far' },
  { file: 'public/art/island/harbor/sloop.png', x: 906, y: 140, scale: 0.44, flip: true, layer: 'far', note: 'same sloop smaller and mirrored — two sails at different sizes read as distance, not as a pair' },
  { file: 'public/art/island/harbor/lighthouse.png', x: 138, y: 248, scale: 1.25, layer: 'far', note: 'left point landmark; deliberately under-scaled to ~7.5px/ft so it sits behind the brig in the hierarchy' },
  { file: 'public/art/island/harbor/riprap-c.png', x: 118, y: 264, scale: 0.62, layer: 'far', note: 'draws in front of the lighthouse base — the tower must look piled-on, not planted' },
  { file: 'public/art/island/harbor/riprap-c.png', x: 198, y: 252, scale: 0.5, flip: true, layer: 'far' },
  { file: 'public/art/island/harbor/riprap-a.png', x: 62, y: 258, scale: 0.55, layer: 'far' },
  { file: 'public/art/island/harbor/riprap-b.png', x: 240, y: 268, scale: 0.5, layer: 'far', note: 'its baked white foam ring is only legal here, sitting on the waterline' },
  { file: 'public/art/island/harbor/beacon.png', x: 1462, y: 256, scale: 1.05, layer: 'far', note: 'answers the lighthouse across the bay; the two verticals bracket the whole composition' },
  { file: 'public/art/island/harbor/riprap-c.png', x: 1434, y: 270, scale: 0.62, layer: 'far' },
  { file: 'public/art/island/harbor/riprap-c.png', x: 1522, y: 262, scale: 0.56, flip: true, layer: 'far' },
  { file: 'public/art/island/harbor/riprap-b.png', x: 1372, y: 252, scale: 0.52, layer: 'far' },
  { file: 'public/art/island/harbor/riprap-a.png', x: 1318, y: 240, scale: 0.46, flip: true, layer: 'far' },
  { file: 'public/art/island/harbor/riprap-c.png', x: 1588, y: 246, scale: 0.44, layer: 'far', note: 'mole continues off the right edge — never let a breakwater end inside frame' },
  { file: 'public/art/intro/port/ship.png', x: 1088, y: 344, scale: 1.75, layer: 'far', note: 'FOCAL ANCHOR. Largest silhouette in the scene (~305x291), paw sail, mast tops out near y=55. Every other element is scaled and placed relative to this.' },
  { file: 'public/art/intro/port/boat-fishing.png', x: 1240, y: 330, scale: 0.85, layer: 'far', note: "tucked behind the brig's stern; a second hull line stops the ship reading as a decal" },
  { file: 'public/art/intro/port/boat-anchored.png', x: 690, y: 228, scale: 0.85, layer: 'far' },
  { file: 'public/art/island/harbor/rowboat.png', x: 840, y: 246, scale: 0.4, flip: true, layer: 'far' },
  { file: 'public/art/intro/props/gull-fly.png', x: 520, y: 96, scale: 1, layer: 'far' },
  { file: 'public/art/intro/props/gull-fly.png', x: 1352, y: 104, scale: 0.9, layer: 'far' },
  { file: 'public/art/intro/port/pier-iso.png', x: 380, y: 330, scale: 0.46, layer: 'far', note: 'short fishing landing; steps up-right along the iso axis at (+44,-22) per segment' },
  { file: 'public/art/intro/port/pier-iso.png', x: 424, y: 308, scale: 0.46, layer: 'far' },
  { file: 'public/art/intro/port/dock-platform.png', x: 466, y: 290, scale: 0.44, layer: 'far' },
  { file: 'public/art/island/port/bollard-a.png', x: 452, y: 298, scale: 0.28, layer: 'far' },
  { file: 'public/art/island/harbor/rowboat.png', x: 506, y: 300, scale: 0.34, layer: 'far' },
  { file: 'public/art/intro/port/boat-anchored.png', x: 344, y: 316, scale: 0.7, flip: true, layer: 'far', note: 'drawn behind the landing deck so the hull is half-hidden' },

  // ---- MID (feet y 380-660): the quay itself. The walkable surface and every building. ----
  // the main pier: the same file five times, stepped (+44,-22) along the iso axis —
  // repetition is correct here, a pier IS repeated bays.
  { file: 'public/art/intro/port/pier-iso2.png', x: 946, y: 522, scale: 0.47, layer: 'mid', note: 'main pier segment 1 of 5' },
  { file: 'public/art/intro/port/pier-iso2.png', x: 990, y: 500, scale: 0.47, layer: 'mid' },
  { file: 'public/art/intro/port/pier-iso2.png', x: 1034, y: 478, scale: 0.47, layer: 'mid' },
  { file: 'public/art/intro/port/pier-iso2.png', x: 1078, y: 456, scale: 0.47, layer: 'mid' },
  { file: 'public/art/intro/port/pier-iso2.png', x: 1122, y: 434, scale: 0.47, layer: 'mid' },
  { file: 'public/art/intro/port/dock-platform2.png', x: 1176, y: 410, scale: 0.5, layer: 'mid', note: "pier head; overlaps the brig's hull so the ship reads as MOORED. This single overlap is the most load-bearing one in the scene." },
  { file: 'public/art/intro/port/dock-platform.png', x: 1224, y: 386, scale: 0.46, layer: 'mid' },
  { file: 'public/art/island/port/bollard-a.png', x: 1150, y: 402, scale: 0.3, layer: 'mid' },
  { file: 'public/art/island/port/bollard-a.png', x: 1206, y: 414, scale: 0.32, flip: true, layer: 'mid' },
  { file: 'public/art/intro/port/crates.png', x: 1136, y: 398, scale: 0.44, layer: 'mid', note: "CLUSTER 5 (shipside): cargo waiting at the brig's gangway" },
  { file: 'public/art/island/port/cargo-a.png', x: 1170, y: 392, scale: 0.38, layer: 'mid' },
  { file: 'public/art/intro/port/ropecoil.png', x: 1200, y: 404, scale: 0.34, flip: true, layer: 'mid' },
  { file: 'public/art/island/port/lantern-post.png', x: 1104, y: 430, scale: 0.8, layer: 'mid', note: 'mid-pier light; a vertical that breaks the long flat deck run' },
  { file: 'public/art/island/harbor/bollard-b.png', x: 1058, y: 470, scale: 0.5, layer: 'mid' },
  { file: 'public/art/island/port/harbor-sign.png', x: 964, y: 540, scale: 0.52, layer: 'mid', note: 'at the pier mouth, beside the gate — the label that tells you the lane leads somewhere' },

  // CLUSTER 1 — the fish quarter (x 60-350)
  { file: 'public/art/island/port/harbor-shed.png', x: 186, y: 470, scale: 1.1, layer: 'mid', note: 'CLUSTER 1 (fish quarter) anchor' },
  { file: 'public/art/island/harbor/net-rack.png', x: 96, y: 522, scale: 0.5, layer: 'mid' },
  { file: 'public/art/island/harbor/net-rack.png', x: 158, y: 546, scale: 0.46, flip: true, layer: 'mid' },
  { file: 'public/art/island/harbor/net-rack.png', x: 232, y: 534, scale: 0.52, layer: 'mid', note: 'three racks at 0.50/0.46/0.52 on a broken line, never a rank — the scale jitter is what kills the grid read' },
  { file: 'public/art/island/harbor/cargo-c.png', x: 268, y: 486, scale: 0.4, layer: 'mid', note: "fish boxes shoved against the shed's right wall — arm-reach pocket" },
  { file: 'public/art/island/harbor/cargo-c.png', x: 296, y: 500, scale: 0.36, flip: true, layer: 'mid' },
  { file: 'public/art/island/port/cargo-a.png', x: 246, y: 504, scale: 0.38, layer: 'mid' },
  { file: 'public/art/intro/port/ropecoil.png', x: 118, y: 566, scale: 0.34, layer: 'mid' },
  { file: 'public/art/island/harbor/fishing-boat.png', x: 326, y: 402, scale: 0.55, flip: true, layer: 'mid', note: 'hauled up above the tideline, bow toward the water' },
  { file: 'public/art/island/harbor/rowboat.png', x: 88, y: 596, scale: 0.36, layer: 'near' },
  { file: 'public/art/island/harbor/bollard-b.png', x: 42, y: 470, scale: 0.5, layer: 'mid' },
  { file: 'public/art/intro/props/tidepool.png', x: 112, y: 316, scale: 0.5, layer: 'far', note: 'baked pool water only reads correctly inside the wet band' },
  { file: 'public/art/island/harbor/lamp-v4.png', x: 352, y: 498, scale: 0.88, layer: 'mid', note: 'left post of the Lane C pinch' },

  // CLUSTER 2 — the market row (x 460-790)
  { file: 'public/art/island/harbor/pavilion.png', x: 598, y: 532, scale: 1, layer: 'mid', note: 'CLUSTER 2 (market) anchor — the covered heart the stalls crowd against' },
  { file: 'public/art/island/harbor/stall-a2.png', x: 468, y: 566, scale: 0.65, layer: 'mid' },
  { file: 'public/art/island/harbor/stall-b2.png', x: 692, y: 574, scale: 0.66, layer: 'mid' },
  { file: 'public/art/island/harbor/stall-a2.png', x: 546, y: 596, scale: 0.6, layer: 'mid', note: "second fruit stall pushed forward so its awning cuts across the pavilion's front post" },
  { file: 'public/art/island/harbor/stall-b2.png', x: 760, y: 548, scale: 0.62, layer: 'mid', note: 'fourth stall, up-screen and smaller; four awnings at four sizes = a row, not a repeat' },
  { file: 'public/art/island/harbor/lamp-v4.png', x: 430, y: 556, scale: 0.86, layer: 'mid', note: 'right post of the Lane C pinch' },
  { file: 'public/art/island/harbor/lamp-v4.png', x: 790, y: 580, scale: 0.9, layer: 'mid' },
  { file: 'public/art/island/harbor/bunting.png', x: 608, y: 430, scale: 0.9, layer: 'mid', note: 'strung high BEHIND the awnings (lower y = draws behind); weak asset, keep it partly occluded' },
  { file: 'public/art/intro/port/crates.png', x: 502, y: 604, scale: 0.5, layer: 'near', note: 'CLUSTER 2 arm-reach floor: produce boxes at the stall foot' },
  { file: 'public/art/intro/port/crates.png', x: 560, y: 624, scale: 0.46, flip: true, layer: 'near' },
  { file: 'public/art/island/harbor/cargo-c.png', x: 618, y: 612, scale: 0.42, layer: 'near' },
  { file: 'public/art/island/port/cargo-a.png', x: 660, y: 602, scale: 0.4, layer: 'near' },
  { file: 'public/art/island/port/cargo-a.png', x: 712, y: 616, scale: 0.36, flip: true, layer: 'near' },
  { file: 'public/art/intro/port/ropecoil.png', x: 744, y: 628, scale: 0.32, layer: 'near' },

  // CLUSTER 3 — the gate / plaza (x 840-1010)
  { file: 'public/art/island/harbor/gate-arch2.png', x: 930, y: 548, scale: 0.92, layer: 'mid', note: 'CLUSTER 3 (plaza) anchor; the walking lane threads BETWEEN its two posts onto the pier. Ground-free variant chosen over gate-arch.png.' },
  { file: 'public/art/island/harbor/panther-statue.png', x: 842, y: 620, scale: 0.74, layer: 'mid', note: "the town's mark, and the second-read focal. Overlaps the gate's left post — the key mid-plane occlusion." },
  { file: 'public/art/island/port/bell-frame.png', x: 1012, y: 596, scale: 0.55, layer: 'mid' },
  { file: 'public/art/island/port/lantern-post.png', x: 876, y: 572, scale: 0.82, layer: 'mid' },
  { file: 'public/art/island/port/lantern-post.png', x: 996, y: 560, scale: 0.78, layer: 'mid' },
  { file: 'public/art/island/harbor/bollard-b.png', x: 894, y: 636, scale: 0.52, layer: 'near' },
  { file: 'public/art/island/harbor/bollard-b.png', x: 978, y: 646, scale: 0.48, flip: true, layer: 'near' },
  { file: 'public/art/island/port/bollard-a.png', x: 938, y: 652, scale: 0.3, layer: 'near' },
  { file: 'public/art/intro/port/ropecoil.png', x: 910, y: 664, scale: 0.34, layer: 'near' },
  { file: 'public/art/intro/port/crates.png', x: 1004, y: 636, scale: 0.46, layer: 'near' },
  { file: 'public/art/island/harbor/cargo-c.png', x: 866, y: 650, scale: 0.4, flip: true, layer: 'near' },

  // CLUSTER 4 — the crane works + the houses (x 1040-1600)
  { file: 'public/art/island/harbor/crane.png', x: 1150, y: 486, scale: 1.05, layer: 'mid', note: 'CLUSTER 4 (cargo works) anchor; boom reaches out over the pier head, legs broken by the cargo stacked below' },
  { file: 'public/art/island/harbor/house-v5.png', x: 1392, y: 520, scale: 1, layer: 'mid' },
  { file: 'public/art/island/harbor/house-v5.png', x: 1548, y: 482, scale: 0.92, layer: 'mid', note: 'same house reused smaller and up-screen, NOT flipped — flipping would reverse its sun' },
  { file: 'public/art/intro/tavern.png', x: 1262, y: 706, scale: 0.94, layer: 'near', note: 'the only lit facade; its window glow is the warm point that pulls the eye back from the ship. WARNING: baked paving pad + fence — needs a stone apron under it or an alpha feather, or the rectangle will show on sand.' },
  { file: 'public/art/island/port/harbor-shed.png', x: 1476, y: 596, scale: 1, layer: 'mid' },
  { file: 'public/art/intro/port/crates.png', x: 1104, y: 530, scale: 0.5, layer: 'mid', note: 'CLUSTER 4 arm-reach floor: freight under the crane hook' },
  { file: 'public/art/intro/port/crates.png', x: 1156, y: 548, scale: 0.46, flip: true, layer: 'mid' },
  { file: 'public/art/island/port/cargo-a.png', x: 1198, y: 536, scale: 0.42, layer: 'mid' },
  { file: 'public/art/island/harbor/cargo-c.png', x: 1092, y: 560, scale: 0.44, flip: true, layer: 'mid' },
  { file: 'public/art/island/harbor/cargo-c.png', x: 1226, y: 560, scale: 0.4, layer: 'mid' },
  { file: 'public/art/island/port/cargo-a.png', x: 1140, y: 574, scale: 0.38, flip: true, layer: 'mid' },
  { file: 'public/art/intro/port/ropecoil.png', x: 1074, y: 584, scale: 0.36, layer: 'mid' },
  { file: 'public/art/island/harbor/bollard-b.png', x: 1042, y: 520, scale: 0.5, layer: 'mid' },
  { file: 'public/art/island/harbor/net-rack.png', x: 1330, y: 600, scale: 0.5, layer: 'mid' },
  { file: 'public/art/island/harbor/lamp-v4.png', x: 1176, y: 762, scale: 0.92, layer: 'near', note: 'stands IN FRONT of the tavern, breaking its facade into two panels' },
  { file: 'public/art/intro/port/crates.png', x: 1352, y: 684, scale: 0.52, layer: 'near', note: 'boxes at the tavern door — the doorstep pocket' },
  { file: 'public/art/island/harbor/cargo-c.png', x: 1408, y: 700, scale: 0.44, flip: true, layer: 'near' },
  { file: 'public/art/island/port/cargo-a.png', x: 1310, y: 730, scale: 0.44, layer: 'near' },

  // ---- NEAR (feet y 660-1050): the working foreground. Six props are pushed past y=1000 so
  // the frame CROPS them — cropped foreground is the cheapest depth cue Octopath uses. ----
  { file: 'public/art/intro/palm-a.png', x: 86, y: 968, scale: 1.06, layer: 'near', note: 'bottom-left frame post' },
  { file: 'public/art/intro/props/palm-c.png', x: 196, y: 1032, scale: 1, layer: 'near', note: 'feet BELOW the frame — crown only. Cropped foreground is the depth cue we keep skipping.' },
  { file: 'public/art/intro/props/bush-a.png', x: 142, y: 902, scale: 0.7, layer: 'near' },
  { file: 'public/art/intro/props/bush-c.png', x: 252, y: 934, scale: 0.68, flip: true, layer: 'near' },
  { file: 'public/art/intro/props/rock-a.png', x: 346, y: 826, scale: 0.55, layer: 'near', note: 'boulder narrowing the mouth of Lane C — a pinch point, not a blockage' },
  { file: 'public/art/intro/props/logdrift.png', x: 470, y: 856, scale: 0.46, flip: true, layer: 'near' },
  { file: 'public/art/intro/driftwood.png', x: 642, y: 884, scale: 0.48, layer: 'near' },
  { file: 'public/art/intro/port/crates.png', x: 884, y: 940, scale: 0.58, layer: 'near', note: "foreground freight at the near-plane scale bump; sits just outside Lane B's right wall" },
  { file: 'public/art/island/port/cargo-a.png', x: 952, y: 976, scale: 0.5, flip: true, layer: 'near' },
  { file: 'public/art/intro/port/ropecoil.png', x: 1024, y: 1012, scale: 0.42, layer: 'near', note: 'cut by the bottom edge' },
  { file: 'public/art/island/harbor/cargo-c.png', x: 860, y: 996, scale: 0.5, flip: true, layer: 'near', note: 'cut by the bottom edge' },
  { file: 'public/art/island/harbor/net-rack.png', x: 1108, y: 1040, scale: 0.6, layer: 'near', note: 'largest near-plane silhouette, cropped 40px by the bottom edge — the hanging fish read as extreme foreground' },
  { file: 'public/art/island/harbor/bollard-b.png', x: 1190, y: 900, scale: 0.58, layer: 'near' },
  { file: 'public/art/intro/props/rock-a.png', x: 1086, y: 856, scale: 0.48, flip: true, layer: 'near' },
  { file: 'public/art/intro/port/crates.png', x: 1520, y: 880, scale: 0.56, flip: true, layer: 'near' },
  { file: 'public/art/island/harbor/cargo-c.png', x: 1584, y: 922, scale: 0.5, layer: 'near', note: 'cut by the right edge' },
  { file: 'public/art/intro/props/rock-a.png', x: 1452, y: 980, scale: 0.6, flip: true, layer: 'near' },
  { file: 'public/art/intro/palm-b.png', x: 1556, y: 1024, scale: 1.08, layer: 'near', note: 'bottom-right frame post, cropped' },
  { file: 'public/art/intro/props/palm-d.png', x: 1400, y: 1044, scale: 0.98, layer: 'near', note: 'cropped; unflipped so the frond shadow stays consistent' },
  { file: 'public/art/intro/props/bush-a.png', x: 1330, y: 946, scale: 0.66, layer: 'near' },
  { file: 'public/art/intro/props/shells.png', x: 690, y: 760, scale: 1, layer: 'near' },
  { file: 'public/art/intro/props/crab.png', x: 760, y: 792, scale: 1, flip: true, layer: 'near' },
  { file: 'public/art/intro/props/pawprints.png', x: 900, y: 800, scale: 1, layer: 'near', note: 'flat decal crossing Lane B — the only thing allowed inside the walking corridor' },
  { file: 'public/art/intro/props/seaweed.png', x: 210, y: 336, scale: 0.42, layer: 'far' },
]

// ---- per-file behaviour tables (keyed by basename, so the same art behaves the same
// wherever it is placed) ----

// FLAT DECALS: art that lies ON the ground. Ground-anchored, no cast shadow, no collider.
export const DECALS = new Set(['pawprints', 'shells', 'seaweed'])

// NO COLLIDER: flyers, overhead rigging, decals, and the deck pieces. The pier planks are
// deliberately pass-through — this scene walks on the ground grid only, so a measured
// collider on a deck's front edge would read as an invisible wall along the quay.
export const NO_BLOCK = new Set([
  'gull-fly', 'bunting', 'pawprints', 'shells', 'seaweed', 'crab',
  'pier-iso', 'pier-iso2', 'dock-platform', 'dock-platform2',
])

// HULLS: art whose bottom 20% is only a keel line / a shadow edge, so a shallow base band
// collapses to a useless dot. These are measured off a DEEP band instead (BeachIso's rule).
export const HULL = new Set([
  'rowboat', 'fishing-boat', 'sloop', 'ship', 'ship-sailing', 'boat-anchored', 'boat-fishing',
  'logdrift', 'driftwood', 'crates', 'cargo-a', 'cargo-b', 'cargo-c', 'ropecoil',
  'riprap-a', 'riprap-b', 'riprap-c', 'rock-a', 'rock-b', 'tidepool',
])

// vessels + wave-washed rock get a foam collar instead of a hard cast shadow
export const AFLOAT = new Set([
  'ship', 'ship-sailing', 'sloop', 'rowboat', 'boat-anchored', 'boat-fishing', 'fishing-boat',
  'riprap-a', 'riprap-b', 'riprap-c',
])

export const basename = (file: string) => file.slice(file.lastIndexOf('/') + 1).replace(/\.png$/, '')
