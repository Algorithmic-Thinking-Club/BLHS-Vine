"""THE OPENING OF THE GAME, AS AN ISLAND.

This is the beach opening. It used to be five hundred lines of hard-coded
TypeScript in src/game/intro/introScript.ts driving a scene, BeachIso, that was
the only scene in the whole game able to play a cutscene. It could not run on a
painted map, no member could have written it, and nothing else in the project
could reuse a single beat of it.

It is now this file: python, in a worker, on a painted map, using only words that
are in vine.py and available to every member. Nothing here is special. If you can
read this file you can write the opening of your own island.

The one thing worth copying is the SHAPE. A scene is a sequence of small beats
with air between them, and the air is as much a part of it as the lines. Read the
`wait` calls as beats of a rest, not as filler.
"""

from grape import on_start, on_talk
from vine import (
    award, enter, framing, fx, guide_to, log, pose, route, say, set_flag, show,
    sound, wait, wait_for,
)

from lines import CAST_OFF, DECIDED, LOOKING, MESSAGE, NUDGED, SPOTTED, THOR, WAKING


@on_start
def opening():
    """Everything from opening your eyes to the boat leaving."""

    # ---- he is asleep before he is awake ---------------------------------
    #
    # The bottle is on the map from the moment it loads, because a placement is
    # something MAPVIS put on the painting. Hiding it here on the first line is
    # what makes it ARRIVE later instead of having been there all along.
    yield show("the_wrack_line", False)
    # close on him before anything else. The map's own opening view is the whole
    # island from a long way off, which is the right way to arrive somewhere and
    # the wrong way to wake up: waking up is a face, not a coastline.
    yield framing("the_waking")
    yield pose("sleep", facing="south")
    yield sound("surf_in")
    yield wait(900)

    # ---- and then he is ---------------------------------------------------
    yield pose("sit")
    yield wait(600)
    for line in WAKING:
        yield say(line, who=THOR)
    yield pose("stand")
    yield wait(400)
    # and the island opens out around him, which is the shot doing the work the
    # line used to have to do on its own
    yield framing(None)
    yield say(LOOKING, who=THOR)

    # ---- the sea puts something on the sand -------------------------------
    #
    # A sound and a picture arriving on the same beat is the whole trick. Either
    # one alone reads as a glitch.
    yield pose(facing="west")
    yield sound("bottle")
    yield show("the_wrack_line", True)

    # `framing` takes a shot somebody set up on the map by dragging it, so the
    # distance and the offset are not numbers typed in this file. That matters
    # more than it sounds: a number typed here is wrong the next time the map is
    # re-cut, and nothing says so.
    yield framing("the_find")
    # let the camera arrive before he speaks. A shot that is still travelling
    # while a line is on screen reads as a stumble, not as a look.
    yield wait(900)
    yield fx("spark", anchor="the_wrack_line")
    yield say(SPOTTED, who=THOR)
    yield wait(500)
    yield framing(None)

    # ---- the arrow, and then the walk is taken ----------------------------
    #
    # He gets to walk there himself first, because a game that walks you
    # everywhere is a film. `wait_for` answers whether he actually came, so the
    # island can have an opinion about a player who wandered off.
    yield guide_to("the_wrack_line")
    arrived = yield wait_for("the_wrack_line", ms=9000)
    if not arrived:
        yield say(NUDGED, who=THOR)
        # and now it IS taken, along the line somebody drew on the map rather
        # than in a straight line through the rocks
        yield route("the_wrack_walk")

    # ---- what is in it ----------------------------------------------------
    yield sound("cork_pop")
    yield wait(400)
    for line in MESSAGE:
        yield say(line, who=THOR)
    yield set_flag("read_the_bottle")
    yield log("bottle_opened", {"walked": arrived})

    # ---- down to the water ------------------------------------------------
    yield say(DECIDED, who=THOR)
    yield guide_to("the_jetty")
    yield route("the_long_way")

    # ---- and off ----------------------------------------------------------
    #
    # `route(..., who="ship")` is how a crossing starts. It puts him aboard and
    # steers the hull along the sail line, and it comes back when the line has
    # been run.
    yield sound("board")
    yield say(CAST_OFF, who=THOR)
    yield route("the_crossing", who="ship")

    # watch her get her head round before the cut. A crossing that cuts away the
    # instant the sail fills reads as a loading screen, not as leaving.
    yield wait(1800)

    # the rest of the crossing happens under the cover, which is what a cover is
    # for. `enter` is a door, and this one goes to the central island.
    yield enter("hub", at="panthers_maw")

    # a fact for the Handbook, and no programme: waking up on a beach is not a
    # thing Bonney Lake High School offers, and an island that awarded itself a
    # grade for it would be lying to the transcript.
    yield award(fact="the_bottle")


@on_talk("the_wrack_line")
def the_bottle_again():
    """If he comes back to it afterwards."""
    yield say(MESSAGE[-1], who=THOR)
