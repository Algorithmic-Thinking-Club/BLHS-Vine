import type { Script } from '../cutscene/types'

// The introduction, beats I-1 + I-2 (GAME-DESIGN §5), as cutscene data. The beach map is
// cutscene-staged: Thor wakes above the wrack line, the tide delivers the bottle, one soft
// input gate teaches "you move Thor" with zero tutorial text. Coordinates are beach tiles;
// the shore near spawn sits around s = tx+ty ≈ 109 (see BeachIso's shoreAt).
//
// I-3 (the parchment UI session) continues from the `ui` gate at the end — the unfurl is the
// world-to-UI transition, so the gate id is where the React session takes over.

const SPAWN = { x: 58.2, y: 56.4 }             // just above the wrack line — the tide breathes in frame
const BOTTLE_D = 3                              // shore column just east of the spawn
// the bottle settles at s = shoreAt(3)+1.22 ≈ 111.05 → tile (57.0, 54.0); Thor stops shy of it
const BOTTLE_AT = { x: 57.0, y: 54.0 }
const WALK_STOP = { x: 57.7, y: 54.9 }

export const introI1I2: Script = {
  id: 'intro',
  steps: [
    // ---- I-1 · waking up ----
    { t: 'fade', to: 1, ms: 0 },                               // hold black for a breath
    { t: 'letterbox', on: true, ms: 0 },
    { t: 'vignette', to: 0.8, ms: 0 },                         // the 80% aperture, pre-set
    { t: 'actorPlace', actor: 'thor', at: SPAWN, face: 'south' },
    { t: 'actorState', actor: 'thor', state: 'lie' },
    { t: 'camera', to: SPAWN, zoom: 2.3, ms: 0 },              // tight on the sleeper
    { t: 'audio', cue: 'surf-in' },                            // sound arrives before the image
    { t: 'wait', ms: 700 },
    { t: 'fade', to: 0, ms: 2800 },                            // eyes opening
    { t: 'wait', ms: 1100 },                                   // the cove breathes inside the aperture
    { t: 'actorState', actor: 'thor', state: 'sit' },
    { t: 'fx', name: 'sandScatter' },
    { t: 'vignette', to: 0.45, ms: 1400 },
    { t: 'wait', ms: 1000 },
    { t: 'say', who: 'Thor', text: 'Ugh. Sand. A whole lot of sand.' },
    { t: 'say', who: 'Thor', text: 'Last thing I remember is water. So much water.' },
    { t: 'actorState', actor: 'thor', state: 'idle' },         // he stands
    { t: 'fx', name: 'sandScatter' },
    { t: 'vignette', to: 0, ms: 1600 },                        // relax to the map's own golden grade
    { t: 'camera', to: SPAWN, zoom: 1.7, ms: 1600 },           // settle to scene scale
    { t: 'say', who: 'Thor', text: '...Where is this?' },

    // ---- I-2 · the bottle (unmissable, and quick — Ash: it dragged) ----
    { t: 'wait', ms: 400 },                                    // one breath, the cove alive
    { t: 'stage', call: 'bottleWave', data: { d: BOTTLE_D } }, // rides the FIRST front to launch
    { t: 'wait', ms: 300 },
    { t: 'actorFace', actor: 'thor', dir: 'north' },           // ear-perk: he spots it
    { t: 'camera', to: BOTTLE_AT, zoom: 2.1, ms: 800 },        // the LOOK: camera points at it
    { t: 'fx', name: 'glint', at: BOTTLE_AT },
    { t: 'caption', text: 'Something washed ashore.', ms: 1200 },
    { t: 'camera', to: SPAWN, zoom: 1.7, ms: 700 },            // back to Thor: your move
    { t: 'stage', call: 'pointAt', data: BOTTLE_AT },          // the guide chevron
    { t: 'fx', name: 'glint', at: BOTTLE_AT },
    /* THE FIRST INSTRUCTION IN THE GAME, AND IT NAMED THE ONE THING THAT DID NOT
     * WORK. SWEEP-1 items 4 and 13: this said "Press W A S D or the arrow keys"
     * to a freshman on a trackpad, on a scene with no pointer handler at all, so
     * clicking the sand moved him zero pixels and he stood still for about twenty
     * seconds. The beach takes a click now, so the sentence leads with the thing
     * every student can already do and keeps the keys as the second half. */
    { t: 'gate', kind: 'walkTo', target: WALK_STOP, radius: 0.9, prompt: 'Click the bottle to walk there. Arrow keys work too', idleAutoMs: 6000 },
    { t: 'stage', call: 'pointClear' },
    { t: 'actorFace', actor: 'thor', dir: 'north-west' },
    { t: 'camera', to: BOTTLE_AT, zoom: 2.6, ms: 2500 },       // the slow push-in
    { t: 'fx', name: 'glint', at: BOTTLE_AT },                 // the sun flares off the glass
    { t: 'wait', ms: 700 },
    { t: 'audio', cue: 'cork-pop' },
    { t: 'wait', ms: 500 },
    // the parchment unfurls upward and BECOMES the I-3 session (the ui gate hands off to React)
    { t: 'gate', kind: 'ui', id: 'i3-session' },
    // ---- return to the world (I-3 done: parchment rolled up, Thor pockets it) ----
    { t: 'stage', call: 'applyLook' },                         // the wardrobe dye walks out with him
    { t: 'stage', call: 'hideBottle' },
    { t: 'camera', to: WALK_STOP, zoom: 1.7, ms: 1200 },
    { t: 'cameraFollow', actor: 'thor' },

    // ---- I-4 · the walk to the port (player-driven; the pier is the only exit) ----
    { t: 'say', who: 'Thor', text: 'That is my boat, down at the pier. Time to walk down and take it.' },
    { t: 'stage', call: 'showBoatName' },                      // her fresh name hangs at the berth
    { t: 'stage', call: 'pointAt', data: { x: 73, y: 44.5 } }, // the chevron leads: the pier
    { t: 'gate', kind: 'walkTo', target: { x: 73, y: 44.5 }, radius: 1.3, prompt: 'Walk to the pier', idleAutoMs: 14000 },
    { t: 'stage', call: 'pointAt', data: { ship: true } },     // ...then the ship herself
    { t: 'gate', kind: 'walkTo', target: { x: 73, y: 33 }, radius: 1.4, prompt: 'Walk to your boat', idleAutoMs: 12000 },
    { t: 'stage', call: 'pointClear' },
    { t: 'stage', call: 'boardShip' },                         // the hop arc; he takes the deck

    // ---- I-5 · setting sail (the one big button moment) ----
    { t: 'wait', ms: 600 },
    { t: 'gate', kind: 'ui', id: 'set-sail' },                 // the enormous carved plank
    { t: 'audio', cue: 'sail-snap' },
    { t: 'stage', call: 'pilotTo' },                           // forward, starboard to open sea, run out
    { t: 'wait', ms: 400 },
    { t: 'letterbox', on: false },
    // the runtime completes here; the scene hands off to THE MAP SWITCH (I-6) — the
    // BLHS Islands loading painting, then the island map (wired in IntroScene's onDone)
  ],
}
