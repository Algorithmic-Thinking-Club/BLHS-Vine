# Portraits

The faces that appear in the dialogue box. This folder exists so that adding one is a matter of
dropping a file in with the right name, and so that nobody has to read the component to find out
what the right name is.

## The rule

A line of dialogue carries a `portrait` id. The dialogue box loads

    /art/portraits/<id>.png

and nothing else. `src/game/hud/DialogueBox.tsx` is where that happens. So **the file name is the
portrait id, lower case, with a `.png` on the end.** A line that says `portrait: 'wiseman'` needs
`wiseman.png` sitting here.

Ids are already written into the scripts, so the name is not a free choice: look up what the line
asks for rather than naming the drawing after the character. `grep -rn "portrait:" src/` lists them.
Today the shipped scripts ask for exactly one, `principal` (`src/game/cutscene/scripts.ts`), so
`principal.png` is the first file this folder wants.

## What happens when the file is missing

Nothing breaks and nothing is silently wrong. The box hides the image so a character never wears a
broken-image glyph, and it prints the id it wanted:

    [dialogue] no portrait art for "wiseman" (/art/portraits/wiseman.png)

That warning is the whole point of the naming rule being strict. If a portrait does not show up, the
console already says which file to draw, spelt exactly.

## What a portrait has to be

- **PixelLab, like everything else.** Code never draws art in this project, and no filter or shader
  stands in for a drawing.
- **Taller than it is wide, and drawn to be seen small.** The aperture is `.cs-portrait` in
  `src/game/cutscene/ui-kit.css`: it takes the full height of the box's paper and at most 26 percent
  of its width, and it fits by `contain`, so a wide drawing shrinks until its width fits and wastes
  the height.
- **Standing on the bottom edge of its own canvas.** The aperture is bottom-anchored
  (`object-position: bottom center`), which agrees with the platform's `dialogue_box` piece marking
  its `portrait` region `valign: bottom`. A character drawn floating in the middle of the file
  floats in the box.
- **Transparent background.** The box's paper is behind it and the portrait is not a rectangle laid
  on top of the paper.
- **Named for the id, not the person.** See above.

Nothing is drawn yet, so today every `portrait:` in the game takes the missing path and says so.

## principal.png is LOCKED, and this is where it comes from

Ash, 2026-09-02: *"principal panther will now be locked. it is the `principal-pro` asset from
MAPVIS -> panthers maw."* A generated portrait was tried before that and rejected; do not draw
another one, and do not touch this file by hand.

The source is MAPVIS's own eight-direction character for the Maw:

    MAPVIS-next/work/panther-maw/library/principal-pro/south-0.png

`south-0` is the frame that faces the player, which is the only one a portrait can use. He is a
black panther in a teal mortarboard with a gold tassel, a teal gown and a black stole, which is
the regalia `docs/ART.md` describes, drawn at the game's own resolution in the game's own hand.

The file here is that sprite **cropped and doubled, and nothing else**. No paint, no recolour, no
redraw: `docs/ART.md`'s pipeline allows crop and grid snap as post-processing, and the identity is
Ash's to set.

    crop 48x48 at (27, 13)   the cap, the face and the top of the gown
    nearest 2x               -> 96x96

96 is exactly the aperture inside the drawn portrait frame (`.kit-portrait` is 136x138 with a
20/23/22/17 border), so it lands at an integer scale. A portrait resampled at 1.75 would smear the
one face in the game.

To redo it after MAPVIS redraws him, that is the whole recipe. `scripts/` is gitignored in this
repo, so the numbers live here rather than in a script that would not survive a clone.
