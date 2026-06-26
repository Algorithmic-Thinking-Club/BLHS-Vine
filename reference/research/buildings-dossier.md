# BLHS Buildings Dossier — Visual & Material Inventory

> Deep visual/material reference for the pixel-art campus. Goal: let an artist or a
> diffusion pipeline render each BLHS structure with the RIGHT materials and colors.
> Compiled 2026-06-24. Sources cited inline. Confidence flagged where it matters.

## How to read this
- **Ground truth (highest confidence):** the local EMA (Erickson McGovern Architects) and
  Doug Walker (PAC) professional photos in `reference/campus-exterior/` and
  `reference/campus-interior/`. These were studied directly. Color/material notes drawn from
  them are marked **[photo]**.
- **Documented (high confidence):** named product specs and architect/contractor facts (AEP
  Span panel colors, square footage, seat counts). Marked **[spec]** / **[doc]**.
- **Inferred (medium):** consistent campus-wide patterns extended to buildings not in the
  local photo set. Marked **[inferred]** — treat as a strong default, not a certainty.
- **Unknown:** called out explicitly. Do NOT invent detail for these.

---

## 0. Campus-wide facts & palette (the master reference)

**Identity / facts**
- Bonney Lake High School, **10920 199th Ave Ct E, Bonney Lake, WA 98391** (the "10920" address
  is confirmed on the PAC building sign **[photo]**; some listings show the PAC's own number, and
  older records cite a 192nd-area address — treat 10920 199th Ave Ct E as current). [Wikipedia]
- **Opened Sept 2005**, grand opening Dec 6 2005. **~49-acre campus, ~207,539 SF** of building.
  Original build 186,320 SF (2006) + 2011 addition; PAC added 2019. [sumnersd.org improvements; EMA]
- Architect of the main school + PAC: **Erickson McGovern Architects**. PAC general contractor:
  **Berschauer Group**. PAC structural: PCS Structural. [EMA, Berschauer, PCS]
- Enrollment ~1,640–1,676. Mascot **Panthers**. Brand colors **teal & black** (+ white).
  District: **Sumner-Bonney Lake SD** (Wikipedia still says "Sumner School District / 3A"; the
  district was renamed and athletics is now **4A South Puget Sound League** — use the newer facts).
- **2024 bond (future, not built yet):** 10-classroom addition, new **Welcome Center / front
  entrance**, expanded CTE, multi-use turf fields (baseball/fastpitch), PAC stage-lighting upgrade,
  new parking + Mountain View MS/BLHS intersection. Design 2025-26, construction 2026-28, done
  Fall 2028. [blhs.sumnersd.org/construction; sumnersd 2024 bond] → render as "planned," not present.

**THE MATERIAL PALETTE (this is the load-bearing part).** Confirmed against the EMA/Walker photos:

| Material | Where | Exact color read |
|---|---|---|
| **Aged red brick** | Wainscot/base of nearly every building, entry piers, PAC main wall | Muted brick red, slightly brownish, weathered — NOT bright fire-engine red. Standard running bond with darker mortar. **[photo]** |
| **Buff / sand masonry band** | A lighter accent course banding the brick (sills, water table, pier caps) | Pale tan / buff CMU or cast stone, sometimes a rougher split-face texture. Reads sandy-beige. **[photo]** |
| **Warm-white→caramel corrugated metal siding** | The big upper wall planes on every building (the dominant "skin") | Warm off-white / parchment with a faint warm (greige/tan) cast. **NOT yellow.** Vertical-ribbed (corrugated) profile, strong vertical shadow lines. **[photo]** Product on PAC = **AEP Span HR-36, "Cool Parchment."** **[spec]** |
| **Cool gray corrugated metal** | Accent masses: PAC flytower, some gym/upper volumes, fascias | Medium-to-dark cool gray (zinc). PAC flytower = **AEP Span HR-36 "Cool Zinc Gray."** **[spec]** A warm dark-brown/bronze fascia band also appears on the commons. **[photo]** |
| **Caramel/orange metal accent** | PAC entry tower fascia, some upper trim (newer 2019 work) | A warm caramel/burnt-orange metal accent appears on the PAC near the glass tower. **[photo]** Use sparingly — it's a PAC-era accent, not campus-wide. |
| **Dark gray roofs** | All sloped roofs | Dark charcoal-gray standing-seam / metal roofing on shed + gable forms. **[photo]** |
| **Aluminum-framed glazing** | Clerestories, entry curtain walls, stair towers | Clear/blue-green glass in **silver/clear-anodized aluminum** mullions (NOT black, NOT teal). Big 2-story curtain-wall grids at major entries. **[photo]** |
| **Concrete** | Plazas, stairs, ramps, retaining walls, planter curbs | Standard light-gray broom-finish concrete; board-form / smooth retaining walls on the sloped site. **[photo]** |
| **Steel rails / site furniture** | Ramps, benches | Galvanized/gray steel pipe rail; **wood-slat benches** (caramel wood). **[photo]** |

**Form language (applies to almost every building):**
- One-to-two stories. **Shed roofs** (single-slope, the signature move) and **gable roofs**, both
  dark gray, with deep overhangs and **clerestory window strips** under the high side of the shed.
- **Entry move:** brick piers + a flat or shed canopy over the door, often with a buff-band cap and
  small square accent tiles in the brick piers. **[photo, ema-01/ema-02]**
- Site is **sloped** — buildings step down a hillside; lots of concrete retaining walls, exterior
  stairs, and ramps tie levels together. Evergreens (PNW Douglas fir) and red ornamental maples ring
  the campus. **[photo, ema-03/ema-05/ema-stairs]**

---

## 1. Commons / Cafeteria (the hub) — GROUND TRUTH [photo]

The architectural heart: a **two-story commons** that all the "small learning communities" radiate
from. Doubles as a performance/assembly space; ringed by "storefronts" (student-run BECU credit-union
branch + ATM, career center, ASB office, culinary food court). [EMA]

- **Stories:** 2.
- **Roof:** large **gable**, dark gray, with a clerestory monitor/dormer of windows along the ridge
  letting light into the upper commons. **[photo, ema-05]**
- **Walls:** warm-white corrugated metal on the big upper gable; **red-brick base**; a distinctive
  **warm dark-brown/bronze horizontal fascia band** across the entry face. **[photo, ema-05]**
- **Main entrance:** centered under the gable — a recessed glazed entry with brick piers; broad
  concrete plaza + lawn allée of young trees leading straight in. **[photo, ema-05]**
- **Interior:** big open volume, two levels, an open **staircase**, exposed structure, clerestory
  daylight; warm + bright. **[photo, ema-interior conceptually]**
- Distinctive: this is the "front door" feel of the school until the 2024 Welcome Center is built.

## 2. Learning Communities / Classroom wings (300 / 400 / 500) — [photo]+[inferred]

The academic wings. Design = "five classrooms around a central project area + group-work office +
shared faculty office," repeated as modular **learning communities** radiating off the commons. [EMA]
The wings are **numbered** (the "**500 building**" is named in district docs re: re-piping; expect
**300/400/500** signage). Lecture halls here were later converted to standard classrooms w/ security
vestibule + card access. [sumnersd improvements]

- **Stories:** 2 (some step to 1 on the slope). **[photo, ema-interior shows 2-story wings stepping
  down a landscaped hillside with exterior stairs]**
- **Roof:** **shed** roofs, dark gray, deep overhang, **clerestory strip** under the high edge.
  **[photo]**
- **Walls:** warm-white corrugated metal upper + **red-brick wainscot** + buff band; punched
  square/2-over-2 windows in aluminum frames, plus **louver vents** (mechanical) set into the metal.
  **[photo, ema-02]**
- **Entrances:** the **brick-pier porch** entries — paired brick columns carrying a shed canopy,
  square accent tiles in the piers, gray steel doors. This is THE repeating BLHS entry motif.
  **[photo, ema-01, ema-02]**
- Exterior **steel-and-concrete stairs** connect the upper/lower wings on the slope. **[photo,
  ema-interior]**

## 3. Science / STEM labs — [inferred]

No dedicated photo. BLHS runs Project Lead The Way + AP sciences. Almost certainly housed within the
learning-community wings (no separate signature science building visible in the photo set).
→ Render as a learning-community wing (section 2 materials); distinguish only by interior lab
casework if an interior is needed. **Uncertain whether it's a standalone mass — do not invent one.**

## 4. Library / Media Center — [inferred]

No dedicated exterior photo. Typically off the commons in this plan type. Expect a larger glazed
reading room (clerestory daylight) within the core, same palette. **Exact location/form unknown —
flag as inferred; likely adjacent to the 2-story commons.**

## 5. Culinary Arts — [doc]+[inferred]

The **culinary program operates the food court** off the commons "storefronts." [EMA] So culinary is
**embedded in the commons block**, not a separate building. Render as a storefront/kitchen bay facing
the commons interior. Strong culinary + arts programs noted by the school. [Niche]

## 6. Performing Arts Center (PAC) — GROUND TRUTH [photo, the best-documented building]

Standalone **2019** building at the **north edge** of campus, connected back to the main school by a
covered walk. **15,344–15,523 SF, ~550-seat** auditorium (full fly loft, portable acoustic shells,
catwalks, green room, set shop, dressing rooms, grand lobby). Address sign reads **"PERFORMING ARTS
CENTER 10920."** [EMA, Berschauer, PCS, walkerphoto]

- **Stories:** 1 tall volume (auditorium) + a **tall flytower** rising above the stage.
- **Roof:** low **gable** over the lobby/house; **flat-topped flytower** box.
- **Walls (exact):**
  - **Red brick** main body wall (the "PERFORMING ARTS CENTER 10920" wall), with a **buff
    split-face CMU base course**. **[photo, pac-lobby-entry]**
  - **Warm-white corrugated metal** ("**Cool Parchment**," AEP Span HR-36) on the upper house walls.
    **[spec + photo, pac-east-connection]**
  - **Cool gray corrugated metal** ("**Cool Zinc Gray**," AEP Span HR-36) on the big **flytower box**
    — clearly darker/cooler than the parchment, vertical-ribbed. **[spec + photo, pac-west-elevation]**
- **Entrance:** a dramatic **2-story glass curtain-wall tower** in **silver aluminum** mullions,
  capped by a **canted shed canopy** that cants outward; glass doors; broad concrete entry plaza,
  flagpole, brick seat-walls. Up-lit brick at night (warm uplights between brick pilasters).
  **[photo, pac-east-elevation, pac-sunset, pac-lobby-dusk]**
- **Window pattern:** full curtain-wall glazing across the lobby front; otherwise mostly solid
  masonry/metal (it's an auditorium). A small caramel/orange metal accent appears near the glass
  tower top. **[photo]**
- **Interior:** dark "black-box" auditorium — charcoal walls, **gray upholstered seats**, raked
  seating, **warm wood acoustic panels** (caramel wood waves) on walls/ceiling, blue stage uplight,
  catwalk grid overhead, side balcony rails. Wood-slat ceiling clouds. **[photo, pac-auditorium]**
- **Lobby:** bright, glassy, terrazzo/polished floor, the wood + monochrome scheme continues. **[photo]**
- Distinctive landmark feature near the entry plaza: a **large turquoise/teal faceted dome sculpture**
  (a "geodesic" art piece) sits on the lawn by the PAC entrance. Great recognizable map landmark.
  **[photo, pac-sunset / pac-lobby-dusk]**

## 7. Main Gym (primary gymnasium) — [photo, partial]+[inferred]

The **largest roof masses** in the EMA wide shots are the gym volumes (big windowless spans).
**[photo, ema-03 background shows a very large gray-metal high-bay volume]**

- **Stories:** tall 1-story (high-bay, ~2.5 stories of height).
- **Roof:** broad **shed or low-gable**, dark gray.
- **Walls:** large planes of **corrugated metal** (warm-white and/or cool gray) over a **red-brick
  base**; **clerestory window strip** high up for daylight; few low windows (gym). **[photo, ema-03]**
- **Entrance:** expect a brick-pier entry / lobby connecting to locker rooms; main-gym lobby likely
  near the commons. Has a **scoreboard, locker rooms** (per facility-use desc.). **[doc]**
- Use this as the "indoor athletics" landmark — big simple metal box, brick skirt, dark roof.
- **Exact glazing pattern + entry location not photo-confirmed — inferred.**

## 8. Auxiliary Gym — [doc]+[inferred]

A **second, smaller gym** exists (district facility-rental category "Auxiliary Gym": basketball/
volleyball practice + games, locker rooms, scoreboard). Typically shares a wall with / sits beside
the main gym. Render as a **smaller version of the main gym** mass, same materials. **[inferred —
note: the Facilitron page that surfaced was North Tapps MS's aux gym, NOT BLHS; BLHS having an aux
gym is consistent with a 4A school but treat the specifics as inferred.]**

## 9. JROTC — [doc]+[inferred]

Active **JROTC** program (drill, color guard, rocketry, PT; joint with Sumner HS). [BLHS clubs] No
dedicated building visible; almost certainly classroom(s) + a drill space within a wing. → Render as
a learning-community wing; signage/flags as the differentiator. **No standalone structure confirmed.**

## 10. Welcome Center / Main Entrance / Student Services — [doc, FUTURE]

A **dedicated Welcome Center + new front entrance** is part of the **2024 bond (2026-28 build, not
yet present)**. [blhs construction] Today the entry/admin is at the commons; a **new exterior stair
outside the admin offices** + **security vestibule (card access)** were added in the improvements
round. [sumnersd improvements] → For a "present-day" map, route the main entrance through the
commons; for a "future" map, add the Welcome Center. Materials will match the campus palette.

## 11. Stadium — grandstand + press box — [doc]+[inferred]

BLHS Stadium (Panther football/soccer/track). Received a **new covered grandstand with a press box**;
the old open bleachers were salvaged and moved to Lakeridge MS. [sumnersd improvements] This is a
distinct athletics zone, separate from the academic core.

- **Grandstand:** modern **covered** aluminum bleachers — raked metal seating under a **shed/canopy
  roof** on steel columns (dark gray roof to match campus). **[inferred from "covered grandstand"]**
- **Press box:** a boxy elevated booth atop the grandstand, glazed front, likely metal-panel clad in
  campus parchment/gray. **[inferred]**
- **Field:** football/soccer field + track; team is **4A SPSL**. 2024 bond adds **multi-use turf
  fields** (baseball/fastpitch) nearby (future). [sumnersd]
- **Concessions:** a small concessions/restroom building typically anchors the stadium plaza
  (standard for the site). **Not photo-confirmed — inferred; do not over-detail.**
- **Exact press-box/grandstand colors not photo-confirmed.** Safe default: campus dark-gray roof +
  parchment/gray metal + concrete + teal/black Panther graphics on the press box.

## 12. Portables — [inferred]

The school is **overcrowded** (hallway flex space used for classrooms; 10-classroom addition coming),
which strongly implies **portable classrooms** on site — standard SBLSD beige modular boxes (low-slope
roof, ramp + skirting, small windows), parked at a campus edge/parking area. **Presence is a
reasonable inference from the overcrowding docs; exact count/location unknown — render generic.**

---

## Photo asset index (local ground truth)

**Exterior** (`reference/campus-exterior/`)
- `ema-01.jpg` — learning-community wing, the brick-pier shed-canopy entry (THE entry motif), buff band, warm-white corrugated metal, dark roof. **Best entry-detail ref.**
- `ema-02.jpg` — wing side: corrugated metal + brick + louvers + ramp/benches; brick-pier porch from the side.
- `ema-03.jpg` — wide campus view: shed-roof wings stepping the slope + large gray gym mass behind + 2-story brick/glass entry; evergreens. **Best massing/context ref.**
- `ema-05.jpg` — the **commons** front: big gable, ridge clerestory, brown fascia band, tree allée plaza. **Best commons ref.**
- `ema-courtyard.jpg` — slope condition: concrete retaining walls, exterior stair to upper level, brick + metal wing.
- `pac-east-elevation.jpg` — PAC entry: glass tower + canted canopy + parchment metal + brick, US flag. **Best PAC hero.**
- `pac-west-elevation.jpg` — PAC **flytower** (Cool Zinc Gray box) + parchment lower + brick base. **Best flytower/material-contrast ref.**
- `pac-sunset-exterior.jpg` / `pac-lobby-dusk.jpg` — PAC at dusk, warm uplit brick, the **teal dome sculpture** landmark.
- `pac-east-connection.jpg` — PAC where it meets the main school; brick-pier canopy + parchment metal + gray accent.

**Interior** (`reference/campus-interior/`)
- `ema-interior.jpg` — 2-story wings on the hillside w/ exterior steel stair (exterior-ish massing).
- `ema-stairs.jpg` — wing wall closeup: corrugated metal + brick + buff band + concrete retaining wall + glazing.
- `pac-auditorium.jpg` — auditorium interior: gray seats, wood acoustic waves, catwalks, blue uplight. **Best interior-theater ref.**
- `pac-lobby-entry.jpg` / `pac-lobby-morning.jpg` — PAC lobby + the brick "PERFORMING ARTS CENTER 10920" wall + glass tower.
- `pac-stage-seating.jpg` — stage + raked seating.

## Open gaps / get-these-photos-next (to remove "inferred" tags)
1. **Main gym + aux gym exteriors** (entry, glazing) — only seen as background mass.
2. **Stadium grandstand + press box** straight-on (colors, Panther graphics).
3. **Science/STEM, library/media, JROTC** — confirm whether any are standalone vs. inside wings.
4. **Numbered wing signage (300/400/500)** to map which wing is which.
5. **Portables** location/count.
6. A clean **aerial/site plan** to lock relative positions (Latitude Image has one; cert error on
   fetch — grab manually). Best mining sources next: Google Street View on 199th Ave Ct E,
   Instagram/Facebook @bonneylakehs game-day stadium posts, MaxPreps facility photos.

## Sources
- EMA main school: https://www.ericksonmcgovern.com/bonney-lake-hs
- EMA PAC: https://www.ericksonmcgovern.com/pac-bonney-lake
- SBLSD improvements (stadium, sqft, acreage): https://www.sumnersd.org/about-us/overview/construction/projects/bonney-lake-high-school-improvements
- SBLSD PAC: https://www.sumnersd.org/about-us/overview/construction/projects/bonney-lake-high-school-pac
- BLHS construction / 2024 bond: https://blhs.sumnersd.org/construction
- AEP Span panel spec (Cool Parchment + Cool Zinc Gray, HR-36): https://www.aepspan.com/projects/bonney-lake-high-school-performing-arts-center/
- Berschauer Group PAC: https://www.berschauergroup.com/portfolio/bonney-lake-high-school-performing-arts-center/
- Doug Walker PAC photo essay: https://www.walkerphoto.com/blog/bonney-lake-high-school-performing-arts-center
- Wikipedia (facts, caveats on district/classification): https://en.wikipedia.org/wiki/Bonney_Lake_High_School
- Athletics (4A SPSL): https://blhspanthersathletics.com/
- BLHS clubs (JROTC, culinary): https://blhs.sumnersd.org/activities/clubs-activities/co-curricular-clubs
- Local ground-truth photos: reference/campus-exterior/, reference/campus-interior/ (EMA + Doug Walker)
