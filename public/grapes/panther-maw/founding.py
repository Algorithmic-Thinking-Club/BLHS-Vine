"""The founding event: the first time a run stands at the principal's desk.

It is here rather than in island.py because it is the only thing in this room
long enough to be a SCENE. Every other handler is somebody saying a sentence or
a panel opening. This one directs: it turns a body that is standing on the map,
it moves the camera off the player and onto four different things, and it hands
over to an authored cutscene and takes control back afterwards.

READ THE SHAPE, NOT THE WORDS. A scene is small beats with air between them, and
the air is as much a part of it as the lines.

WHY IT IS A `yield from` AND NOT A HANDLER. Nothing decorates the function below,
so the engine never calls it. `island.py` calls it with `yield from`, which pipes
every intent this file yields out through the handler that asked, and pipes the
engine's answers back in. That is how you break a long scene into files without
inventing a second way for things to happen.

THE ONE CUTSCENE CALL, AND WHY IT IS NOT ALL OF THIS. `cutscene("maw-founding")`
runs a script the engine holds: it puts the black bars up, closes a vignette on
the desk, gives Principal Panther his two speeches with his face beside them,
and ends by handing control back with a prompt to walk to the chart table. It is
also SKIPPABLE, which matters more than it sounds: this game gets played in a
forty minute advisory period and a student who cannot skip a cutscene is a
student watching a clock.

What a cutscene cannot do is branch, read the run, or be written by a member, so
everything around it is here in python instead. That split is the honest one. Do
not read `cutscene` as the way to make a scene; read it as one authored beat you
can drop into the middle of your own.
"""
from vine import actor_face, cutscene, log, look_at, say, set_flag, wait

from lines import FACE, GREETING, PRINCIPAL, TOUR, TURNING_BACK

# THE FLAG THE REST OF THE GAME READS, AND IT IS A BARE NAME.
#
# `src/game/run/objective.ts` sequences the whole of year one off this exact
# string, and the arrow that tells a student what to do next is pointing at this
# desk until it is written. If it were written under this island's own programme
# id the founding would play, the flag would land as `the-maw:founding`, and the
# arrow would go on pointing here for four years with nothing saying why.
#
# It is bare because this island is the VINE'S OWN content and the engine runs it
# unscoped (`src/game/roster/vine-islands.ts` has the whole argument). YOUR
# island is scoped, and should be: you write `set_flag("met")` and the save holds
# `<your programme>:met`, so nobody else's island can collide with yours or read
# it. Do not copy this line into a member island. You cannot make it work there
# and you would not want to.
FOUNDING = "maw:founding"

# how long the camera rests on a thing before it drifts back to the player.
#
# A DURATION IS THE AUTHOR'S AND A DISTANCE IS THE MAP'S. Nothing in this file
# types a coordinate or a zoom, because where the camera goes and how close it
# gets belong to whoever cut the painting. How long it stays is pacing, and
# pacing is writing. This one is about the length of a look.
BEAT_MS = 1100


def founding_event():
    """Everything from him noticing you to control coming back."""

    # ---- he was already facing this way ----------------------------------
    #
    # The desk anchor carries a facing, so MAPVIS has already turned him toward
    # the spot a player stands on, and no line here has to put him there. That is
    # the whole reason `standAt` and `facing` are authored rather than typed: the
    # day Ash drags the desk to the other side of the hall, this scene still has
    # two people looking at each other and nothing in this file changed.
    yield say(GREETING, who=PRINCIPAL, portrait=FACE)

    # ---- and then he turns to the room ------------------------------------
    #
    # A HEADING AND NOT AN ANCHOR, which is a real edge of the vocabulary and
    # worth knowing before you hit it. The camera can be pointed at a name
    # (`look_at`), and a body can only be turned to a compass direction. There is
    # no word for "turn him toward the chart table". Everything he is about to
    # point out is west of him, so one heading covers all three, and if that ever
    # stops being true the fix is a word in the engine and not a table of angles
    # in here.
    yield actor_face(PRINCIPAL, "west")

    # ---- the room, one thing at a time ------------------------------------
    #
    # He says it, then you look. That order is deliberate: a camera that moves
    # first and then waits for a line reads as a stumble, and a line motivating
    # the look reads as somebody pointing.
    for anchor, line in TOUR:
        yield say(line, who=PRINCIPAL, portrait=FACE)
        yield look_at(anchor, ms=BEAT_MS)

    # the camera goes back to the player before anybody speaks again
    yield look_at(None)
    yield actor_face(PRINCIPAL, "south-west")
    yield say(TURNING_BACK, who=PRINCIPAL, portrait=FACE)
    yield wait(400)

    # ---- and the founding proper ------------------------------------------
    #
    # This is the beat that ends with the player standing at the chart table with
    # the controls back in their hands, which is where the next thing to do is.
    yield cutscene("maw-founding")

    yield set_flag(FOUNDING)
    yield log("founding_seen", {"where": "principal_desk"})
