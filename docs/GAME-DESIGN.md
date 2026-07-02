# ⭐⭐⭐ GAME-DESIGN.md — BLHS Island Explorer, the canonical end-to-end design

> ⚠️ **THIS IS A LIVING DOCUMENT, NOT SCRIPTURE.** It was generated ONCE (2026-07-02) as a
> static design manual — a good reference and the best starting map, but a snapshot that ages
> the moment building starts. Every AI session working on this game is REQUIRED to treat it as
> mutable: when reality diverges (a design gets improved on screen, Ash steers, a system lands
> differently, a section goes stale), **UPDATE THIS FILE in place** — and keep every other
> markdown current too (`docs/STATE-OF-PLAY.md` above all, plus any doc a change touches).
> Never build against a stale paragraph you know is wrong; fix the paragraph, then build.
> The bar and Ash's locked steers stay locked; everything `[DECIDED]` is yours to evolve.
>
> **THE single design source of truth for the entire game** (written 2026-07-02, the Fable push).
> Every screen, scene, cutscene, mechanic, system, island, UI element, and data touchpoint from the
> moment a student loads the URL to the graduation cape. Held everywhere to the governing bar:
> **$50K RPG / TavernWorld / Octopath / Sea of Stars.** 100% PixelLab art, no shaders, true 2:1 iso
> for every walkable scene, the enhanced pixel-tile ocean as the hero cross-game asset.
>
> **SUPERSEDES** (campus-walk era, kept as history only): `docs/vision/game-design-doc.md` (GDD v0.1),
> `docs/vision/MASTER-PLAN.md`, `docs/vision/game-masterplan.md`, `docs/vision/first-run-and-systems.md`,
> `docs/vision/encounter-atc-spec.md`, `docs/vision/PHASED-BUILD-PLAN.md`, `docs/build-phases.md`,
> `docs/features-outline.md`. **CONSOLIDATES AND SUPERSEDES** as spec: `docs/island-plan.md`,
> `docs/vision/phase1-story.md` (their locked decisions are carried in here, expanded).
> **REMAINS CANONICAL BESIDE THIS DOC:** `docs/vision/ASHWATH-DIRECTIVE-VERBATIM.md` (intent),
> `docs/vision/intro-sequence.md` (intro phases; §5 here is its detailed realization),
> `docs/STATE-OF-PLAY.md` (live build state), `docs/research/*` (evidence), `docs/art-direction.md` +
> `docs/style-bible.md` (visual bible), `docs/place-specs/_gold-standard-analysis.md` (the 8 rules).
>
> Tags: `[LOCKED]` Ash/Wiseman-confirmed. `[DECIDED]` designed here under full authority; build it,
> Ash can veto on sight. `[ASH]` a genuine fork that needs Ashwath before build. `[LATER]` post-v1.
> All BLHS content in this doc traces to `docs/research/blhs-specifics.md` and
> `docs/research/blhs-awards-authoritative.md`. Nothing invented.

---

## 0. THE GAME IN ONE PARAGRAPH

You are **Thor**, a panther, washed onto a golden-hour tropical beach where a message in a bottle
invites you to Bonney Lake. You sail an isometric ocean where **every island is a real BLHS thing** —
a sport, a club, a class, a policy, an honor — recognizable from the water by its landmark. Over a
structured **four-year run** you spend scarce seasonal time-slots choosing what kind of Panther to be;
every choice feeds a real **GPA**, real **ranks** (JV → Varsity → Captain), and the real **cords and
seals** BLHS actually awards. It ends at **graduation**: your cape draped with exactly the honors you
earned, a turn-in artifact for your advisory teacher and the dataset for an AP Research study. Then
the whole ocean opens for free sailing. It plays like a real $50K RPG someone would choose on a
Saturday, and every fact in it is true.

**The three pillars it must serve** (unchanged, load-bearing):
1. **AP Research** — the game vs. plain-mode controlled study; logging from frame one.
2. **ATC** — islands are grapes; near-beginner members add islands without touching the core.
3. **Deployment** — Wiseman's advisory tool; a bare prototype never gets adopted, so the bar is real.

---

## 0.5 THE SUMMER SCOPE (what "done" means right now) `[LOCKED — Ash, 2026-07-02]`

The summer build = **the ENTIRE game except grape content.** Every feature, screen, cutscene,
mechanic, and system in this doc; the complete vine; the grape architecture proven end to end —
all built and at the bar BEFORE any content island exists. This is the huge thing: dozens if not
hundreds of sub-phases, thousands of mini-things, each validated to $50K on screen. Then, as the
**final summer phase**, exactly **two grapes** get built by us as the proof and the copyable
templates:

1. **The ATC island** — a jungle islet with the real ATC classroom at its center, blended into
   the island.
2. **The Football island** — the stadium rising at the center of its island.

Only after the system AND those two grapes hold the bar does anything move to ATC members (the
Aug 22 handoff). Everything else in the island roster (§6.8) is the members' map, not ours.

---

## 1. THE PLAYER JOURNEY AT A GLANCE

The full arc, every state. Sections below expand each node.

```
URL load
 └─ 1. BOOT SPLASH (~1.5s, interactive crest)                          §4.1
 └─ 2. TITLE (living beach/harbor scene; smart CTA)                    §4.2
     ├─ returning save → "Continue — Year N, <season>" → LOADING → resume (2 clicks total)
     └─ new player → "Set Sail"
         └─ 3. THE INTRODUCTION (cinematic, interleaved with setup UI)  §5
             I-1  black → the vignette opens · Thor WAKES UP on the beach
             I-2  the bottle washes up · Thor spots it · the message unfurls
             I-3  the UI session on the parchment: class code → handle + pronouns
                  → Principal Panther's letter → the wardrobe → name your boat
             I-4  the walk to the port · Thor hops aboard
             I-5  set sail (the ceremony beat) · the ship clears the cove
             I-6  THE MAP SWITCH: PixelLab loading transition (2-3s) → the vast
                  island map, open ocean → the approach (3-4s) → docking
             I-7  Thor steps ashore on the central island
             I-8  the reveal: camera pulls OUT to the whole archipelago ·
                  the introduction dialogue · zoom back to Thor
             I-9  free control: the path to the Panther's Maw → the founding
                  event inside the hub → the game begins
 └─ 4. GEAR 1 — THE FOUR-YEAR RUN (one year ≈ one 40-min advisory)     §7
     each year: year-start beat → THE PLANNER (classes + season slots) →
     required core beat → sail to islands → play them (the island loop §6) →
     yearbook page → autosave → next session picks up the next year
 └─ 5. GRADUATION (the cape ceremony + turn-in artifact)               §9
 └─ 6. GEAR 2 — FREE SAIL (unlocked; completion, seasonal events)      §10
```

Hard timing budget `[LOCKED]` (Wiseman 2026-06-28): ~40 min per year on a first run, ~160 min for
the full arc across ~4 advisory sessions; under 60 min once fluent. Save/resume is essential.
First-frame-to-control for a returning student: **under 30 seconds, two clicks.**

---

## 2. GLOBAL DESIGN LAWS (apply to every single thing below)

These are the standing rules; no section restates them.

1. **The bar** `[LOCKED]`: TavernWorld/Octopath/Sea-of-Stars. A student must be shocked at how
   gorgeous it is. The 8 rules of `_gold-standard-analysis.md` (enclosure, 3-5-object clusters,
   warm upper-left light + AO, 3+ Y-levels, designed paving, contact shadows, focal anchor, one
   grid) apply to every scene, interior, and even UI composition. Validate on screen (Glance +
   pixel-art-reviewer) before anything is called done.
2. **Art** `[LOCKED]`: 100% PixelLab. No shaders for any surface, ever. Code may grade, tint, mask,
   composite, and animate what PixelLab drew. True 2:1 iso on the proven engine
   (`BeachIso.tsx`/`Campus.tsx` patterns) for every walkable or staged scene. The cohesion
   discipline: one hero per family → reference-lock siblings → best-of-N heroes only → conform to
   palette + light → compose dense (`docs/research/pixellab-mastery.md`).
3. **The ocean is one system, reused everywhere** `[LOCKED]`: the normalized-tile + depth-ramp +
   aerial-veil + living-tide ocean proven on the beach is THE water for the title, the voyage, the
   overworld, and every island shore. Never rebuilt, only extended (boat wake is the one owed
   extension, §6.2).
4. **Everything is alive** `[LOCKED]` (style-bible §0): no static screens. Every scene carries idle
   life (sway, foam, gulls, lantern breath, crabs); every UI element eases, settles, presses,
   reacts. A static frame is a bug.
5. **Per-map local look** `[LOCKED]`: atmosphere (grade/sun/vignette) and camera zoom are per-map.
   The warm beach, a bright open sea, a moody jungle interior, a floodlit stadium at dusk each get
   their own lock.
6. **Never a hard cut** `[LOCKED]`: every scene change runs through the transition library (§12).
   Never a raw spinner; loading beats teach a real BLHS fact.
7. **Real facts only** `[LOCKED]`: every club, coach, room, policy, honor, criterion comes from
   `blhs-specifics.md` / `blhs-awards-authoritative.md`. `[UNVERIFIED]` items (fight song, Sunset
   Bowl, pageants) do not ship until confirmed.
8. **Writing** `[LOCKED]`: in-character, warm, witty, never corporate or childish. Humanized: no
   em-dashes in player-facing copy, no AI filler, no "delve/journey/tapestry" vocabulary. Thor has
   personality; NPCs speak like the real people they represent (respectfully; staff cameos are
   flattering, never mocking). USE THE HUMANIZER SKILL FOR ALL TEXT
9. **Privacy** `[LOCKED]`: no real student names in the DB, anonymized participant IDs, consent
   gates before study logging, demo mode logs nothing.
10. **Chromebook first** `[LOCKED]`: 60fps target on modest hardware. Juice via sprites, tweens,
    baked effects, canvas compositing. Budgets in §15.
11. **Data from frame one** `[LOCKED]`: every meaningful interaction emits a typed event (§13).
    The offline-first logger already exists; new systems plug into it, never around it.
12. **Two arms** `[LOCKED]`: everything content-bearing must be renderable by the plain arm
    (the AP Research control) from the same data. Game-ness is the variable, content is constant.
13. **FULLY HOOKED, NEVER HALF-BUILT** `[LOCKED — Ash, 2026-07-03]`: every system is built
    plumbed end to end AS it is built — database to frontend, wired, savable, logging — before
    moving on. No mock endpoints left behind, no dead buttons shipped as done (shells are legal
    only while ledgered in THE-PATH with the item that redeems them). "Built" means a student
    could hit it tomorrow.
14. **ASH MODE** `[LOCKED — Ash, 2026-07-03]`: a hidden, Ash-only debug authority baked in from
    the start. Activation: a secret URL key (long random token, not guessable) sets a persisted
    device flag; no visible UI hint exists for students. Powers: skip/fast-forward any cutscene
    or dialogue instantly, jump to any beat/year/scene, teleport + noclip, grant/clear GPA,
    cords, ranks, stickers, cosmetics, tokens, force either study arm, wipe/rewind saves, free
    camera + zoom. Integrity guards: Ash-mode sessions are flagged `dev:true` in every log event
    and EXCLUDED from study data; the flag never exists in the plain arm's exports; the token
    ships via env config, never committed.
15. **Transitions and loading screens are crafted pieces** `[LOCKED — Ash]`: eased, composed,
    PixelLab-illustrated (§12, §4.9). Never flashing/strobing/cheap-light effects — both a
    quality rule and a photosensitivity safety rule for a school tool.

---

## 3. THE WORLD

### 3.1 Geography of the archipelago `[DECIDED]`

One vast ocean, one chart — the island map is **multiple times the beach map's size** `[LOCKED —
Ash]`; zoom out and you should still mostly see ocean. The **Central Island** (§3.2) is the
largest island, the center of the map, and the permanent hub. Around it, grape islands settle
into groups mirroring Wiseman's knowledge taxonomy, their compass placement echoing the real
campus plan (a quiet 1:1 nod that costs nothing and pays recognition):

- **The Athletics Atoll — WEST** (the real fields sit west of the building): stadium island
  (football/track), the diamond shoals (baseball/softball, SE of the atoll like the real diamonds),
  court reefs (tennis, basketball), the pool lagoon (swim & dive), open-water routes (cross
  country runs a coastal trail).
- **The Arts Cove — NORTH** (the PAC sits on the real campus's north edge): the PAC marquee island,
  band shell island, choir cliffs, art-kiln island.
- **The Trades Harbor (CTE) — SOUTH**: culinary dockhouse (kitchen smoke), business/DECA exchange,
  teaching-academy schoolhouse, media/print island, HOSA infirmary island, engineering/robotics
  drydock (also STEM).
- **The STEM Reef — EAST** (the east fields rise in the real topo): robotics drydock, ATC's
  server-rack lighthouse, cybersecurity vault isle, the AP Academy (§7.4).
- **The Service Cays — SCATTERED between groups**: Key Club, NHS, Leo Club, Panther Crue islet
  (closest island to the Central Island — the freshman-mentoring club is literally the nearest
  neighbor).
- **Interest-club cays** ring the Central Island at mid distance: art, game/book (a library-boat at
  anchor), GSA, international, drama (bridged to the PAC), journalism, AAPI, Latino, yearbook.
- **Policies & Culture live ON the Central Island** (§3.2), not as islands.
- **Honors are NOT islands** `[LOCKED]` (Wiseman-confirmed): they are the cape layer (§8.4),
  surfaced live at the counselor's alcove inside the hub.

**Launch state (future-stable)** `[LOCKED]`: at summer's end the sea holds the Central Island +
the two summer grapes (§0.5), nothing else. The overworld renders whatever the **island registry**
contains — zero grape islands is a valid, beautiful state (open sea, mist banks, pencil hints on
the chart that read as promise, not emptiness), and every new grape takes its place in its
taxonomy group with zero world-code changes. Islands an ATC member adds later **rise from the
sea** with a full animation (§6.5). Growth is designed into the geography.

The world sits behind the **world-provider seam** `[LOCKED]`: Gear 2's ocean can later be swapped
for the 1:1 campus without touching Gear 1.

### 3.2 The Central Island + the Panther's Maw (the hub) `[DECIDED — Ash-steered 2026-07-02]`

Not a themed "campus commons" — an **extremely detailed, beautiful, mountainous tropical jungle
island** at TavernWorld quality, the game's main map. CC drives the hundreds of details; these
are the fixed bones `[LOCKED — Ash]`:

- **Silhouette** `[UPDATED 2026-07-02 — Ash steer, supersedes the panther-head shape]`: the
  island is a **PANTHER PAW PRINT** — a broad main pad, four toe islets at true print
  proportion arced close over its crown, and a small bare-rock **claw islet** off each toe tip
  (the talon marks that make it a predator's track from the map view). Still nature first,
  panther second: a landmass you squint at, never a cookie-cutter paw. The built shape lives in
  `src/game/island/shape.ts`.
- **THE VOLCANO** `[UPDATED 2026-07-02 — Ash steer]`: the central mountain is a **tall curved
  cone like Mayon** — a real volcano presence, live blowhole crater at the summit. Build split:
  the jungle lowlands keep the **layered tile terraces**, but the basalt mountain itself is
  **PixelLab hero art** (a painted cone the tile terrain meets), because the carved heads must
  read seamless from the rock — tiles can't do that.
- **FOUR CARVED PANTHER HEADS — one per side of the volcano** `[UPDATED 2026-07-02 — Ash]`:
  each face of the cone wears the BLHS panther carved from the stone, and each mouth pours
  **LAVA, not water** — four glowing flows running down the faces, cooling into black basalt
  deltas before the jungle. The south head is the gate: its flow splits around the carved
  stone tongue-stair, and **Thor enters THROUGH THE PANTHER'S MOUTH** between the molten
  curtains. The single most screenshot-able moment in the game.
- **FOUR PORTS — north, east, south, west** — each a full working dock for ship arrival, each
  **purpose-built art** (no beach-kit reuse — Ash 2026-07-02). The intro arrives at the east
  port. Each port gets its own small flavor identity (fishing nets N, the arrivals bell E,
  cargo crates S, a quiet cove W) so returning players learn the island by its edges.
- **Pathways lead inward from every port** through dense layered jungle — river crossings, rope
  bridges, ruins, totems, waterfall pools, canopy shade, ambient life (birds, butterflies, a shy
  deer, stream fish) — all climbing toward the center.
- (superseded by the four-heads bullet above: the mouths pour **lava**, not water; the south
  head remains the Maw's entrance via the carved stone tongue-stair.)
- **THE PANTHER'S MAW — the hub cave inside the mountain**: the classic RPG home base. Warm
  torch-and-lantern-lit stone, the lava curtains glowing past the mouth entrance (their heat
  shimmer on the threshold), light shafts from cracks above. Inside:
  - **the chart table** — the YEAR PLANNER (§7.2), the harbor master's post
  - **the counselor's alcove** — every real cord/seal explained + the cord tracker board
    (Wiseman's "surface the hidden earnable things", live)
  - **the outfitter's nook** — the dressing room, revisitable (the heron tailor moves in)
  - **the Advisory Hearth** — a firepit ring where each year's REQUIRED CORE BEAT plays (§7.3)
  - **Principal Panther's desk**, the Handbook lectern, and a trophy wall that fills as you play
  - a back passage to a hidden vista balcony BEHIND the falls (sticker)
- **Outdoor features**: the POWER-values monument — five carved basalt steles along the main
  path, one per letter, verbatim from the Handbook; the panther-head **lighthouse** on the
  highest coastal bluff (sweeping beacon, climbable vista); a tiny **BECU treehouse branch**
  easter egg (real: the in-school BECU branch opened 2006); 2-3 more hidden discovery spots.
- Naming: "the Central Island" is this doc's working handle; its in-fiction name is an `[ASH]`
  fork (§17).

### 3.3 Time, seasons, weather `[DECIDED]`

- **The game-year is the clock.** No day/night cycle to manage; each YEAR advances the world's
  season dressing: Y1 fall (golden, homecoming banners), Y2 winter-into-spring (string lights,
  drizzle, blossom), Y3 fall again with richer decorations (you know the place now), Y4 spring
  (graduation bunting building up at the falls terrace all year). Re-tint + prop swaps, not re-art.
- **Within a year, the three seasons are the planner's structure** (§7.2): fall/winter/spring
  columns; the overworld's light grade shifts subtly as you complete each season's slot.
- **Weather moods** on the ocean: golden-hour default, occasional PNW drizzle with sun-breaks
  (soft rain streaks + dimmer grade + wet sparkle on deck), light morning mist banks that
  undiscovered islands hide inside. Weather is a mood layer, never a mechanic. `[LATER]` storm
  vignette for one scripted beat (senior-year crossing).
- **The orca** `[LOCKED keeper]`: rare ambient breach in open water (~1 per 10 min sailing, never
  twice in a session). Seeing it = a hidden achievement ("Resident").

---

## 4. THE FRONT-END SCREENS (before/around the world)

`docs/research/frontend-flow.md` is the evidence base; this section is the build spec. All UI here
is the PixelLab kit (§11): aged paper on carved wood, 9-slice, drawn icons, the game font (§11.2).

### 4.1 Boot splash `[DECIDED]`
~1.5s, auto-advances when the bundle is ready, click-to-skip the moment it can.
A foam line sweeps across the deep-teal field; the **panther crest** presses in with a 1px
squash-settle and a soft chime; "Algorithmic Thinking Club presents" in small caps below.
**Interactive**: clicking the crest makes it purr with a teal sparkle; 2% of boots the crest's eyes
glint gold (pure Stardew-logo energy, costs one extra frame).
Data: `session_start` (anonymous boot id, device class, viewport).

### 4.2 Title screen `[DECIDED]`
- **Background = the live intro beach scene itself** (BeachIso rendering, slow ambient camera drift
  along the cove, tide running, crabs, gulls, ship at the pier). The title screen is not a picture
  of the game; it IS the game, idling. Seasonal variants ride the year system (§3.3).
  *(Built 2026-07-02 with an interim captured frame of the live cove + a slow CSS drift; the
  live-idle swap lands when BeachIso gets an ambient/no-input mode.)*
- Wordmark: hand-lettered carved-driftwood sign, teal accent, gull perched on the B (click it: it
  flaps to the other end). 2-3 hidden toys total (gull, lighthouse beacon flash, crest purr).
- **Smart CTA** `[LOCKED]`: no save → one big "Set Sail" plank. Save exists → "Continue — Year 2,
  Winter" as the dominant plank + small "New voyage" beneath + "Welcome back, <handle>" ribbon.
- Corners: settings gear (§4.7), sound toggle, tiny "About / credits" shell button.
- Music: Ash's main theme, first phrase looping quietly. `[ASH]` deliver when ready; placeholder =
  tasteful ambience (surf + gulls) rather than temp music.
- Data: `title_shown`, `continue_clicked` / `new_voyage_clicked`.

### 4.3 Join by class code — diegetic, inside the intro `[DECIDED — the big reconciliation]`
The campus-era flow put join between title and game. The island game does better: **the bottle IS
the join.** The class code arrives in the story (I-2/I-3, §5): the unfurled message asks for "the
words your teacher gave you." Same frictionless spine as Kahoot (code → name → go), but it happens
inside a cutscene moment instead of a form. Full interaction spec in §5 I-3. The mechanics
`[LOCKED]` from frontend-flow: 6-char case-insensitive segmented field, ambiguous glyphs excluded,
auto-advance boxes, paste + `/join/CODE` direct-link support (pre-fills and skips straight to I-3's
filled state), kind one-line errors, shake not red walls, rate-limit after 3/5 failed tries,
distinct "class not open yet / closed" messages, offline retry, and the **castaway path**: "No
code? Wash ashore anyway" → demo mode, nothing logged, banner shows "exploring as a castaway."
Data: `join_attempt`, `join_ok` (class id, arm assignment resolved server-side), `demo_entered`.

### 4.4 Identity `[DECIDED]`
On the same unfurled parchment (I-3): handle + pronouns.
- **Handle**: field + a "spin" driftwood die. Generator = safe two-word nautical/panther combos
  ("BraveTide", "GoldenGull", "QuietHarbor" + optional "Thor" suffix), profanity filter on typed
  handles with auto-replace (Kahoot behavior), reassurance line: "This name is what your class
  sees. Your real name never leaves the room."
- **Pronoun chips**: he / she / they / ask me. Feeds dialogue templating ({they}/{them} forms).
- Data: `identity_set` (handle hash, pronoun choice, generator used y/n, spins count).

### 4.5 The Wardrobe (dressing room) `[DECIDED]`
Part of the I-3 UI session on the beach: after the letter, a weathered **castaway trunk** creaks
open beside Thor (the heron tailor — the game's one recurring service NPC — fusses him into
frame; she later runs the outfitter's nook in the Maw). Thor stands in iso 3/4, idle-animated,
and **reacts to every change** (ear perk, tail flick, a pleased blink). v1 slots: fur accent tint
(constrained brand-safe swatch row), headwear, outfit, one accessory. Locked items show a small
gold cord-knot lock with "earn by: <real thing>" (letterman jacket = reach Varsity in any sport;
robotics goggles = complete Robotics; the graduation cap = finish a run). One-click randomize
die. Fully skippable ("Thor looks great already" default). Revisitable any time at the hub.
Data: `cosmetic_change`, `dressing_skipped`, `locked_item_inspected` (curiosity signal!).

### 4.6 Name your boat `[DECIDED]`
The I-3 UI session's closing card — the letter's postscript reads "P.S. The rigger at the pier is
yours. She'll need a name." Filtered text or a spin (generator leans nautical-cozy: "Second
Wind", "Panther's Wake", "Late Pass"). Skipping names it "The Bonney." The payoff lands at the
port (I-4): as Thor walks up the pier, the name is already **freshly painted on the stern** — the
student's first "the world heard me" moment. It persists on the hull for the whole game and on
the cape screen.
Data: `boat_named` (generator y/n).

### 4.7 Settings `[DECIDED — v1 built 2026-07-02]`
**Per Ash:** the settings gear must be reachable IN-WORLD on every map (the beach shows only
the gear; the island map later adds the fuller RPG HUD per §11.1). v1 sheet ships sound mute,
text size S/M/L, reduced motion, about/privacy — on the kit's square panel, local storage.
Reachable from title gear + pause. One paper panel, four tabs: **Sound** (music/SFX sliders, mute),
**Display** (text size S/M/L, reduced motion, colorblind-safe palette toggle for state colors),
**Controls** (WASD/arrows, full keyboard map, click-to-move toggle), **About** (credits, privacy
one-pager in plain language, build version). No account tab; there are no accounts.
Data: `settings_changed` (which, to what).

### 4.8 Pause (in-world) `[DECIDED]`
Esc = the world blurs 2px + letterboxes; a small anchor-icon panel: Resume / Handbook / Chart /
Settings / "Save & leave" (saves happen anyway; the button is reassurance). Never blocks autosave.

### 4.9 Loading & transition screens `[DECIDED — Ash-steered 2026-07-02]`
**The hero pattern (LOCKED, Ash):** big scene changes load behind a FULL-BLEED PixelLab
illustration — the TavernWorld pattern: a gorgeous painted scene, "ENTERING <PLACE>" in the
display face, a slim filling bar, one BLHS fact, and code-animated life (twinkles, glow, slow
drift) so no two waits feel identical. Built as the `scene` cover in the transition library;
first illustration = the sunset voyage (`/art/ui/loading-voyage.png`); each major destination
earns its own illustration over time. The chart-unroll stays for map/planner/handbook openings.
One transition controller (§12) owns every load. Loading cards: aged-paper chart fragment, a
compass needle settling as the progress element (accelerates near the end), one line of flavor +
**one real BLHS fact** drawn from the Handbook pool, weighted toward things the player hasn't
learned yet (the wait teaches; facts already collected show with their sticker). Never a spinner,
never a blank frame.
Data: `loading_fact_shown` (fact id, dwell ms).

---

## 5. THE INTRODUCTION (the bar-setter, hyper-detailed)

The realization of Ash's storyline (2026-07-02) + `intro-sequence.md`. The beach map is
**cutscene-staged** `[LOCKED]` (no free roam); every beat runs on the iso engine with the
cutscene runtime (§12.3). **A skip affordance is always present** `[LOCKED — Ash]`: a small
"skip ▸" plaque, hold-to-skip 600ms, jumps to the next REQUIRED interaction; the join can never
be skipped past. Dialogue advances on click/space at the player's pace. Total target: **6-8
minutes** including the setup UI; the pure-cinematic parts sum to under 3 minutes (respect the
advisory clock).

### I-1 · Waking up `[DECIDED — Ash's opening]`
1. On the title CTA: the screen holds black for a breath, then **opens slowly from black with a
   heavy vignette — roughly 80% of the frame edge staying dark** — like eyes opening. Inside the
   soft aperture: the built cove at golden hour, tide breathing, sound arriving before the image
   finishes waking (surf, gulls, wind in the palms).
2. **Thor wakes on the sand** (new frames: stir → sit up → head shake with sand scatter → stand):
   washed ashore above the wrack line, a scuffed drag mark and a few paw prints behind him
   telling how he got here without a word.
3. The **dialogue UI** appears at the bottom (the game's standard paper box, §11.1) and orients
   the student in Thor's groggy voice — 2-3 lines max ("Sand. Ocean. ...Where is this?") —
   skippable like everything else. The vignette relaxes to the map's normal golden grade as he
   stands. Letterbox stays on.
Data: `cutscene_start('intro')`, `first_input_ms`.

### I-2 · The bottle `[DECIDED, next build]`
1. Beat of quiet: Thor upright, the cove alive around him.
2. **The delivering wave** (the showpiece animation): one scripted tide front runs higher than
   the cycle's others (the tide system already supports per-wave shape overrides); riding its
   film, a **corked green-glass bottle** (PixelLab: floating/tumble/beached/glint states) surges
   up the sand, rolls twice with wet sparkle, and settles in the wet band as the water retracts
   around it. Trail bubbles pop. A gull lands, considers it, is unimpressed, leaves (comic
   beat, 2s).
3. **Thor spots it**: ear-perk, head turn. Player gets ONE input: a soft pulse prompt "walk to
   it" (arrow keys nudge Thor along a rail; any key works; after 6s idle he goes himself). The
   game teaching "you move Thor" with zero tutorial text.
4. **The pickup**: Thor kneels (3-frame pose), lifts the bottle; camera pushes in slow (2.5s
   zoom ease) as the sun flares once off the glass.
5. **The cork pops** (hollow *thup* + gull startle); the rolled parchment slides out, teases the
   wax **panther-paw seal**, then unfurls UPWARD to fill the frame — the unfurl IS the
   world-to-UI transition: the parchment becomes the I-3 session. The ocean stays live and
   audible behind it, dimmed 20%.
Assets: bottle states, parchment + seal, Thor wake/kneel/lift poses, glint particles.

### I-3 · The UI session (join → identity → letter → wardrobe → boat) `[DECIDED]`
Everything the student sets up happens here, on and around the parchment, without ever leaving
the beach. Five cards, each skippable-to-default, all in the PixelLab kit (§11):
1. **The code**: the letter writes itself in (typewriter, skippable to instant) —
   > *"Panther. We saved you a spot. Bonney Lake takes new explorers every fall, and the tide
   > brought your invitation right on time. Your teacher left you a code. Speak it, and the
   > harbor will know your name."* — a paw print, **Principal Panther**
   The **six segmented code boxes** sit inside the letter itself (§4.3 mechanics; the castaway
   path prints *"No code? The sea takes strays too."*).
2. **Identity**: handle + pronoun chips appear on the parchment once the code lands, the class
   confirmed in-fiction (*"Ah. Mr. Wiseman's crew."*) (§4.4).
3. **The Principal's word**: the letter turns over to the warm three-sentence premise — islands
   are real school things, four years, you can't do everything, choose well. The student's
   "what is going on" anchor, delivered in-fiction.
4. **The wardrobe**: the castaway trunk + heron tailor beat (§4.5). *(Joins the built flow when
   the trunk + tailor art lands; the session currently runs code → identity → word → boat.)*
5. **Name your boat**: the postscript card (§4.6).
The parchment rolls back up, Thor pockets it, letterbox returns → I-4.
*(I-1 through I-3 built + validated on screen 2026-07-02 — see STATE-OF-PLAY §2.)*
Data: §4.3/§4.4/§4.5/§4.6 events + `letter_read_ms`.

### I-4 · The walk to the port `[DECIDED]`
Camera pulls back to scene scale; Thor walks the worn sand path toward the pier, PLAYER-DRIVEN on
a soft rail (free walk inside a corridor collider; the port is the only exit). The scene's
ambient life plays around him; passing the panther rock triggers one caption line (*"Somebody
carved this a long time ago."*). At the pier the two-masted rigger (Ash-approved, paw sail)
waits, lanterns breathing, **the boat's new name freshly painted on the stern**. Thor climbs the
rope ladder (4-frame climb, deck thunk) and takes the wheel. No stalls, no detours: walk up,
hop on.
New assets: Thor climb frames, stern name-paint compositing, heron tailor NPC (from I-3).

### I-5 · Setting sail (the ceremony) `[DECIDED]`
The one big button moment `[LOCKED from frontend-flow]`: a final composed vista — Thor at the
wheel, YOUR name on the stern, the sail unfurling to show the black paw (swap to the stocked
`ship-sailing.png`) — and one enormous carved plank: **"Set Sail."**
On press: bow line slips, the ship eases off the pier (mooring lines were baked into ship.png;
the sailing sprite is clean), the **wake** opens behind the stern (the wake system's debut,
§6.2), the beach slides away with the camera holding Thor center, the gull escort peels off.
The ship runs a few seconds into open water, the cove shrinking behind, the sea deepening under
the hull. Music: the main theme's first full statement `[ASH]`. Data: `sail_started`.

### I-6 · THE MAP SWITCH (beach map → island map) `[DECIDED — Ash's mechanism]`
The crafted seam between the two maps — a real loading screen, done at the bar:
1. A few seconds into open water, the **PixelLab loading transition** rises: the chart-unroll
   cover (§12.1) sweeps the frame — an inked parchment chart, a paw-drawn line advancing from
   "the far shore" toward a big island in open sea, the compass needle settling as the progress
   element, one real BLHS fact on the card (§4.9). **2-3 seconds**, classic loading-screen
   fashion, while the island map loads and the beach map unloads.
2. The chart lifts: **back in the RPG world — now on the ISLAND MAP** — same ship, same wake,
   same heading, but open ocean in every direction (this map's sea is vast; the deep-ramp abyss
   reads properly endless).
3. **3-4 seconds of approach**: the Central Island resolves ahead — the mountain first, then the
   glint of water falling from the great panther's mouth, then the east port. A drizzle veil
   with a sun-break crosses once (PNW hello). The ship noses into the dock; the arrivals bell
   rings twice.
Data: `map_switch` (real load ms — what the 2-3s target is tuned against), `voyage_completed`.

### I-7 · Ashore `[DECIDED]`
Thor steps off onto the east port's dock (boarding-height dock; the ladder gag is not repeated).
Two dockhand NPC silhouettes catch the lines. One beat of harbor ambience — and the moment his
paws pass the dock gate, I-8 takes the camera.

### I-8 · The reveal (pull-out → introduction → return) `[DECIDED — Ash's structure]`
1. **The pull-out**: from Thor's iso view the camera lifts and zooms OUT in one continuous eased
   move (the animatable camera at extended range) — the port, the jungle flank, the panther
   mountain with its falling water, the whole barely-panther-shaped island — and keeps going,
   out to the **entire archipelago's waters** with the Central Island at the center.
   **FUTURE-STABLE** `[LOCKED]`: the shot renders whatever the island registry holds. At launch
   that is the Central Island nearly alone in a vast sea of mist banks and open water — which
   reads as promise, not emptiness; as grapes ship, this exact shot fills island by island with
   zero code changes.
2. **The introduction**: over the held wide shot, a short dialogue (Principal Panther's voice,
   3-4 lines): every island out there is something Bonney Lake actually offers; four years; you
   can't do everything; make it count. The **Year 1 — Fall** plaque eases in and out.
3. **The return**: the camera dives back down the same path to Thor on the dock, the world
   scale-snapping back around him. Letterbox releases.
This shot is the game's signature image (key art, Gear 2's title, the cape screen background).
Data: `reveal_seen`.

### I-9 · To the Maw (the game begins) `[DECIDED]`
Free control, first time for real. The east path pulls Thor inward: through layered jungle (the
POWER steles punctuating the walk — readable, never forced), across the river, to the falls
pool — and up the **carved stone staircase, in through the panther's mouth**. Inside the Maw:
the **founding event** — **Principal Panther** (a broad-shouldered elder panther, reading
glasses, a teal scarf) at his desk hands over **the Handbook** (the binder thunks into the HUD
corner with a sparkle) and **the three season tokens** (the planner currency, §7.2), ~8 warm
lines total, and gestures to the chart table. The planner opens. **Gear 1, Year 1 begins.**
Data: `founding_event_complete`, `handbook_granted`.

---

## 6. THE OCEAN OVERWORLD & THE ISLAND LOOP

### 6.1 Sailing `[DECIDED]`
- Direct control: WASD/arrows steer the ship (8-dir sprite set + banking lean frames); momentum
  eases in/out (a boat, not a car). Shift = full sail (1.6x, bigger wake, sail-snap sound).
  Click-to-sail (click water, ship routes there) for trackpad kids — both always on.
- **The wake** (Ash's owed feature): stern wake = two diverging foam lines from the measured hull
  corners (seamless-x foam strips, the tide-lace technique at 40% opacity, fading over 3s of
  world-space trail), bow = a small breaking collar. On turns the wake curves (points sampled from
  the hull's actual path). Splash flecks at speed. NO shader; it's the beach foam system following
  a moving anchor.
- Collision: islands and reefs use measured-base colliders (the beach engine); running aground =
  a soft bump + foam burst + Thor's ears flatten (never a fail state).
- Ambient sea life: gull escorts near shore, fish-school shadows under the veil, the orca (§3.3),
  buoy bells near harbors, hand-painted island signposts readable on approach `[LOCKED keeper]`.

### 6.2 The chart (map screen) `[DECIDED]`
Tab/M or the HUD compass opens the **nautical chart**: the same parchment from I-6, drawn in the
game's ink style. Discovered islands are inked with their landmark silhouette + name; undiscovered
ones are faint pencil outlines ("something's there"); never-approached regions show sea-serpent
doodles (chart humor). Island states (§6.4) render as chart stamps. Gear 1: shows this year's
affordable islands highlighted per remaining tokens. Gear 2 `[LATER]`: click any discovered island
to fast-travel (the sail-shadow transition). "You are here" = a tiny ship marker with your boat's
name. Data: `chart_opened`, `chart_island_inspected`.

### 6.3 Discovery & fog `[DECIDED]`
Islands are **misty silhouettes** until first approach: within 2 island-lengths the mist veil
dissolves (staged alpha + LOD swap) and a discovery sting plays + the chart inks the island
(`island_discovered`). Discovery is deliberately cheap to earn (sail near) because awareness IS
the educational goal: a student who never enters the DECA island still learned DECA exists, and
the log records the exposure.

### 6.4 Island states (read at a glance) `[LOCKED keeper set, DECIDED realization]`
1. **Misty** (undiscovered): silhouette in fog.
2. **Discovered**: full art, dock unlit, name signpost.
3. **Available** (Gear 1: affordable this season): the dock's lanterns glow warm and a small teal
   pennant runs up the dock pole.
4. **Active** (a slot is committed here): your paw-crest flag flies at the dock.
5. **Completed**: a planted banner + the earned rank/cord token hanging off the dock sign; interior
   NPCs remember you; the island's chart stamp fills gold.
6. **In-season / out-of-season** (sports): out-of-season sports islands read sleepy (covered
   equipment, dimmer). Hovering explains: "Football is a fall sport. Come back in fall."
7. **Rising** (new grape shipped): §6.5.

### 6.5 A new island rises `[LOCKED keeper]`
When ATC ships a new grape, returning players witness it: sea bulge → foam ring → the island
surfaces with waterfall run-off → gulls circle → its signpost plants. Logged (`island_risen_seen`)
and celebrated on the title screen ("NEW: the Chess Club island surfaced this week").

### 6.6 THE ISLAND LOOP (the template every island inherits) `[LOCKED shape]`
`ARRIVE → MEET → DO → RESULT → LEAVE`, realized as the **7-beat encounter** (carried from the GDD,
still correct, now per-island):
1. **Approach & dock**: sail in, the dock transition plays (§12.2, per-island flavor).
2. **Arrive**: a true-iso interior/exterior space, recognizable, dense to the 8 rules, with
   background life proper to the real thing (robots whirring in the drydock, band tuning, the
   kiln glowing, cleats clacking in the tunnel).
3. **Meet**: the characterful NPC host at their real post: the coach (real name from the sports
   tables: "Coach Bruce" on the football island), the club president/advisor cameo (pixel-Ash in
   ATC's lighthouse — the one true cameo `[LOCKED]`), a counselor. Nameplate, idle anim, portrait
   dialogue with personality; the intro beats teach WHAT it is, WHEN it meets/plays, HOW to join
   (the three facts every island must land — Wiseman's taxonomy minimum).
4. **Do**: one short scored activity, 3-6 minutes, woven not bolted (§6.7).
5. **Result**: immediate juiced feedback → a grade lands (0-4.0 scale, §8.1) → rank/cord progress
   ticks visibly (the cord tracker flashes at the moment of progress: "Career Readiness: 1 of 2
   CTE credits") → the island's **collectible sticker** drops into the Handbook → one takeaway
   fact card ("DECA meets Thursdays 2:10, room 200 Flex — for real").
6. **Join (optional)**: a clear diegetic "sign the roster" moment that commits future-year intent
   (fuels rank progression, §8.2) — joining is always a choice, never automatic.
7. **Leave**: sail-off transition; the world remembers (state → completed; NPC greetings change;
   the dock banner plants).
One island also hides **one easter egg** (a peek-behind detail from real BLHS: the Jordin Andrade
hurdles record board at the track, the 2013 boys-soccer state-title banner at the pitch, the
2016-17 wrestling title in the gym rafters — all real).

### 6.7 Activity types (the DO palette) `[DECIDED]`
Every island picks ONE primary from this kit (the grape contract already supports the first
three; the rest are the minigame frames the vine provides):
- **Woven check** (dialogue-consequence / sort / match): the baseline; never a bare MCQ wall.
- **Clip + check**: the real club's video in a designed player (Wiseman's baseline), then a woven
  check on it.
- **Themed micro-game** (the vine ships reusable frames ATC can skin):
  - *Timing bar* (football pass lead, culinary flip, pit-crew wheel change)
  - *Trace/path* (drill formation for JROTC, a track relay baton line, a marching set)
  - *Sort/stock* (stock the trophy case by season, sort recyclables for Earth Savers, mise en
    place for culinary)
  - *Sequence/logic* (ATC's code-block puzzle, robotics build order, music-theory interval match)
  - *Rhythm tap* (band/choir: match the metronome; drama: hit the cue lines)
- **Info-space** (no minigame): counseling grove, policy spaces — exploration + dialogue + a
  reflective choice. An island may be "learn this place" `[LOCKED]`.
The **plain arm** renders the same content as text/clip + standard check — the frames carry
identical items so the study compares content-constant arms `[LOCKED]`.

### 6.8 The island roster: the two summer grapes + the members' map `[LOCKED scope — Ash]`

**Built by us, the FINAL summer phase, at full bar (the proof + the copyable templates, §0.5):**
1. **ATC — the classroom island**: a smaller jungle islet; at its center, the real ATC computer
   lab, as faithful to the actual BLHS room as our references allow, **blended INTO the island**
   (jungle growing to the walls, a worn path from the dock to the door, the server-rack
   lighthouse behind it as the from-the-sea landmark). Pixel-Ash hosts (the one true cameo
   `[LOCKED]`); sequence/code-block puzzle; the meta beat: "members built the island you're
   standing on."
2. **Football — the stadium island**: the stadium rising at the island's center (floodlights =
   the landmark, readable across the map at dusk), tunnel run-out transition, Coach Bruce (the
   real head coach), timing-bar passing drill, Varsity rank track, Friday-lights atmosphere lock.

**The members' map (ATC builds these on the SDK + archetypes, §14.1, fall onward)** — all from
the real roster in `blhs-specifics.md`, none ours to build this summer: Robotics/FRC 3218
drydock, Culinary dockhouse, Key Club service cay, DECA exchange, HOSA infirmary isle, the PAC
marquee island, band shell, drama, art-kiln, JROTC drill islet, NHS, Panther Crue, GSA,
International, yearbook, media network, and the remaining sports by season.
The **counselor's alcove** (info-space inside the Maw) ships with the hub as the info-island
template.

---

## 7. GEAR 1 — THE FOUR-YEAR RUN (the advisory game)

### 7.1 Frame `[LOCKED]`
4 years, one year ≈ one 40-min advisory session, save/resume between. Scarcity is the engine:
you cannot do everything, so choices mean something (Wiseman's confirmed core). A **single-year
"One Season Sprint"** teacher option exists for tight schedules `[DECIDED]` (Wiseman asked for a
bounded-run mode: one year, 3 slots, mini-summary; same code path, one flag).

### 7.2 The Year Planner (the strategy screen) `[DECIDED — the design centerpiece]`
Location: the chart table inside the Panther's Maw (§3.2; walk up each fall; also openable from
the Handbook). The table holds THE YEAR SHEET, a big paper spread:

- **Three season columns — FALL / WINTER / SPRING — and three carved tokens.** One token per
  season; drag a token onto an island card to commit that season. Sports cards only accept their
  real season (the real season tables drive this: volleyball is fall, wrestling is winter,
  baseball is spring); clubs accept any season. The physical drag with a wood *clack* is the
  "choice that stings" moment; tokens visibly leave your hand.
- **The class schedule strip** (top of the sheet): pick **2 focus classes** for the year from a
  short real list (AP courses by grade eligibility from the catalog, world languages, CTE
  courses, arts). Classes are lightweight beats (§7.4), not island voyages; they exist because
  the real cords demand them (AP Honors needs 5 APs; the Seal needs years of language; Career
  Readiness needs 2 CTE credits). The planner shows each class's cord relevance inline.
- **The advisory pin** (fixed, every year): the required core beat (§7.3), pre-printed on the
  sheet. Not optional, not a token.
- **The counselor's margin notes**: live cord-tracker hints written in pencil on the sheet's edge
  ("two more AP classes and AP Honors is yours", "Spanish III next year keeps the Seal alive") —
  awareness during planning, when it can still change a choice.
- **The rival's sheet**: pinned beside yours, **Marisol** `[DECIDED name/character — ASH veto]`,
  a sharp-eyed otter classmate who fills her sheet differently every year (a simple
  complement-picker: she takes high-value things you didn't). At each yearbook you see her year
  too — the roads not taken, made visible. She's warm, competitive, never mean.
- Confirm = the harbor master stamps the sheet (satisfying thunk + wax press).
Data: `planner_opened`, `slot_assigned` (island, season, deliberation ms, changes before stamp),
`class_picked`, `planner_stamped`.

### 7.3 The required core beat (the fixed study content) `[LOCKED intent, DECIDED content]`
Every year opens with a required scene at the Advisory Circle — the **fixed, common content every
student gets regardless of choices**, which makes the AP Research measurement valid (the core is
the pre/post-tested curriculum; slot choices ride on top):
- **Y1 — "This is the place"**: POWER values (the five steles, one interactive beat each),
  bell schedule + the Monday advisory rhythm, reading the chart, how joining works.
- **Y2 — "The hidden ladder"**: the counseling grove tour; every real cord/seal and its criteria;
  the Universal Retake Policy taught AS the game's retry mechanic (§8.1) — real policy as rules.
- **Y3 — "The long game"**: graduation requirements (24 credits, the real subject breakdown),
  dual credit / Running Start / CHS, AP Capstone's exact rule (Seminar+Research+4 AP).
- **Y4 — "Finish like a Panther"**: the cords audit (what you're on track for and what's still
  reachable), the High School and Beyond Plan nod, graduation logistics as flavor.
Each is 4-6 minutes, fully in-world (dialogue + one woven check each), never a slideshow.

### 7.4 Classes (the AP Academy + halls) `[DECIDED]`
Focus classes resolve as **short scenes at their home space** (the AP Academy on the STEM reef
hosts AP courses; language classes at the international hall; CTE classes at their Trades Harbor
islands, which double-count if you also spent a slot there): a 2-3 minute beat — the teacher NPC,
one taste of the real course ("AP Human Geo in one map puzzle"), one check → a class grade that
feeds GPA and the cord counters. Passing an AP class = one AP credit toward AP Honors/Capstone.
Art scope containment: the Academy is ONE hall with themed alcoves per course, not 22 islands.

### 7.5 The year's rhythm (a 40-minute session, beat by beat) `[DECIDED]`
```
0:00  Resume/arrive at the Central Island (season dressing has advanced)
1:00  Year-start vignette (Principal Panther, 3 lines, one theme per year)
2:00  THE PLANNER (~5 min of real deliberation)
7:00  Required core beat (~5 min)
12:00 Season 1 island voyage + island loop (~8 min)
20:00 Class beat #1 (~3 min) — slotted between voyages as pacing valleys
23:00 Season 2 island (~8 min)
31:00 Class beat #2 (~3 min)
34:00 Season 3 island (~8 min)  ← runs past 40 for slow readers: the yearbook
42:00 THE YEARBOOK PAGE + autosave        can open next session instead; the
                                           session boundary is soft [DECIDED]
```
Pacing insurance: every beat is individually resumable; a year interrupted anywhere resumes at
that beat's start. Fast students who finish early get a "free sail hour" inside the year (roam,
discover, no new commitments) — discovery is never wasted time.

### 7.6 The yearbook page (year end) `[LOCKED keeper]`
A full-screen spread in the Handbook binder, composed like a real yearbook page: your year's
snapshot (an auto-composed scene of Thor at your most-invested island), GPA movement (an inked
number that writes itself), stickers earned, cords inching forward (partial cords render as
fraying threads becoming rope), Marisol's page opposite yours, and one gentle nudge line
("You never did make it to the drydock. The robots noticed."). Then the season turns (a page-flip
transition into the next year's dressing). Data: `year_end` (full year summary payload).

### 7.7 Save / resume `[LOCKED mechanics]`
Three layers (server vs anonymized ID as truth; device-local for instant resume; autosave at every
beat boundary + tab-blur/pagehide). Resume lands at the current beat's start, in the harbor if
between beats. No save-slot UI ever. Cross-device: class code + handle restores from server.

---

## 8. PROGRESSION (the systems under everything)

### 8.1 GPA `[LOCKED concept, DECIDED math]`
Every scored beat grades 0-4.0 (letter shown, real BLHS scale A=4.0 … F=0). GPA = credit-weighted
mean (islands 1.0 credit, classes 0.5, core beats 0.5). **The Universal Retake Policy is the retry
mechanic**: score under a B- and you may retake once after a hint scene ("legitimate effort" =
you must review the takeaway card first) — the real policy, teaching itself. GPA displays only in
diegetic places (planner margin, yearbook, handbook, cape) — never a floating HUD stat `[LOCKED
anti-prototype]`.

### 8.2 Ranks `[LOCKED]`
Invest in the same sport/club across years: Year 1 = JV/Member → Year 2 = Varsity/Officer →
Year 3+ = Captain/President. Rank-ups are scenes, not toasts: the coach hands you the letterman
(unlocks the cosmetic), the club votes. Ranks print on the cape.

### 8.3 Stickers, achievements, cosmetics `[DECIDED]`
- **Stickers**: one per island, collected into the Handbook's back pages (the completion meta).
- **Achievements** (quiet, diegetic badges on a Handbook page): Resident (orca), Cartographer
  (discover all), Early Bird (finish a year with time spare), Renaissance Panther (a slot in
  every category across a run), Loyal (Captain rank), Bookworm (read 25 handbook facts).
- **Cosmetics**: earned per §4.5; the Prodigy trap is designed out — cosmetics come ONLY from
  learning outcomes, there is no decoration loop to hide in, and time-on-task telemetry will show
  it (the study watches for engagement displacing learning; our reward loop and the learning are
  the same loop by construction).

### 8.4 Cords & seals (the cape layer) `[LOCKED — authoritative criteria]`
Straight from `blhs-awards-authoritative.md`, tracked live, revealed at graduation:
| Cord/Seal | In-game earn rule (mirrors the real criteria) |
|---|---|
| Highest Honors (double gold) | final GPA 3.76-4.0 |
| High Honors (black & silver) | GPA 3.5-3.759 |
| Career Readiness (green/teal/purple) | 2+ CTE credits (CTE classes and/or CTE islands) |
| Key Club (navy) | Key Club invested 2+ years incl. senior year + GPA 3.0+ + the service events beat each year |
| AP Honors | pass 5+ AP classes |
| AP Capstone | AP Seminar + AP Research + 4 more APs, all passed |
| Seal of Biliteracy (medal) | a language track sustained to proficiency (3+ years incl. a passed capstone check) |
| Valedictorian/Salutatorian | `[GAP — criteria unknown, placeholder; do not invent]` |
**Honor reveal moments** fire mid-run the moment a threshold becomes reachable or locked
("Three years of Spanish. The Seal is watching you.") — awareness DURING play `[LOCKED]`.

### 8.5 The Handbook `[LOCKED keeper]`
The in-world yearbook binder (granted at I-9, inside the Maw): tabs = **Chart** (§6.2) / **My Years** (yearbook
pages) / **Islands** (per-island entries that fill: the three facts + sticker + your result) /
**Cords** (the live tracker board) / **Facts** (every loading/takeaway fact collected) /
**Badges**. Also the **counselor quick-help** button (a whistle icon): one click surfaces "how do
I…" answers and, in deployment, the real counseling office contact. The Handbook is Wiseman's
reference made a keepsake, and its "Islands" pages are literally the turn-in evidence trail.

---

## 9. GRADUATION (the finale)

`[DECIDED — the emotional payoff, built to the same cutscene bar as the intro]`
1. **The last yearbook page turns** and keeps turning — pages flip faster, the four years
   flickering past (each year's snapshot), slowing onto a blank page titled "Graduation."
2. **The processional**: the falls terrace below the panther's mouth, dressed for commencement
   (the Y4-long bunting build-up completes), the season golden, the great head's water catching
   the light above the stage; every NPC you met is in the crowd, and the ones you ranked with
   stand in the front row (the coach, the club presidents, Marisol — her cape shows HER run).
3. **The cape ceremony**: Thor walks the stage in the real BLHS regalia (from
   `reference/blhs-grad-capes/`): teal gown, teal mortarboard, gold tassel with year charm, the
   black "BONNEY LAKE" V-stole. Then, one at a time, **each earned cord drapes on with its own
   beat**: the cord's name, its REAL criteria, and the moment you earned it (a tiny flashback
   vignette: the counselor's margin note, the Spanish capstone, the fifth AP). Unearned cords do
   not appear, but the final board lists them with "how close you came" (the replay seed).
4. **The diploma**: Principal Panther hands it over; the crowd throws caps; fireworks over the
   harbor; the camera does the I-8 pull-out one more time — the whole archipelago, now inked and
   bannered with everything you did.
5. **The turn-in artifact** `[LOCKED]`: the summary renders as a printable/screenshot **diploma +
   transcript page**: handle, class, GPA, ranks, cords with criteria, islands completed, facts
   learned count, and a short **verification code** (a server-checkable hash of the run) so an
   advisory teacher can accept it as proof. One button: "Save my diploma" (PNG download) — the
   study's outcome measure and Wiseman's concrete outcome, in one artifact.
6. **The unlock**: "The ocean is yours now." → Gear 2 (§10) + the graduation-cap cosmetic +
   New-Voyage replay pitch ("Marisol's route is still out there").
Data: `run_complete` (full transcript payload), `artifact_exported`, `gear2_unlocked`.

---

## 10. GEAR 2 — FREE SAIL `[LOCKED existence, DECIDED scope]`

Unlocks after one completed Gear-1 run. Same world, no scarcity: every island open, all activities
replayable (scores don't overwrite the transcript; Gear 2 keeps its own completion ledger).
- **Completion %** on the chart (islands, stickers, facts, badges).
- **Fast-travel** from the chart (sail-shadow transition).
- **Seasonal events** `[LATER]`: homecoming week dressing in fall (the real tradition), a
  winter lights festival; pop-up islets.
- **Speedrun the four years** `[LATER]`: an optional timed New Voyage for the kids who ask.
- The **world seam** `[LOCKED]`: Gear 2's ocean is swappable for the 1:1 campus later; Gear 1
  is not affected.

---

## 11. THE UI SYSTEM (every element, all PixelLab)

### 11.1 The kit `[DECIDED]`
One design language everywhere (art-direction locked: aged paper on carved wood, nautical-cozy,
teal accents, gold = honors only, every icon drawn). Built as ONE PixelLab family batch (hero
panel first, everything else reference-locked to it), 9-sliced, with CSS-style state transitions
on a single GUI base class (the CrossCode pattern). The full element inventory:
- **Panels**: paper-on-wood 9-slice (3 sizes), parchment scroll (the letter/chart family), the
  yearbook binder chrome, a small floating plaque (nameplates, captions).
- **Buttons**: carved plank (primary), rope-loop toggle, wax-seal confirm (the planner stamp),
  paper tab, tiny icon buttons. All: hover = 1px lift + warm glow; press = 2px sink + wood creak;
  disabled = sun-faded.
- **Dialogue**: lower-third paper box, left portrait frame (rope-bordered), name plaque,
  typewriter text with per-character reading-speed pacing, a bouncing paw-print continue cue,
  choice buttons that fan out like held cards.
- **HUD (minimal, diegetic)** `[LOCKED anti-prototype]`: corner compass (opens chart), the
  Handbook spine (opens handbook), season tokens (Gear 1, only while unspent), context prompt
  plaque near interactables. NOTHING else floats. No GPA bar, no XP bar.
- **Feedback**: quiet "saved" ink-stamp toast, reward pops (sticker peel-and-slap, cord thread
  twist), correct/incorrect = warm chime + NPC reaction vs. a soft "hm" + hint (never a red X
  buzzer — this is a school tool; wrongness is met with warmth).
- **Forms**: the segmented code boxes, text fields as pencil-on-paper lines, chips as small
  stamps, sliders as rope-and-pulley.
- **The chart, planner sheet, yearbook, cape screen**: each a bespoke hero composition on the kit.
### 11.2 Type `[DECIDED]`
Commission the game's own faces via PixelLab `create_font`: a hand-lettered display face
("Harbormaster") for wordmark/headers, and a highly legible pixel body face ("Deckhand") tuned
for Chromebook distance, plus tabular numerals for GPA/scores. No system fonts anywhere.
### 11.3 Accessibility `[LOCKED baseline]`
Text size S/M/L re-flows every panel (9-slice makes this cheap); colorblind-safe state palette
(island states never rely on hue alone: mist/lantern/flag/banner are shape-different); full
keyboard play (every pointer interaction has a key path; the planner drag has a select-and-place
mode); reduced-motion setting swaps big camera moves for cross-fades; captions on all audio-carrying
cutscenes (they're typed captions already by design).

---

## 12. TRANSITIONS, CUTSCENES & GAME FEEL (the connective tissue)

### 12.1 The transition library `[DECIDED]`
One controller (cover-in → swap scene → cover-out), a small set of crafted covers, all PixelLab
frames animated in code: **foam wash** (a wave sweeps the screen; the default world transition),
**iris** (circle centered on a focus point; used into cutscenes), **sail shadow** (a dark sail
crosses; fast travel), **chart unroll** (into map/planner/handbook), **page flip** (yearbook,
year turn), **letterbox ease** (into/out of cutscene control).
Per-island flavored arrivals `[LOCKED keeper]`: football = tunnel run-out into crowd roar; ATC =
terminal boot (green phosphor scanlines typing the island's name); PAC = curtains part; culinary =
the kitchen pass window slides; robotics = a shop door rolls up with a shower of sparks; Key Club
= a hand-stamped event flyer slaps on. Each is ~1.2s, skippable, and doubles as the load mask.

### 12.2 The cutscene runtime `[BUILT 2026-07-02 — src/game/cutscene/]`
One declarative script format powers the intro AND island cutscenes: actors, camera
(pan/zoom/hold), letterbox, vignette, fades, captions, typewriter dialogue, sprite-state swaps,
fx, audio cues, waits, input-gates (walkTo with idle auto-walk / ui / confirm), parallel blocks.
Every step executes LIVE or INSTANT — hold-to-skip (600ms) fast-forwards the world to exactly
where the script would have left it and stops at required gates. Scenes implement a small
`CutsceneStage` interface (`BeachIso` was first); the overlay renders screen-space in DOM over
the live canvas. Scripts are data → ATC members can author simple cutscenes without code
`[LOCKED intent from the contract]`; the grape contract's simple steps map into this format.

### 12.3 Game feel (the standing juice list) `[LOCKED]`
Squash-and-stretch on Thor's landings; footstep dust on sand, clack on planks; water ripples on
click; eased cameras always (no linear lerps); particle pops on rewards; soft shake on big wins
only; button physicality per §11.1; NPC idles everywhere; ambient loops per scene. The separator
between "fine" and TavernWorld — treated as a build checklist item on every scene, not a polish
pass that never comes.

---

## 13. DATA, STUDY & TEACHER LAYER

### 13.1 Event taxonomy (extends `events.ts`) `[DECIDED]`
Everything above already named its events; the consolidated additions to the existing grape
events: `session_start/end`, `heartbeat` (30s, active/blurred), `title_shown`, `join_attempt/ok`,
`demo_entered`, `identity_set`, `cosmetic_change`, `boat_named`, `cutscene_start/skip/complete`,
`first_input_ms`, `sail_started`, `island_discovered/hover/enter/exit`, `chart_opened`,
`planner_opened/slot_assigned/class_picked/planner_stamped`, `core_beat_complete`,
`check_answered` (item, correct, tries, latency), `retake_used`, `gpa_updated`, `rank_up`,
`cord_progress/earned`, `sticker_earned`, `handbook_opened/entry_viewed`, `loading_fact_shown`,
`year_end`, `run_complete`, `artifact_exported`, `gear2_unlocked`, `fast_travel`,
`settings_changed`, `save_ok/resume_ok`. All through the offline-first logger → Vercel fn → Neon.
### 13.2 Study integrity `[LOCKED]`
The four core beats + the two summer grapes' items (ATC + Football) = the fixed measured content
at launch (member islands extend the interest layer, never the core); arm assignment
(game/plain) is deterministic per participant at join; the plain arm renders identical items;
no leaderboards in v1; pre/post checks live as the Y1 core beat's opening check and the Y4 audit.
Consent/IRB/anonymization = institutional track with Wiseman + the AP teacher, pre-deployment.
### 13.3 Teacher screen `[LATER, specced]`
Create class → get code → projector view (code + join count, live) → roster (handles only) →
progress at a glance (year reached, artifact turned in y/n) → reset a student → export CSV →
arm-assignment view (study mode only). Plain web UI (the teacher tool may be un-fancy; it is not
the game), same auth-by-code family.

---

## 14. ARCHITECTURE & THE GRAPE CONTRACT (how ATC builds islands)

- **Scenes** on `SceneManager` (exists): boot/title/intro/overworld/island/planner/handbook/
  graduation as registered scenes; the transition controller wraps `go()`.
- **The vine owns**: the iso engine + ocean/tide/collision systems (built), the cutscene runtime,
  transition library, UI kit, planner/GPA/cords/handbook/save/logging, the overworld.
- **An island-grape declares** (evolves the existing `contract.ts`, stays config-first):
  `manifest` (id, title, category, season(s), cord-relevance tags, landmark description, chart
  position hint) + `space` (the scene layout: tile data + prop placements + marks, generated by
  our tools, editable by members) + `host` (NPC def) + `learn` (the three facts + dialogue) +
  `activity` (one of the §6.7 frames + its items) + `reward` (sticker art, rank track y/n) +
  optional `cutscene` scripts. Config-only covers everything except a custom minigame, which is
  a React component against `VineServices` `[LOCKED ladder]`.
- **The Grape SDK** `[summer — part of phase E]`: a scaffold generator, a standalone island
  harness (`npm run island <id>` renders just your island), a contract validator, and the
  "build your first island" tutorial that doubles as ATC curriculum.

### 14.1 Island anatomy & the scaling answer (Ash's map fear, addressed) `[DECIDED]`

The fear: every grape is its own custom map (the ATC island = jungle islet with the real
classroom at its center; football = an island with a stadium at its center), which makes
map-making look like an Ash-bottleneck that fights quality. The design contains it, because
**~80% of any island is systems we already own**:

- **Every island = RING + STAGE.** The RING (ocean, tide, shore, jungle wall, dock) is composed
  from the shared, proven families — the same water, foam, sand, palms, and pier kit as the
  beach — parameterized (island size, shore-shape seed, dock side, landmark anchor) by an
  **island composer** tool. The ring is generated then art-directed, never hand-built from zero.
- **The STAGE (the island's center) comes from typed ARCHETYPES**, not bespoke maps: classroom /
  lab, gym court, field/pitch, kitchen, stage/theater, office, outdoor ground. Each archetype is
  built ONCE at full bar — **the summer's ATC classroom and football stadium ARE the first two**
  — then a new grape re-dresses an archetype: signage, props from its palette, an accent color,
  the NPC, the background-life loops. A member picks an archetype and fills slots; they never
  lay out a map from scratch. (Some islands can and should break the building-at-center pattern
  — an outdoor archetype, a trail, a cove — the composer doesn't care what the stage is.)
- **The landmark hero is the one bespoke PixelLab piece per island** (the thing you recognize
  from the water): one hero gen + best-of-N, batched by us/Ash in periodic art-direction passes,
  never by members. One hero per island is a sustainable cadence.
- **Tiering keeps quality honest**: Tier A hero islands (custom stages, only when an island
  earns it), Tier B archetype islands (the default, the vast majority), Tier C info-islets
  (dock + one vignette + dialogue, no interior). A Tier B island at the bar beats a Tier A
  island at 70%.
- **The gate**: no member island ships without passing the same Glance + pixel-art-reviewer +
  art-direction loop the core game uses, run on the island harness's screenshot. Quality is a
  pipeline property, not a hope.

This is how "each island is its own map" and "Ash is not the bottleneck" are both true, without
surrendering the bar.

---

## 15. AUDIO & PERFORMANCE

### 15.1 Audio `[ASH owns music; DECIDED structure]`
Original score (Ash): main theme (title + I-5 full statement), a hub/harbor cozy loop,
per-island-group stems layered over a shared bed (athletics brass, arts strings, trades
woodblock, STEM synth-celesta), the transition stinger, the **cord-earned chime** (the sound
worth chasing), a graduation processional. SFX palette: surf/gull/rope/wood/paper/ink/bell
families, all soft-attack (classroom speakers). Everything ducks under dialogue. Sound-off play
is fully legible (captions + visual cues carry meaning).
### 15.2 Performance budget `[LOCKED constraint, DECIDED numbers]`
60fps on a mid Chromebook: ≤2 full-screen canvas composites per frame; world layers baked to
chunked textures (the proven pattern); particles pooled and capped (≤120 live); island scenes
lazy-loaded (manifest-only until entered `[LOCKED scaling]`); total first-load ≤4MB before the
voyage masks the rest; texture atlases per family; no runtime PixelLab calls ever (all art baked
at build time).

---

## 16. BUILD ORDER — THE SUMMER (system first, grapes last) `[LOCKED shape — Ash, 2026-07-02]`

Per §0.5: the ENTIRE system to the bar, THEN the two grapes, THEN members. Each phase is itself
dozens of sub-phases; each ends with a Glance-validated, reviewer-scored, Ash-taste-passed
milestone. The intro (A) is the current gate; nothing below starts until it clears the bar.

**A. THE INTRODUCTION** (STATE-OF-PLAY §5): I-1 wake-up + I-2 bottle (the cutscene runtime is
born here) → I-3 UI session (the PixelLab UI kit's hero batch lands here: panels, parchment,
code boxes, dialogue, wardrobe, fonts) → I-4/I-5 port + sail → I-6 map-switch transition →
**the Central Island** (the biggest art phase of the summer: four ports, the jungle, the panther
mountain + the Maw) → I-8 reveal → I-9 founding event.
**B. THE OVERWORLD SYSTEMS**: sailing + wake, the chart, discovery/fog, island states, the
island registry (the future-stable reveal + rising-island hooks).
**C. THE GEAR-1 SPINE**: planner → the four core beats → GPA/retake → cords + tracker →
Handbook → yearbook → save/resume → the year-rhythm glue → the bounded-run mode flag.
**D. GRADUATION**: the cape ceremony + the turn-in artifact + the Gear-2 unlock.
**E. THE VINE/GRAPE ARCHITECTURE PROVEN**: the contract evolution, the ring+stage island
composer + archetype system (§14.1), the island harness, the plain-arm parity pass, the SDK +
the "build your first island" tutorial.
**F. THE FINAL PHASE — THE TWO GRAPES**: the ATC classroom island, then the football stadium
island, both at full bar, both built THROUGH the SDK exactly as a member would (dogfooding the
handoff). Then Aug 22: ATC members take the map.
Teacher screen, seasonal events, and speedrun ride behind whichever phase has slack `[LATER]`.

---

## 17. OPEN FORKS FOR ASHWATH (everything else in this doc is buildable now)

1. **The planner model** `[ASH]`: 3 season tokens + 2 class picks per year (this doc's design,
   richer and makes every real cord earnable) vs. Wiseman's plainer 2-3 generic slots. My strong
   recommendation is the seasons+classes model; it is the difference between a scheduling
   minigame and a real "what kind of Panther am I" decision.
2. **The Central Island's in-fiction name** `[ASH]`: "the Commons" (campus echo), a real-lore
   name (Panther Isle? Bonney Isle?), or just unnamed ("the island"). The doc uses "the Central
   Island" as the working handle either way.
3. **Marisol the rival** `[ASH]`: name/species/tone veto; she's load-bearing for replay value.
4. **Music timeline** `[ASH]`: when the score lands, and whether placeholders are ambience-only.
5. **The research unit** `[ASH + AP teacher + IRB]`: one year vs. the full arc vs. Kahoot
   comparison — institutional, flagged since island-plan.
6. **Title working name** `[ASH]`: "BLHS Island Explorer" is the placeholder wordmark; naming it
   is a taste call.
7. **AP Academy consolidation** `[ASH]`: classes as one Academy hall + planner strip (this doc)
   vs. AP courses as full islands (unbuildable at 22, but say if the Academy framing feels wrong).
8. **The archetype grape model** `[ASH]`: you flagged you're not confident "island with a
   building at the center" is even the right pattern for every grape. §14.1's ring+stage+
   archetype system works either way (a stage can be a trail, a cove, an open field) — confirm
   the model, or steer the pattern.
