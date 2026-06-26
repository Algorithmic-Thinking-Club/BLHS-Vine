# Panther Pathways

An exploration RPG that introduces new Bonney Lake High School students to what the school
actually offers (clubs, sports, electives, AP classes, the culture) by letting them walk a 1:1
map of the campus and play through it, instead of sitting through a slideshow.

## Stack

- Vite + React 19 + TypeScript
- PixiJS for the isometric campus renderer
- A small "vine and grape" design: the core (the vine) owns navigation, the character,
  progression, and activity logging; each self-contained mini-module (a grape) covers one
  club / sport / policy and plugs in without touching the core.

## Running it

```
npm install
npm run dev -- --port 5188
```

Then open `http://localhost:5188/?cv=1` to load the campus.

## Layout

- `src/vine/` core framework (the module contract, session, logging, theme, palette)
- `src/game/` the campus renderer, the 1:1 geometry, the sections, the props
- `src/grapes/` the pluggable modules
- `public/art/` tile and prop art
- `reference/` campus photos, the civil survey set, and the georeferenced aerial used to place
  everything 1:1
- `scripts/` map and asset build tooling

## Status

Early build. The campus geometry is placed from the real civil survey data, and the art is going
in section by section. The first run drops you in the middle of campus; use WASD to move.
