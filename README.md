# BLHS Island Explorer

An exploration RPG that introduces incoming Bonney Lake High School students to what the school
offers, the clubs, sports, electives, AP classes and the culture, by letting them play it instead of
sitting through a slideshow. It runs in a browser with nothing to install, on the Chromebooks the
school already has.

The world is an archipelago. Each island is one BLHS offering. The player is Thor, an
anthropomorphic panther, who sails between islands, spends a limited number of season tokens each
year, and finishes with a page that says what they did.

This repository is the engine.

## The three repositories

| Repository | What lives there |
| --- | --- |
| `Algorithmic-Thinking-Club/BLHS-Vine` | this one: the engine, the renderer, the scenes, the Python runtime |
| `ashwath-polali/MAPVIS` | the map editor and the platform the engine downloads maps from |
| `Algorithmic-Thinking-Club/BLHS-Island-Explorer` | the islands, written in Python by club members |

An island is vendored into `public/grapes/` at dev, test and build time by
`scripts/vendor-islands.mjs`, which reads the members' checkout next door or GitHub when there is
none. Push the members' repository before building here.

## Running it

```
npm install
npm run dev
```

The dev server listens on 5173. `npm run build` type checks and builds; `npm test` runs the suite.

Useful addresses:

- `?scene=beach` the opening
- `?scene=pmap&map=hub` a painted map, by its id
- `?scene=grape` a member's Python island on its own
- `?deep=1` lets a pasted address carry a position, which a fresh tab otherwise refuses

## Architecture

**Vine and grape.** The vine is the core: navigation, the character, progression, the module loader
and the logging. A grape is a self-contained island about one BLHS thing, written in real Python
against a documented interface and plugged in without touching the vine.

Python runs in a Web Worker on MicroPython, 170 KB, chosen over Pyodide's 11 MB because a freshman
plays this on a four gigabyte school Chromebook. The engine calls a member's handlers; a member
never calls a flat list of engine commands. A crash inside a handler shows an "island under
construction" card, names the member's own line, and leaves the engine running.

`docs/VINE-AND-GRAPE.md` is the architecture document.

## Maps

Every map is one whole PixelLab painting, cut and given per pixel walkability by hand in MAPVIS,
then published to the platform. The engine asks the platform for a map first and falls back to a
copy under `public/maps-painted/<id>/`.

A bundle is `scene.png`, `levels.png`, `occluders.png`, `cut.png`, `map.json`, `assets.json` and an
`assets/` folder. A placement can carry a `life` behaviour the engine moves each frame, a `dirs` set
so a walking figure faces where it goes, and `looks`, the other pictures a thing turns into.

Anchors are the addressing system: six kinds, each with a name a member's Python calls by and a
label a player reads. `src/game/pmap/life.ts` is a verbatim copy of MAPVIS's `src/core/life.ts`; if
one changes, copy it again or the editor preview will lie about the game.

`docs/MAPS.md` has how a map is made and the measured limits.

## Layout

- `src/vine/` the core: the intent vocabulary, the contract, the Python runtime, logging
- `src/game/` the renderer and the scenes
- `src/game/pmap/` the painted map scene a MAPVIS bundle loads into
- `src/game/ocean.ts` the water every map sails on
- `src/app/` boot, title and scene routing
- `public/maps-painted/` map bundles
- `public/grapes/` vendored member islands, build output
- `scripts/` the tooling and the browser proofs
- `docs/` everything written down, indexed by `docs/archive/README.md`

## Stack

Vite, React 19, TypeScript, PixiJS v8. Deployed on Vercel. Activity logging goes through a
serverless function to Neon, serverless Postgres. Participant ids are anonymized and no student
data is committed.

## Testing

`npm test` runs the unit suite. The browser proofs under `scripts/` drive a real page with
Playwright and print PASS or FAIL per claim; each takes `--live` to run against the deploy instead
of the dev server. `node scripts/fps-proof.mjs` measures frames per second on four maps, throttled
and not. `node scripts/words-proof.mjs` holds every comment in `src/` to one plain line.
