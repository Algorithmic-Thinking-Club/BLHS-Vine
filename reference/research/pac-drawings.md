# BLHS Performing Arts Center — Hard Architectural Data

Research log for building a dimensionally-accurate 3D model of the Bonney Lake High School
Performing Arts Center (PAC). Address: **10920 199th Ave Ct E, Bonney Lake, WA 98391**
(north edge of the BLHS campus). Opened **Fall 2019**.

- **Architect:** Erickson McGovern Architects (Tacoma)
- **General Contractor:** Berschauer Group, Inc.
- **Structural Engineer:** PCS Structural Solutions
- **Metal panels:** AEP Span (HR-36 exposed-fastener panels)

Date compiled: 2026-06-24. Sources cited inline. Uncertainty is flagged explicitly.

---

## 1. Published hard numbers (high confidence)

| Fact | Value | Source |
|---|---|---|
| Gross floor area | **15,523 SF** (Erickson McGovern, AEP Span); **~15,344 SF** (PCS, Berschauer portfolio) | EM / PCS |
| Seating | **550** (some sources 552) | EM / PCS / district |
| Stories | **1 story** (plus full fly loft) | Erickson McGovern |
| Construction type | **Type II-B**, fully sprinklered | Berschauer portfolio PDF |
| Bid award | **$9,859,800** (project value ~$10M; ~$14.9M w/ tenant improvements) | Erickson McGovern / Berschauer |
| Completion | **Fall 2019** (Grand Opening Sept 25, 2019) | district |
| Funding | 2016 Capital Construction Bond | district |

Program spaces: main stage, side stage, green room, **full fly loft / rigging system**,
dressing rooms, piano storage, scene/set shop, technical (control) booths, catwalks linking
fly loft to control room, large lobby. Seats have tablet arms (used for instruction/testing).
Adjustable acoustics with portable acoustical shells for chorus/band/orchestra.

> NO published drawing gives an explicit overall L × W × height in feet. Those numbers must be
> derived from the footprint (Section 4) + the photographed massing (Section 3). Flagged as
> the main remaining gap.

---

## 2. STRUCTURE & ROOF — the single most important quote (high confidence)

From **PCS Structural Solutions** project page:

> "A complex **gable roof** over the auditorium seating was accomplished with a **girder truss
> at the ridge** and **smaller parallel chord trusses supported by the ridge**. PCS worked
> closely with the construction and design teams to provide design for a **CMU beam at the
> proscenium** in lieu of a concrete beam."

Interpretation for the model:
- It is a **single-ridge gable** (one straight ridge line) over the auditorium. One big girder
  truss runs ALONG the ridge; the smaller parallel-chord trusses span FROM that ridge DOWN to
  the side walls, on both sides. So: two roof planes sloping down off one central ridge.
- The ridge runs the **long axis of the auditorium** (stage-to-back-of-house). Confirmed by the
  interior photo (Berschauer portfolio): the exposed wood gable ceiling peaks along the room's
  long centerline, sloping down to both side walls.
- **Proscenium / stage** end has a **CMU (concrete masonry) bearing wall / beam** — that's the
  flytower/stage-house end (the tall blank mass).

Roof & wall materials (AEP Span): **HR-36 exposed-fastener standing-rib metal panels**, colors
**"Cool Parchment"** and **"Cool Zinc Gray"** (light greige / cool gray). This matches the
campus palette (greige metal siding). Roof reads light gray from above.

---

## 3. Massing from photos (medium-high confidence)

From the Berschauer portfolio rendering (front/entry elevation) + Doug Walker architectural
photos + interior shot:
- **Public/entry (lobby) front:** long, LOW horizontal mass with a tall **glass curtain wall**
  entry and a flat or very-low-slope canopy roof. This is the "hero" elevation and faces the
  parking / public approach (north side).
- **Behind the lobby:** the tall **gabled auditorium hall** rises well above the lobby.
- **Stage end:** a still-taller **flytower / stage house** (full fly loft) — a tall, near-windowless
  box at the far end from the lobby. It is the tallest element of the building.
- Exterior is metal panel + insulated glass; monochromatic light tones with wood accents at entry.

Vertical hierarchy (low → high): lobby roof  <  auditorium gable ridge  <  flytower top.

---

## 4. ROOF FROM DIRECTLY ABOVE (satellite, ESRI World Imagery dated 2025-04-16, 0.34 m/px)

Imagery confirmed CURRENT (acquired **2025-04-16**, post-PAC) via ESRI identify metadata, so
the PAC IS present. Saved tiles are in `reference/research/sat/` (campus_over, academic,
west_bldg, hall2, northcentral, pac_tight).

**Campus orientation (north = up):** track/football stadium = WEST; bus depot = NORTH; main
academic gable wings = CENTER; ball fields = EAST; main visitor parking = SOUTH.

**PAC identification (medium confidence — best visual match, not label-confirmed):**
The PAC is the **large light-gray-roofed hall on the WEST-CENTRAL part of the complex,
immediately EAST of the running track**, centered roughly at **47.1595 N, -122.1695 W**. It is
the single largest light-metal-roof volume on campus, its roof color matches the Parchment/Zinc
panels, it has a lobby mass on its public end and a taller boxy element (flytower) at the far
end. (The bus-depot building at the far north is a transportation/maintenance barn, NOT the PAC.)

**Roof geometry as seen from straight down:**
- **Overall outline:** an elongated **rectangle** (the auditorium hall), with a **lower wider
  lobby mass attached at the north/entry end** and the **flytower box at the opposite (south)
  end**. Rough proportions of the main hall ≈ **2 : 1** (long : wide).
- **Ridge line:** ONE main ridge running roughly **N–S** down the long axis of the hall (slightly
  rotated, about NNW–SSE, a few degrees off true north — the whole campus grid is rotated ~slightly
  east of north).
- **Roof planes:** **2 primary planes** — the gable's two slopes falling EAST and WEST off that
  central N–S ridge. (The PCS "parallel chord trusses each side of a ridge girder" = exactly this
  two-plane gable.)
- **Gable peak / high point:** along the centerline ridge; the gable END walls face N and S.
- **Flytower footprint:** a distinct taller box at the **STAGE end** of the hall (appears to be the
  **south end**, away from the public lobby). It breaks above the gable roof plane and casts the
  longest shadow — use shadow length to estimate its height.
- **Lobby:** lower, slightly wider flat/low-slope roof at the **north/entry end**, facing the
  approach and parking.

> UNCERTAINTY: I could not get an authoritative *labeled* footprint (Pierce County's ATIP parcel
> portal and ArcGIS REST building-footprint service are JS-app / endpoint-gated and did not return
> data to scripted access; OSM has the footprints digitized but UNNAMED, with the PAC merged into
> the single 112-vertex "main complex" polygon). The PAC identification above is a strong visual
> match but is not confirmed by a label or stamped plan. **Recommend Ash eyeball-confirm in Google
> Earth** (search the address, look just east of the track) and read the flytower shadow for height.

---

## 5. Drawing-set hunt — where stamped drawings most likely live (NOT yet downloaded)

NO direct PDF of a stamped drawing set (floor plan / roof plan / elevations / sections) was found
in the open web. The strongest UNEXHAUSTED leads, in priority order:

1. **City of Bonney Lake Permit Center (electronic plan sets).** The city requires full stamped
   electronic plan sets for commercial permits; a 2017–2018 BLHS PAC building permit would carry
   the architectural + structural set (incl. roof plan, elevations, sections). Portal:
   - https://web.ci.bonney-lake.wa.us/Default.asp?Build=PM.PermitsHome (Permits & Inspections)
   - https://www.ci.bonney-lake.wa.us/government/departments/public_services/permit_center/building_permits
   Search the address 10920 199th Ave Ct E; permit ~2017-2018. **Most likely to hold real
   dimensioned drawings.** May require a public-records request for the actual PDFs.

2. **Sumner-Bonney Lake SD board documents (eduportal).** The PAC bid-award + intent-to-construct
   board items (2/14/18 Bid Award, 2/21/18 Intent to Construct, 5/10/17 Ed Specs) are referenced on
   the district PAC page and served via app.eduportal.com. Ed Specs / bid packets sometimes embed
   schematic plans/elevations. District project page:
   https://www.sumnersd.org/about-us/overview/construction/projects/bonney-lake-high-school-pac

3. **Builders Exchange of Washington (bxwa.com) plan center.** District bids post full plans/specs/
   addenda here for plan-holders. The PAC set (bid ~Feb 2018) may be archived. Requires login;
   archived projects sometimes purged.

4. **Pierce County Assessor (ATIP) parcel record** — building sketch + footprint dimensions + year
   built. JS app (no scriptable static data): https://atip.piercecountywa.gov/  → search address.
   Pierce County GIS building-footprint feature service would give exact polygon vertices = true
   L × W; endpoint not located via scripted probing (host moved to matterhorn.piercecountywa.gov;
   try the PublicGIS viewer: https://matterhornwab.co.pierce.wa.us/publicgis/ ).

5. **WA public-records request to the district** (Capital & Facilities Procurement) for the
   conformed/record drawing set — the cleanest path to dimensioned floor/roof plans, elevations,
   and sections if the above don't yield PDFs.

---

## 6. Direct URLs found (with what each shows)

- **PCS Structural — project page** (THE roof/truss description, quoted above):
  https://www.pcs-structural.com/company/project_details/bonney-lake-high-school-performing-arts-center/
- **Erickson McGovern — PAC project page** (15,523 SF, 550 seats, 1 story, fly loft, $9.86M bid):
  https://www.ericksonmcgovern.com/pac-bonney-lake
- **AEP Span — project page** (roof/wall panel = HR-36, colors Cool Parchment + Cool Zinc Gray):
  https://www.aepspan.com/projects/bonney-lake-high-school-performing-arts-center/
- **Berschauer Group — portfolio PDF** (text spec: ~15,344 SF, Type II-B, fully sprinklered; small
  front-elevation RENDERING + interior gable-ceiling photo on p.2):
  https://www.berschauergroup.com/wp-content/uploads/2020/09/BGI-Qualifications_Portfolio-2019.pdf
  (rendered locally to reference/research/pac_pdf/hi-2.png — best massing image found)
- **Berschauer Group — project page:**
  https://www.berschauergroup.com/portfolio/bonney-lake-high-school-performing-arts-center/
- **Doug Walker Photography — exterior/interior photos** (entry elevation, side elevations, lobby):
  https://www.walkerphoto.com/blog/bonney-lake-high-school-performing-arts-center
- **Sumner-BLSD — PAC project page** (links board docs via eduportal):
  https://www.sumnersd.org/about-us/overview/construction/projects/bonney-lake-high-school-pac
- **ESRI World Imagery export (top-down satellite, 2025-04-16, 0.34 m/px)** — example tight tile:
  https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=-122.170559411765,47.15874,-122.168540588235,47.1603&bboxSR=4326&size=1024,792&format=png&f=image
  (saved as reference/research/sat/hall2.png — clearest top-down of the PAC roof)

> NO stamped/dimensioned drawing PDF (floor plan, roof plan, elevations, sections) was located in
> open sources. Best path to those = City of Bonney Lake permit set or a district records request.

---

## 7. Model-ready summary (synthesis)

- ONE long rectangular auditorium hall, footprint ≈ **2:1** long:wide, gross building ~15,500 SF.
- **Single-ridge gable** roof, ridge along the long axis (oriented ~**N–S** on the real site),
  **two roof planes** sloping E and W. Light gray/parchment standing-rib metal.
- **Flytower** = tall blank box at the STAGE end (one gable end, ~south); tallest element; CMU
  proscenium wall there. **Lobby** = lower, wider, glass-fronted mass at the OTHER end (entry/north),
  flat/low-slope roof.
- Height order: lobby < auditorium ridge < flytower.
- Real measured L/W/H still UNKNOWN as published numbers — derive from the footprint + flytower
  shadow, or pull the permit/record drawing set to get exact dimensions.
