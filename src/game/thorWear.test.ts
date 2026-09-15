/* what Thor wears, and the fence that stops a card promising art nobody drew */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { BARE, WEAR, canWear, poseFrame, walkFrame, wearById, wornKey } from './thorWear'
import type { SaveGame } from './save'

const DIRS8 = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
const here = (p: string) => path.resolve(process.cwd(), p)

const run = (over: Partial<SaveGame> = {}): SaveGame => ({
  v: 2, id: 'r', handle: 'BraveTide', pronouns: 'they/them', boatName: 'K',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true,
  plans: {}, flags: [], tokens: [], ranks: {}, islands: {}, exposure: [],
  completions: [], stickers: [], facts: [], badges: [], ledger: [], savedAt: 1,
  ...over,
} as SaveGame)

describe('the outfit slot', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('answers the bare panther for a run wearing nothing', () => {
    expect(walkFrame(run(), 'south', 0)).toBe('/art/characters/thor/walk/south/0.png')
    expect(poseFrame(run(), 'sit')).toBe('/art/characters/thor/pose/sit.png')
    expect(wornKey(run())).toBe(`${BARE}:classic`)
  })

  /* the fence that matters: every path here is safe with nothing on disk, which lets the equip path ship before the pixels do, and a card whose `drawn` is false is never wearable so `walkFrame` can never point at a folder that is not there */
  it('never points at an outfit nobody has drawn, even if it is worn in the save', () => {
    /* every outfit is drawn today, so the rule is checked by taking one back down rather than by finding one that happens to be missing */
    vi.spyOn(WEAR[0], 'drawn', 'get').mockReturnValue(false)
    for (const w of WEAR) {
      if (w.drawn) continue
      const s = run({ thorWear: w.id, graduated: true, islands: { robotics: 'completed' } })
      expect(canWear(s, w.id), `${w.id} is not drawn and must not be wearable`).toBe(false)
      expect(walkFrame(s, 'south', 0)).toBe('/art/characters/thor/walk/south/0.png')
      expect(poseFrame(s, 'lie')).toBe('/art/characters/thor/pose/lie.png')
    }
  })

  /* the other half: a set that claims to be drawn has to really be on disk, or the game asks the network for a png that 404s and draws nothing */
  it('has every frame on disk for every outfit marked drawn', () => {
    for (const w of WEAR) {
      if (!w.drawn) continue
      for (const d of DIRS8) {
        for (let i = 0; i < 6; i++) {
          const f = here(`public/art/characters/thor/wear/${w.id}/walk/${d}/${i}.png`)
          expect(fs.existsSync(f), `${w.id} says it is drawn but ${f} is missing`).toBe(true)
        }
      }
      /* the poses are a separate claim, and an outfit that does not make it sits down as the bare panther rather than asking for a png nobody drew */
      if (!w.posed) continue
      for (const pose of ['sit', 'lie']) {
        const f = here(`public/art/characters/thor/wear/${w.id}/pose/${pose}.png`)
        expect(fs.existsSync(f), `${w.id} says it is posed but ${f} is missing`).toBe(true)
      }
    }
  })

  it('routes to the outfit once it is earned and drawn', () => {
    const w = WEAR[0]
    /* the flag is the only thing standing between the path and the folder, so flipping it here is exactly what shipping the art will do */
    vi.spyOn(w, 'drawn', 'get').mockReturnValue(true)
    const s = run({ thorWear: w.id, completions: [
      { programme: 'football', year: 1, grade: 3, rank: 'football', at: 1 },
      { programme: 'football', year: 2, grade: 3, rank: 'football', at: 2 },
    ] })
    expect(canWear(s, w.id)).toBe(true)
    expect(walkFrame(s, 'east', 3)).toBe(`/art/characters/thor/wear/${w.id}/walk/east/3.png`)
    /* and the pose follows only the outfits that were drawn sitting down */
    expect(poseFrame(s, 'sit')).toBe(w.posed
      ? `/art/characters/thor/wear/${w.id}/pose/sit.png`
      : '/art/characters/thor/pose/sit.png')
    expect(wornKey(s)).toBe(`${w.id}:classic`)
  })

  it('will not wear something this run has not earned', () => {
    const cap = wearById('cap')!
    expect(cap.has(run()), 'a run that has not graduated has not earned it').toBe(false)
    expect(canWear(run({ thorWear: 'cap' }), 'cap')).toBe(false)
    expect(walkFrame(run({ thorWear: 'cap' }), 'north', 2)).toBe('/art/characters/thor/walk/north/2.png')
  })

  /* the key is what the scene compares against to decide whether to reload forty-eight textures, so a coat change and an outfit change must differ */
  it('changes its key for a coat and for an outfit, separately', () => {
    expect(wornKey(run({ thorLook: 'ember' }))).toBe(`${BARE}:ember`)
    expect(wornKey(run({ thorLook: 'ember' }))).not.toBe(wornKey(run({ thorLook: 'gold' })))
  })

  it('gives every outfit a name and a way to earn it', () => {
    for (const w of WEAR) {
      expect(w.name.length, w.id).toBeGreaterThan(2)
      expect(w.earn.length, w.id).toBeGreaterThan(4)
      expect(w.id).not.toBe(BARE)
    }
    expect(new Set(WEAR.map((w) => w.id)).size).toBe(WEAR.length)
  })
})
