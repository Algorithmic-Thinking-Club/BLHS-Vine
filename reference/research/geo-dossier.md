# BLHS Campus — Geospatial Dossier (for 1:1 game map)

> Bonney Lake High School, Sumner-Bonney Lake School District.
> Compiled 2026-06-24 from OpenStreetMap (Overpass API), USGS 1m elevation, NCES,
> and district construction records. Every coordinate below is real, pulled from a
> named source. Estimates are marked **[est]**. WGS84 lat/long (decimal degrees).

## 0. Identity & headline facts
- **Address:** 10920 199th Avenue Court East, Bonney Lake, WA 98391, Pierce County.
- **Opened:** September 2005 (grand opening Dec 6, 2005). Architect **Erickson McGovern**;
  civil engineering **AHBL**; structural **PCS Structural Solutions** / **BCE Engineers**.
- **Building:** **207,539 ft² total floor area** (district figure). The ground *footprint*
  measured from OSM is ~152,460 ft² — the difference is upper floors, consistent with a
  2-level building stepped into the hillside (district docs mention a staircase connecting
  the administrative area to the commons level).
- **Site:** district cites **49 acres**; the OSM school parcel polygon measures **41.9 acres**
  (the extra ~7 ac is adjacent ROW / stormwater / wooded buffer).
- **Mascot/brand:** Panthers, teal & black. Enrollment ~1,643–1,676 (9–12).
- **OSM school feature:** way/550592662 (amenity=school). Nominatim centroid 47.1591, -122.1698.

### CRITICAL adjacency correction (resolved this research)
Two neighbors must be **excluded** from the BLHS game map — and the raw aerial is misleading
because their fields blend visually with BLHS's:
- **Mountain View Middle School (MVMS)** — way/550592660, 10921 199th Ave Ct E, **to the SE**,
  30.9 ac. **It owns the far-SE red running-track/field complex, 2 of the baseball diamonds
  (the southernmost), the 3-court SE tennis block, and the 2 SE-most parking lots.** Do NOT
  put these on the BLHS map.
- **Bus Depot** — way/550592661, landuse=industrial, **to the north**, 9.7 ac. The two large
  buildings immediately N of BLHS (≈19,400 ft² and ≈30,900 ft²) are **bus depot / transport
  maintenance, not the BLHS gym/PAC.** Exclude.
- Implication: BLHS's gymnasium, Performing Arts Center, and commons are all **inside the single
  articulated 152k-ft² main-building footprint** — it is one connected multi-wing structure, not
  separate pavilions.

---

## 1. Campus boundary (BLHS only — excludes MVMS, bus depot, ravine)
Source: OSM way/550592662. **41.9 acres.** Polygon vertices (lat, lon), in order:

```
47.158636, -122.173516   (SW corner, near football field SW)
47.158610, -122.171579
47.158571, -122.168730
47.157743, -122.168264
47.156853, -122.167466
47.156638, -122.167273
47.156349, -122.167014
47.156280, -122.166598   (S point, by tennis/diamond SE)
47.156458, -122.166380
47.156534, -122.166113
47.156468, -122.165663
47.156543, -122.165294
47.156768, -122.165006
47.157008, -122.164756
47.157290, -122.164514
47.157643, -122.164346
47.157965, -122.164299
47.158366, -122.164215   (E edge, upper terrace toward 199th Ave Ct E)
47.158381, -122.165209
47.158656, -122.165200
47.158671, -122.166275
47.160311, -122.166224   (NE corner, abuts bus depot)
47.160278, -122.168859
47.160336, -122.168983
47.161328, -122.169524   (N point, abuts bus depot)
47.161095, -122.170345
47.160989, -122.170560
47.159763, -122.172646
47.159439, -122.173044
47.158636, -122.173516   (close)
```

- **Bounding box:** N 47.1613, S 47.1563, E -122.1642, W -122.1735.
- **Overall envelope:** roughly **2,400 ft (E–W) × 1,840 ft (N–S)**, but the usable parcel is an
  irregular L/boot shape — wide across the north (football → fields), tapering south.
- The northern edge (47.1603–47.1613) is the shared line with the bus depot; the SE edge
  (47.1563–47.1585) is the shared line with MVMS.

---

## 2. Buildings — footprints (BLHS only)

### 2.1 Main academic building (the whole school) — OSM way/1337560793
- **Footprint area:** 14,164 m² = **152,460 ft²** (one level). Total floor area 207,539 ft².
- **Centroid:** 47.159454, -122.169044.
- **Bounding box of footprint:** lat 47.15882–47.16016, lon -122.17058 to -122.16751.
- **Local extent** (origin = centroid, X=East ft, Y=North ft): **X −381…+375 ft, Y −231…+259 ft**
  → about **756 ft wide (E–W) × 490 ft deep (N–S)** overall.
- **Orientation:** the wings are NOT axis-aligned; the minimum-rotated bounding box sits at
  ~**44° off north**, i.e. the building's main corridors run roughly **NE–SW / NW–SE** (it's a
  pinwheel/articulated plan that follows the hillside contour). The front (public entry) faces
  **southwest/south** toward the front parking and the 199th Ave approach.
- It is a **highly articulated 112-vertex polygon** (courtyards, jogs, wings). Full vertex list
  is in `_overpass-result.json` (way 1337560793) — load it directly for the exact outline.
  Key extremities:
  - NE wing reaches ~47.1602, -122.16751
  - NW corner ~47.15898, -122.17058
  - S/front edge dips to ~47.15882, -122.16881
- **Two small attached/auxiliary structures inside the BLHS line:**
  - way/1337560984 — 441 m² (4,748 ft²), ctr 47.159767, -122.170380 (NW of main, by the
    football-side parking — likely a press box / concession / field building). **[est use]**
  - way/1337561518 — 326 m² (3,507 ft²), ctr 47.159439, -122.170989 (near football field
    NE; concession/restroom or field support). **[est use]**

### 2.2 Storage tanks (on upper-east terrace, just OUTSIDE the OSM school line but on campus grounds)
- way/1337560794 — 307 m², ctr 47.159217, -122.165240 (building=storage_tank)
- way/1337560795 — 350 m², ctr 47.158954, -122.165368 (building=storage_tank)
- These sit on the high east terrace (~700+ ft) between the building and 199th Ave Ct E —
  probably water/utility tanks. Treat as set dressing, not enterable.

### EXCLUDED buildings (do not map as BLHS)
- way/1337560796 (19,393 ft²) & way/1337561020 (30,914 ft²) & way/1337561095 (3,487 ft²) —
  **Bus Depot**, north.
- All ~100–250 m² footprints scattered W/S/E of the parcel — **residential houses**.

---

## 3. Athletics, parking, walkways

### 3.1 Football stadium + track (WEST) — OSM way/529273153
- **Turf field:** leisure=pitch, sport=american_football, **artificial_turf, lit=yes**.
  Field rectangle ≈ **362 × 164 ft** (turf playing surface incl. sidelines).
- **Centroid:** 47.159848, -122.171320. Local: **X −565 ft (W), Y +144 ft (N)** of main bldg.
- **Long-axis bearing ≈ 140°/320° (NW–SE)** — the field is rotated, not N–S; its long axis
  points NW–SE, parallel to the main building's NW wing.
- **Corner coords (turf):**
  ```
  47.160239, -122.171046   (NE)
  47.159902, -122.170625   (SE-ish)
  47.159262, -122.171730   (SW)
  47.159599, -122.172152   (NW)
  ```
- **Track:** a red 6–8 lane oval encircles the turf (clearly visible in aerial-esri.png; OSM
  did not tag it separately). Add an oval ring ~**30–36 ft** outside the turf on each long side
  → overall stadium pad ≈ ****[est]** 430 × 230 ft**. District added a **covered grandstand
  with press box** (AllPlay Systems) on one side; old open bleachers were removed to Lakeridge MS.
- The whole stadium sits on a **dead-flat engineered terrace at 644 ft** (lowest part of campus).

### 3.2 Baseball / softball diamonds (BLHS owns three)
- **North diamond** — way/550592651, ctr 47.159959, -122.166819. ~225 ft sides, backstop NW.
  Local X +553, Y +184. On the upper-east terrace just NE of the building.
- **Middle diamond** — way/1513888697, ctr 47.159250, -122.166864. ~225 ft. Local X +541, Y −75.
  Directly E of the building.
- **SE diamond (largest, varsity)** — way/550592657, ctr 47.157598, -122.165413. ~354 ft
  (full outfield). Local X +902, Y −678. Far SE corner of BLHS parcel.
- (The two diamonds further S/SE — way/550592643 & 550592644 — are **MVMS**, exclude.)

### 3.3 Tennis courts — 6-court BLHS block
- ways 1446402139–1446402144, six courts, each ~37 × 78 ft, **angled ~25° off N**.
- Cluster centroid ≈ 47.1572, -122.1669. Local X +523, Y −823 (S-central, by the SE diamond).
- (The 3-court block at 47.1554, -122.1637 is **MVMS**, exclude.)

### 3.4 Parking lots (BLHS — 7 lots) — OSM amenity=parking
| OSM id | area | approx dims | centroid (lat,lon) | location |
|---|---|---|---|---|
| 1368560815 | 5,293 m² (56,975 ft²) | 183×332 ft | 47.160649, -122.169684 | **Main north lot** (largest staff/visitor), N of bldg |
| 1368560820 | 10,381 m² (111,743 ft²) | 302×416 ft | 47.157988, -122.167364 | **Big SE lot** (student lot, by fields) |
| 1368560816 | 2,186 m² (23,527 ft²) | 381×171 ft | 47.159373, -122.170451 | **Front/west lot** (football side, drop-off) |
| 1368560819 |   490 m² | 63×85 ft | 47.158711, -122.166703 | small lot E of bldg, by diamonds |
| 1368560817 |   665 m² | 166×45 ft | 47.158815, -122.169955 | narrow lot S/front of bldg |
| 1368560818 |   431 m² | 96×49 ft | 47.158898, -122.168042 | small front lot |
| 1368560824 |   517 m² | 48×129 ft | 47.160060, -122.167751 | small lot NE (by N diamond) |
| (1368560822, 1368560823 = MVMS, exclude) |

- **Drop-off / approach:** the south/front lots (1368560817/818) + front-west lot form the
  car approach off 199th Ave Ct E into the building's SW front. A loop/curb cut runs along the
  south face of the building (the OSM service roads below trace it).

### 3.5 Walkways, service roads, courtyards
- OSM has **37 service ways** (no separate `footway` tags survived) threading the campus —
  these double as fire lanes + main pedestrian spines. Notable:
  - A spine runs **NE–SW along the building's SE face** (ways 98568865, 550592652/3/4)
    connecting the front lots to the east fields.
  - A loop wraps the **north parking + drop-off** (ways 550592647–650, 974196334–337).
  - Service road down to the **football terrace** on the west (ways 894788913, 974196336).
- **Courtyards:** two small `leisure=playground` polygons (ways 1368560825/826) at
  47.1601, -122.1673 sit *inside* the building's footprint cluster → these are the
  **interior/central courtyard(s)** of the pinwheel plan (good anchor for a campus "commons"
  hub in-game).
- **Water features:** small ponds/wetland on the W/SW edge (natural=water/wetland, ways
  1513888698/898/899 around 47.1588, -122.1715) — stormwater retention by the football field.

---

## 4. Arrangement & compass orientation (the mental model)
Reading W→E across the campus, everything is strung along an **east-rising hillside**, with the
building complex angled ~**44° off the cardinal grid** (corridors run NE–SW / NW–SE):

```
        N (Bus Depot — excluded)
                 |
   [Football   [ Main North Lot ]      [ N baseball ]
    stadium +   ___________________      [ mid diamond ]
    track]  -- |  MAIN BUILDING    | -- [ storage tanks ]
   (WEST,low)  |  (gym+PAC+commons |      (EAST, high
   644 ft      |   +classrooms,    |       terrace ~700 ft)
               |   one structure)  |
   [front/west [___________________]   [ small E lots ]
    + front lots]   (front faces SW/S)
                 \                 /
                  [ Big SE student lot ]
                  [ 6 tennis courts ]
                  [ SE varsity baseball ]
                          |
                  (MVMS to the SE — excluded)
```

- **Football stadium:** far **WEST**, lowest terrace (644 ft).
- **Main building:** **CENTER**, mid-terrace (~651–655 ft), front entrance facing **SW/S**.
- **Baseball/softball + tennis + big student lot:** **EAST / SE**, upper terraces (674–704 ft).
- **Main north lot:** **NORTH** of the building, against the bus-depot line.
- Net diagonal of the campus: long axis runs **WNW (football) → ESE (fields)**.

---

## 5. Elevation & grade (USGS 3DEP, 1-meter, units = feet)
The site is a **west/north-facing hillside that drops ~60 ft from its high SE/E edge to the
low W/NW corner**, engineered into **three main terraces**:

| Point | Elev (ft) | Note |
|---|---|---|
| East edge (by 199th Ave Ct E) | **706** | highest; campus high ground |
| Upper-east terrace (fields/tanks) | 677–704 | baseball/tennis/student-lot bench |
| SE varsity baseball | 680 | upper bench |
| Main building plateau | 651–655 | mid terrace; entry 651 |
| North lot / north gym area | 646–649 | |
| Football + track terrace | **644** (flat) | lowest engineered bench |
| West / NW edge | 644 | |
| **South parcel edge (ravine lip)** | **627** | drops toward wooded ravine S |

**W→E transect (constant ~47.159 lat):** 644 → 644 → 654 → 655 → 655 → 677 → 691 → **706**.
→ A short, steep rise of ~50 ft happens over the easternmost ~300 ft (between the building's
east wall and 199th Ave Ct E). The building-to-football step is a **~10 ft retaining drop** west;
the building-to-fields step is a **~20–25 ft retaining rise** east.

**Terracing summary for the map:**
1. **Lower bench (~644 ft):** football stadium + track + west/front parking + stormwater ponds.
2. **Main bench (~651–655 ft):** the school building + north lot, stepped internally (the
   2-level building with the commons-to-admin staircase exploits this grade).
3. **Upper bench (~675–706 ft):** baseball/softball diamonds, tennis, big SE student lot,
   utility tanks — cut into the high east shoulder against 199th Ave Ct E.
4. **South:** ground falls off to **~627 ft** into a wooded ravine (natural=wood polygons) —
   the natural southern boundary.

Slope aspect overall: **down to the WNW.** A player walking from the east fields to the
football stadium descends roughly 60 ft; design the map's east side as visibly "uphill."

---

## 6. Game-map local coordinate frame (ready to use)
Origin = main-building centroid (47.159454, -122.169044). X = East (ft), Y = North (ft).
1 ft ≈ 0.3048 m. Scale factors at this latitude: 1° lat = 111,320 m; 1° lon = 75,720 m.

| Feature | X (ft) | Y (ft) |
|---|---|---|
| Main building centroid | 0 | 0 |
| Football field center | −565 | +144 |
| Main north lot | −159 | +436 |
| Front/west lot | −349 | −30 |
| North baseball diamond | +553 | +184 |
| Middle diamond | +541 | −75 |
| Big SE student lot | +417 | −535 |
| East fields lot | +581 | −271 |
| 6-court tennis | +523 | −823 |
| SE varsity baseball | +902 | −678 |

Building footprint local extent: **X −381…+375, Y −231…+259** (≈756 × 490 ft).
To place any other lat/lon: `X_ft = (lon + 122.169044) * 75720 * 3.28084`,
`Y_ft = (lat − 47.159454) * 111320 * 3.28084`.

---

## 7. Sources (every URL used)
- OSM Overpass API (raw building/parking/pitch/path/barrier/landuse JSON, extracted node coords):
  https://overpass-api.de/api/interpreter  (queries saved alongside as `_overpass.ql`, `_ovp2.ql`;
  raw results `_overpass-result.json`, `_ovp2.json`)
- OSM Nominatim (school geocode + amenity polygon):
  https://nominatim.openstreetmap.org/search?q=Bonney+Lake+High+School
- OSM features: way/550592662 (BLHS), way/550592660 (Mountain View MS), way/550592661 (Bus Depot),
  way/1337560793 (main building), way/529273153 (football), way/550592651/657/1513888697 (diamonds),
  ways 1446402139–144 (tennis), ways 1368560815–824 (parking). View any at
  https://www.openstreetmap.org/way/<id>
- USGS National Map 3DEP Elevation Point Query Service (1 m, feet):
  https://epqs.nationalmap.gov/v1/json
- NCES public school detail (address, enrollment):
  https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?Search=1&DistrictID=5308610&ID=530861002998
- District construction record (207,539 ft², 49 ac, architect, grandstand, stadium):
  https://www.sumnersd.org/about-us/overview/construction/projects/bonney-lake-high-school-improvements
- Wikipedia (opened 2005, history): https://en.wikipedia.org/wiki/Bonney_Lake_High_School
- Local ground-truth aerial: reference/floorplans-maps/aerial-esri.png (ESRI World Imagery)

### Confidence / caveats
- Building footprint, parcel boundary, field/lot/tennis polygons, and all coordinates are
  **measured from OSM vectors** (the main building is Microsoft/OSM-traced from imagery — high
  fidelity but the exact wing jogs may be ±a few ft).
- Elevations are USGS 1 m bare-earth, **reliable to ~1–2 ft**.
- The **track oval** dimensions and the two small field-building uses are **[est]** (OSM lacked
  them; cross-check against aerial-esri.png and floor-plan PDFs in /reference before final art).
- 49 ac (district) vs 41.9 ac (OSM polygon): use the OSM polygon for the *walkable* boundary.
```
```
