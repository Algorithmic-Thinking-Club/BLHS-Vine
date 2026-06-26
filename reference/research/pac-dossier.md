# BLHS Performing Arts Center (PAC) — Deep Dossier for 3D Replica

> Single-building deep dive on the Bonney Lake High School Performing Arts Center.
> Goal: gather everything needed to model a near-perfect 1:1 3D replica.
> Compiled 2026-06-24. Every claim cited; uncertainty flagged. Do NOT invent detail beyond what's marked.

---

## 0. Identity & hard facts (high confidence)

- **Building:** Bonney Lake High School Performing Arts Center (PAC). Standalone building at the
  **north edge** of the BLHS campus, joined to the main school by a covered connection. Address sign
  on the brick reads **"PERFORMING ARTS CENTER 10920."** [EMA, PCS, photos]
- **Opened:** **Fall 2019.** Construction in 2019; grand opening **Sept 25, 2019** (~552-seat facility,
  ribbon cutting + student band/choir/drama/dance performances + self-guided tours). [sumnersd, EMA]
- **Size:** **15,523 SF** (EMA + Walker + AEP Span). District lists **15,541 SF**; Berschauer lists
  **15,344 SF**. Use **~15,500 SF** as the working number; the three sources disagree by <1.5%. [EMA/sumnersd/Berschauer]
- **Seats:** **550** (some sources say **552**). Theater seats have **tablet arms** so the house
  doubles as instruction/testing space. [EMA, sumnersd]
- **Stories:** **1 story** (single tall auditorium volume) + a **fly tower** rising above the stage.
  Construction Type **II-B**, fully sprinklered. [EMA, Berschauer]
- **Cost:** **$9,859,800** bid-award (construction). **$14.9M** total program (includes other tenant
  improvements). [EMA, sumnersd]
- **Project team:**
  - Architect: **Erickson McGovern Architects** (ericksonmcgovern.com). [EMA]
  - General contractor: **Berschauer Group Inc.** [Berschauer]
  - Structural engineer: **PCS Structural Solutions.** [PCS]
  - Metal wall panel installer: **Architectural Sheet Metal**; panel maker **AEP Span.** [AEP Span]
  - Architectural photographer: **Doug Walker** (walkerphoto.com). [Walker]
- **Program spaces:** 550-seat house, main stage + **side stage**, **full-height fly loft / rigging
  system**, **green room**, **dressing rooms**, **piano storage**, **scene/set shop**, **technical
  (control) booth**, **catwalks** linking fly loft to control room, and a **large glass lobby**.
  NOTE: **no orchestra pit** (cut for budget; offset by full-height rigging + adjustable acoustics). [EMA, Walker, sumnersd]

---

## 1. MATERIALS — per surface (the load-bearing modeling data)

Confirmed against the local Walker/EMA photos in `reference/campus-exterior/` plus the AEP Span spec.

| Surface | Material | Exact read | Source |
|---|---|---|---|
| **Main lower body wall** (the "PERFORMING ARTS CENTER 10920" wall, brick piers) | **Aged red brick**, running bond, darker mortar | Muted brownish brick-red, weathered — not fire-engine red | [photo pac-east-elevation, pac-lobby-dusk] |
| **Base course** under the brick | **Buff / sand split-face CMU** water table | Pale tan/buff, rougher texture, ~2-3 courses tall | [photo pac-east-connection] |
| **Upper house walls** (lobby gable wall, side house walls) | **AEP Span HR-36 corrugated metal, "Cool Parchment"** | Warm off-white / parchment with faint greige cast. Vertical ribs, 36" coverage, exposed-fastener | [AEP Span spec + photo] |
| **Fly tower box** (the tall windowless cube over the stage) | **AEP Span HR-36 corrugated metal, "Cool Zinc Gray"** | Medium cool gray (zinc), clearly darker/cooler than parchment, vertical ribs | [AEP Span spec + photo pac-west-elevation] |
| **Entry tower fascia / canopy accent** | **Warm caramel / burnt-orange metal** | A caramel accent band on the canted entry canopy + tower top; PAC-era accent only | [photo pac-sunset, pac-east-elevation] |
| **Sloped roofs** (lobby gable, house roof) | **Dark charcoal-gray metal roofing** | Standing-seam look, deep overhangs | [photo pac-east-connection] |
| **Entry curtain wall + storefront** | **Insulated glass in silver/clear-anodized aluminum mullions** | Clear/blue-green glass, big 2-story grid; NOT black, NOT teal mullions | [AEP/Walker "insulated glass" + photo] |
| **Plaza / walks / seat walls** | Light-gray broom-finish **concrete**; **brick seat-walls** with buff cap at the plaza | — | [photo pac-east-elevation] |
| **Night lighting** | Warm **uplights** between the brick pilasters wash the brick wall amber; pole lights on plaza | — | [photo pac-lobby-dusk] |

**AEP Span product (definitive):** **HR-36 metal wall panels**, colors **Cool Parchment** (house
walls) + **Cool Zinc Gray** (fly tower), 36" net coverage, exposed-fastened. [aepspan.com]

**Brand-color caution:** the school's teal/black is the **mascot + UI brand only**. On the PAC the
only teal object is the **freestanding turquoise geodesic dome sculpture** on the entry lawn — NOT any
wall. Do not tint walls teal.

---

## 2. MASSING — form, from each cardinal direction (for the 3D model)

The PAC reads as **three stacked/abutting volumes**, front to back:

1. **Lobby pavilion (front / EAST):** a one-story-tall glassy box with a **low-pitch gable roof** whose
   ridge runs front-to-back (perpendicular to the entry face). The gable end faces the plaza, giving a
   shallow triangular pediment over a **two-story curtain-wall** of glass. A **canted shed canopy**
   (caramel-accented) cants outward above the glass entry. To the right of the glass, the brick wall with
   "PERFORMING ARTS CENTER 10920" and a rhythm of **brick pilasters / piers** runs along the plaza.
2. **Auditorium house (middle):** a wider, taller parchment-metal volume behind the lobby holding the
   raked 550-seat house. Its roof is a **complex gable** (girder truss at the ridge, parallel-chord trusses
   off it). [PCS] Clerestory/high strip glazing is minimal — it's mostly solid (a dark theater inside).
3. **Fly tower (rear-center / behind stage):** the tallest element — a **flat-topped Cool-Zinc-Gray cube**
   rising well above the house roof, marking the stage position. Windowless, vertical-ribbed, with vertical
   tie/strap lines and roof-mounted exhaust fans at its base where it meets the house roof. [photo pac-west-elevation]

**By cardinal direction** (campus orientation: PAC entry/plaza faces roughly EAST toward the school core;
fly tower toward the WEST/back. Treat E/W as the architect's "east elevation"/"west elevation" labels —
exact true-north may differ slightly; **orientation is approximate**):

- **EAST (front / entry / "east elevation"):** The hero face. Left = the **gabled glass lobby** (2-story
  silver-mullion curtain wall under a shallow gable + canted caramel canopy). Right = the long **red-brick
  wall** with the building name and evenly spaced **brick pilasters** (~7-8 piers visible), buff split-face
  base, parchment metal above. Flagpole + US flag on the plaza; brick seat-walls; concrete plaza. Behind/above,
  the gray fly tower peeks up at the right. The teal dome sculpture sits on the lawn to the right of the plaza.
  [photo pac-east-elevation, pac-sunset, pac-lobby-dusk]
- **WEST (back / "west elevation"):** Dominated by the **Cool-Zinc-Gray fly tower cube** front-and-center,
  rising above a **parchment-metal lower house** with a brick + buff base. A **service/loading door** (roll-up,
  for the set shop) and man-doors at grade; exhaust fans on the low roof at the tower base; fire hydrants,
  parking, light poles. This is the "green room and control booth access" side. To the right, the main school's
  brick/parchment wing abuts. [photo pac-west-elevation; Walker "west elevation"]
- **NORTH & SOUTH (sides / long house walls):** Long parchment-metal flanks over a **brick + buff base**,
  punched with a few small windows/louvers; the gabled house roof slopes down to deep overhangs on these
  sides; the fly tower interrupts the roofline near the stage end. The SOUTH plaza side carries the brick-pier
  rhythm and connects to the covered walk. [photo pac-east-connection shows the angled side + roof slope]
- **The CONNECTION (toward the main school):** a **brick-pier covered walkway** (shed canopy on brick columns,
  same campus entry motif) links the PAC's south/east corner back to the existing building. [photo pac-east-connection]

**Roof forms summary (for modeling):**
- Lobby: low-pitch **gable**, ridge running front-to-back, gable end + small pediment to the plaza.
- House: larger **complex gable**, dark charcoal metal, deep overhangs.
- Fly tower: **flat top**, tallest, Cool Zinc Gray box.

**Dimensions (what's published vs. inferred):**
- Footprint: **~15,500 SF** total (published). Exact L×W **not published** — from the photos the house is
  roughly square-ish with the lobby and fly tower projecting; estimate the box at roughly **~130 ft × ~120 ft**
  overall **[INFERRED from sqft + photo proportions — do NOT treat as exact]**.
- **Fly tower height: NOT published.** Industry rule (a fly tower ~2.5× the proscenium opening height) +
  the photos suggest the tower stands roughly **2–2.5× the house eave height** (very roughly **45–60 ft**).
  **[INFERRED — flag as uncertain; measure from a known reference like the door/person scale in pac-west-elevation if precision is needed.]**
- Proscenium / stage dimensions: **NOT published.** Side stage present; full fly loft. **[unknown]**

---

## 3. INTERIOR (for completeness; secondary to the exterior replica)

- **Lobby:** bright, glassy, **monochromatic** (grays/charcoal) with **warm wood accents** and a recurring
  **"wave" pattern** motif; polished/terrazzo-look floor; the 2-story curtain wall floods it with daylight.
  [Walker]
- **Auditorium house:** dark "black-box" theater — charcoal walls, **gray upholstered seats** (with tablet
  arms), **raked** seating, **warm wood acoustic panels** (wood "wave" reflectors) on walls/ceiling,
  **blue wall-washing lights** behind angled side walls, **portable acoustical shells** + sound reflectors
  on stage, overhead **catwalk grid** + full fly rigging, control booth at the back of the house. [Walker, EMA]

---

## 4. DIRECT IMAGE URLS (verified resolvable; fetch with curl)

All URLs below returned HTTP 200 when tested. Squarespace CDN serves WebP via content negotiation; the
`.jpg` URL still works. For Squarespace images you can append `?format=2500w` for max size. For the EMA set,
**drop the `-lower-res` suffix for a higher-res version** (confirmed larger file).

### A. Erickson McGovern Architects (architect's own set) — ericksonmcgovern.com
Pattern: `…/pac-bonney-lake-hs-NN-lower-res.jpg` (remove `-lower-res` for full size).
EXTERIORS:
- 01 (exterior toward PAC): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160062531-OMMZ5XGU81IAAER8VXRF/pac-bonney-lake-hs-01-lower-res.jpg`
- 02 (exterior toward PAC, flagpole): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160085750-I7LAX0C67AQFRMJXM56C/pac-bonney-lake-hs-02-lower-res.jpg`
- 03 (PAC adjacent side): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160108888-NI1Q8P7GCC0A0DWDYFP4/pac-bonney-lake-hs-03-lower-res.jpg`
- 04 (PAC **rear side** — fly tower/back): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160120663-RKO7KW0BJA3KZ1SMBIPI/pac-bonney-lake-hs-04-lower-res.jpg`
- 06 (exterior day toward PAC): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160188921-PKNS8CV84VMMZINU1IUO/pac-bonney-lake-hs-06-lower-res.jpg`
- 07 (exterior **night** toward PAC): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160162207-P4KXXMNDQZRUHJ5C5DYP/pac-bonney-lake-hs-07-lower-res.jpg`
INTERIORS:
- 05 (lobby toward vestibule): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160144435-LN9KGM9R5THTTCLEQGEN/pac-bonney-lake-hs-05-lower-res.jpg`
- 08 (house, stage from left): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160225071-XL0EACU0K6R871DP8L2M/pac-bonney-lake-hs-08-lower-res.jpg`
- 09 (stage, rigging): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160235869-3AA2QYIMEX616MFOT3SO/pac-bonney-lake-hs-09-lower-res.jpg`
- 10 (stage, rigging): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160248797-5NSG2NDE7GFGTKLNVG64/pac-bonney-lake-hs-10-lower-res.jpg`
- 11 (stage, rigging + person): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160264287-Z8GKWPG83MOCPEFNGLZ1/pac-bonney-lake-hs-11-lower-res.jpg`
- 12 (stage centered): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160283304-VX92DS0KVORICFTAWYA6/pac-bonney-lake-hs-12-lower-res.jpg`
- 13 (stage, lighting): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160303091-AO7XK0EAPIUOKLSQ4GVQ/pac-bonney-lake-hs-13-lower-res.jpg`
- 14 (side of seating): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160350391-A6EAWXUTPFVBA3GGN0ER/pac-bonney-lake-hs-14-lower-res.jpg`
- 15 (stage, dim lighting): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160321158-PHNESPMI963QN6330YCW/pac-bonney-lake-hs-15-lower-res.jpg`
- 16 (stage, dramatic lighting): `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1600160334977-SMJNF1QAVNM1NSNAN6M7/pac-bonney-lake-hs-16-lower-res.jpg`
- rigging up-view A: `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1601501596513-8P4DNE55HETBKOBG0GF0/71404791_10217089947733391_1815636968424341504_o.jpg`
- rigging up-view B: `https://images.squarespace-cdn.com/content/v1/5ed9473ee73b416dab95ed85/1601501609552-81UKM0IYDYAI1W82V73G/71673636_10217089948373407_3335813554484805632_o.jpg`

### B. Doug Walker Photography (architectural photographer) — walkerphoto.com
EXTERIORS:
- Hero **dusk** lobby/entry pano: `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576774960179-MLQAZO78S6S6SKX71V5V/Bonney_Lake_High_School_Performing_Arts_Center_5940_716.jpg`
- **Early-morning EAST elevation** (storefront, soft light): `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576776920412-RX8ZCEXKFDAX8T8HAGXJ/Bonney_Lake_High_School_Performing_Arts_Center_5940_132.jpg`
- Midday forms & surfaces: `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576777618608-ZCZ8ZNPHVQB2M47QHV3B/Bonney_Lake_High_School_Performing_Arts_Center_5940_1160.jpg`
- **WEST elevation** (green room/control booth side — fly tower back): `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576778451401-05MS0IXIMX035XZ3B93M/Bonney_Lake_High_School_Performing_Arts_Center_5940_1150.jpg`
- **EAST elevation + connection to main school**: `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576778550644-PVBBOYSDUTT7MTOARD9W/Bonney_Lake_High_School_Performing_Arts_Center_5940_170.jpg`
- **Sunset** w/ fall foliage: `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576778618897-THF6IWY752U4FRVPOL56/Bonney_Lake_High_School_Performing_Arts_Center_5940_406.jpg`
INTERIORS:
- Lobby entry 1-pt perspective: `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576966072569-PJWMT101C6P0O1TDBERF/Bonney_Lake_High_School_Performing_Arts_5940_326-Edit.jpg`
- Lobby windows / monochrome + wood waves: `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576965717016-C7TR8CZHWL0LSLX0WJXY/Bonney_Lake_High_School_Performing_Arts_Center_5940_290_5940_2056.jpg`
- Stage & seating (blue lights, shells): `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576776456204-ECAUYWMC76ZTPXTBULGN/Bonney_Lake_High_School_Performing_Arts_Center_5940_2024.jpg`
- 2/3 stage view: `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576779346710-B5NLCVJSKQPRJUGEVHL8/Bonney_Lake_High_School_Performing_Arts_Center_5940_1568.jpg`
- Students in lobby: `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576777484058-C26D5OPDSMN49BK3QHHX/Bonney_Lake_High_School_Performing_Arts_Center_5940_2084-Edit.jpg`
- Control booth view: `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576778161448-ZMW2N2A7A5ZGSHT41V0Y/Bonney_Lake_High_School_Performing_Arts_Center_5940_1660.jpg`
- Blue wall-wash transition: `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576778930592-4CB5L4O4V522XZWBV1D4/Bonney_Lake_High_School_Performing_Arts_Center_5940_202.jpg`
- Acoustical shells deploying: `https://images.squarespace-cdn.com/content/v1/537cdbebe4b0363f694edd7e/1576780280721-COHQRPLR4MA7BGWJGAE3/Bonney_Lake_High_School_Performing_Arts_Center_5940_238.jpg`

### C. Berschauer Group (general contractor) — HIGHEST-RES JPEGs (`_MASTER-scaled`)
These are the largest, cleanest exterior JPEGs (no WebP negotiation). BEST for tracing massing.
- WEST/fly-tower elevation (1150): `https://www.berschauergroup.com/wp-content/uploads/2020/09/5940_1150-Edit_SOCIAL.jpg`
- Dusk hero **pano** (716): `https://www.berschauergroup.com/wp-content/uploads/2020/09/5940_716-Pano-Edit_SOCIAL.jpg`
- EAST elevation morning (132): `https://www.berschauergroup.com/wp-content/uploads/2020/09/5940_132-Edit-Edit_MASTER-scaled.jpg`
- EAST elevation + connection (170): `https://www.berschauergroup.com/wp-content/uploads/2020/09/5940_170-Edit-Edit_MASTER-scaled.jpg`
- Lobby entry (334): `https://www.berschauergroup.com/wp-content/uploads/2020/09/5940_334-Edit_MASTER-scaled.jpg`
- Stage/seating 2/3 (1568): `https://www.berschauergroup.com/wp-content/uploads/2020/09/5940_1568_H4_MASTER-scaled.jpg`
- Interior (1320): `https://www.berschauergroup.com/wp-content/uploads/2020/09/5940_1320-Edit_SOCIAL.jpg`

### D. AEP Span (metal panel maker) — web-res, but tied to product spec
- 170 (east + connection): `https://www.aepspan.com/wp-content/uploads/5940_170-web.jpg`
- 132 (east morning): `https://www.aepspan.com/wp-content/uploads/5940_132-web.jpg`
- 1150 (west / fly tower): `https://www.aepspan.com/wp-content/uploads/5940_1150-web.jpg`

### E. Local ground-truth (already on disk, `reference/campus-exterior/`)
- `pac-east-elevation.jpg` (= Walker 5940_132 family) — entry hero
- `pac-west-elevation.jpg` (= Walker 5940_1150) — fly tower / material contrast
- `pac-east-connection.jpg` (= Walker 5940_170) — angled side + roof slope + connection
- `pac-sunset-exterior.jpg` (= Walker 5940_406) — sunset, teal dome sculpture visible at right
- `pac-lobby-dusk.jpg` (= Walker 5940_716 pano) — full east+south comp, uplit brick, dome, fly tower, school at left

---

## 5. STILL-MISSING / get-these-to-finish the model

- **True aerial / roof plan** (to lock footprint L×W and roof ridge directions). Best source:
  **Google Maps / Earth satellite** at BLHS, 10920 199th Ave Ct E, Bonney Lake WA 98391 (north edge of
  campus). Not yet captured — grab a top-down screenshot. [no direct image URL available]
- **Fly tower exact height** and **proscenium / stage dimensions** — not published anywhere found.
  Best path: scale off `pac-west-elevation.jpg` using the man-door (~7 ft) or person for reference, OR
  request the EMA drawing set / district capital-projects drawings. [unknown — do not invent]
- **Floor plan / elevation / section drawings** — district has Ed-Spec + bid PDFs
  (app.eduportal.com/documents/view/627306 and sumnersd resource-manager links) but they did not render
  as text/images via fetch; would need manual download in a PDF reader. [not captured]
- **NORTH long-side straight-on** photo — only seen at an angle (pac-east-connection). [gap]

---

## Sources
- EMA PAC project page (18 photos + specs): https://www.ericksonmcgovern.com/pac-bonney-lake
- Doug Walker PAC essay (15 captioned photos): https://www.walkerphoto.com/blog/bonney-lake-high-school-performing-arts-center
- Doug Walker LinkedIn FORM+FUNCTION: https://www.linkedin.com/pulse/form-function-bonney-lake-high-school-performing-arts-doug-walker
- Berschauer Group PAC (high-res JPEGs): https://www.berschauergroup.com/portfolio/bonney-lake-high-school-performing-arts-center/
- AEP Span panel spec (HR-36, Cool Parchment + Cool Zinc Gray): https://www.aepspan.com/projects/bonney-lake-high-school-performing-arts-center/
- PCS Structural (gable girder-truss roof, 550 seats, $14.9M): https://www.pcs-structural.com/company/project_details/bonney-lake-high-school-performing-arts-center/
- SBLSD capital projects PAC page (cost/timeline/program + Ed-Spec PDFs): https://www.sumnersd.org/about-us/overview/construction/projects/bonney-lake-high-school-pac
- The Chamber Collective grand-opening recap: https://thechambercollective.com/grand-opening-of-the-blhs-pac/ (403 on fetch; event facts via search)
- Local ground-truth photos: reference/campus-exterior/ (pac-*.jpg, EMA + Doug Walker)
