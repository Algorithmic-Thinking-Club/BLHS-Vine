"""THE PANTHER'S MAW: the home base, as an island.

This is the room the game keeps coming back to. The year gets planned here, the
required advisory is sat here, the cords get read out here, and everything a
student brings back from the water ends up on a wall in here.

READ THIS ONE TO UNDERSTAND THE MACHINE. It is not the file you copy. The one you
copy is the ATC island, which is a member's island about one real thing at the
school; this is the vine's own content, so it reaches things a member's island
does not and should not, and every place it does is marked. What is worth taking
from it is the SHAPE: handlers the engine calls, words that only happen when you
yield them, content in one file and control flow in another, and a scene long
enough to deserve a file of its own.

WHAT A HANDLER IS. Nothing in this file calls the seven functions below. Each one
is handed to the engine by its decorator, and the engine decides when it runs: a
player walks up to a post in the room, presses E, and the engine looks up whoever
claimed that anchor's name. That inversion is the whole difference between an
island and a script. A script runs top to bottom and is over; an island can be
walked away from, come back to on the third visit, and answer differently.

WHICH ANCHORS THIS ROOM ACTUALLY HAS. Eleven, and only six of them can be
pressed. The other five are not oversights and no handler here claims them:

  arrive_maw    a spawn. It is where the tunnel puts you, not something you press.
  the_hall      a region. Regions are logged when you walk into them and there is
                no handler key for one. A trigger fires a handler; a region does
                not, and this room carries no triggers. If the room should ever
                notice you walking into the middle of it, that is a change in
                MAPVIS from `region` to `trigger`, and no line of python can
                substitute for it.
  maw_entrance  a door. A door is a door BEFORE anything else is asked: the
  east_tunnel   engine takes it and changes the map, and `@on_talk` on any of
  west_tunnel   these three would never run. `maw_entrance` already carries the
                anchor to arrive at in the hub. The two galleries point at rooms
                nobody has painted, and the engine says "the way is barred" on
                the plaque, in the world's own words. All three of these work,
                today, with nothing in this file about them.
"""
from grape import on_start, on_talk
from vine import (
    choose, get, log, open, play, say, set_flag, show,
)

from board import counsel, on_the_wall, wall_line
from founding import FOUNDING, founding_event
from lines import (
    ARRIVED, ASK, BANKED, CIRCLE, COUNSELOR, EMPTY_WALL, HEARTH, LEFT,
    NOOK, NOT_NOW, NOTHING_YET, OUTFITTER, PRINCIPAL, SAT, SHEET, SHOW_ME,
    TABLE, THOR, WALL, FACE,
)

# this run has been through the tunnel before. Bare, like `maw:founding` and for
# the same reason: see the note on FOUNDING in founding.py. A member's island
# writes bare names too and the engine puts their programme id in front.
SEEN = "maw:seen"


@on_start
def walking_in():
    """The engine calls this every time the room loads, before the player moves.

    EVERY TIME, which is the thing to design around. This room gets crossed
    forty times in an hour, and a room that greets you on the fortieth crossing
    is a room you learn to walk past. So the lines are behind a flag and every
    arrival after the first is silent.

    The way he is facing when he gets here is not set in this file either. The
    spawn anchor carries a heading, MAPVIS is where somebody chose it, and the
    engine turns him before this function runs.
    """
    flags = yield get("flags")
    if SEEN in flags:
        return

    for line in ARRIVED:
        yield say(line, who=THOR)
    yield set_flag(SEEN)
    yield log("maw_first_arrival")


@on_talk("principal_desk")
def the_principal():
    """The founding event, and then a person who remembers you came."""
    flags = yield get("flags")
    if FOUNDING not in flags:
        # the long one, in its own file, piped out through this handler
        yield from founding_event()
        return

    yield say("Back again. Good. The sea does not run out.",
              who=PRINCIPAL, portrait=FACE)


@on_talk("chart_table")
def the_chart_table():
    """The year sheet. A panel, and the drag of a season token is the mechanic.

    ONE OF THE TWO THINGS IN THIS ROOM THAT IS A PANEL RATHER THAN A SCENE. A
    paper sheet really is a document, and the thing a student does at it is pick
    up a token and put it somewhere, which no amount of dialogue can be.
    """
    # the log line goes first, because it is a claim about a press and the panel
    # may sit open for two minutes afterwards
    yield log("planner_opened", {"via": "chart_table"})
    yield say(SHEET, who=TABLE)
    yield open("planner")


@on_talk("hearth")
def the_fire():
    """The required advisory beat for this year, or a banked fire.

    WHICH BEAT, ASKED RATHER THAN SPELLED. `get("advisory")` answers with the id
    of the beat this year still owes, or None when the year has no content or
    the student already sat it. Writing "core:y%d" here instead would be a typed
    constant that goes wrong the first time the beats are renumbered, and
    yielding `play` without asking would run a beat that is already on the
    transcript and grade the same year twice.
    """
    beat = yield get("advisory")
    if beat is None:
        yield say(BANKED, who=HEARTH)
        return

    yield say(CIRCLE, who=HEARTH)
    # BOTH ARMS OF THE STUDY RUN THROUGH THIS ONE WORD, and the arm is not this
    # island's to choose. Left alone, `play` renders whichever arm the student
    # was assigned when they joined: the game arm gets Principal Panther asking
    # the questions, the plain arm gets the same questions as a form with nobody
    # saying them. Same items, same order, same score. Passing as_plain=True here
    # would force the plain rendering on everybody, which is a real thing to want
    # for a moment that should read identically, and is not this one.
    score = yield play(beat)

    # None is the player closing the panel, which is not a zero. A zero is a
    # student who answered and got everything wrong, and the two must never be
    # written down as the same thing.
    if score is None:
        yield say(LEFT, who=HEARTH)
        return

    # NO `award` HERE, DELIBERATELY, and this is the one place this island breaks
    # the rule your own island must keep. A member's island scores its own
    # content and has to write the row itself. A core beat is the ENGINE'S
    # content: the runner already wrote the grade, the credit, the tags and the
    # takeaway cards before this line ran, and awarding again would put a second
    # row for the same year on the transcript and move the GPA twice.
    yield say(SAT, who=HEARTH)
    yield log("advisory_sat", {"beat": beat, "grade": score})


@on_talk("counselor")
def the_counselor():
    """The cords, said out loud by somebody, off the live table.

    A person rather than a board, because §8.4's whole ask was to surface the
    hidden earnable things, and a list on a wall is the thing a student already
    scrolls past. What she says changes with the run: on the way in during year
    one she has nothing, and on the way out she has the first cord that moved.
    """
    board = yield get("cord_board")
    lines = counsel(board)

    if not lines:
        yield say(NOTHING_YET, who=COUNSELOR)
    else:
        for line in lines:
            yield say(line, who=COUNSELOR)

    pick = yield choose([SHOW_ME, NOT_NOW], prompt=ASK)
    # -1 is not an index. It is nobody having answered, because the player left
    # while the buttons were up, and it must not read as the first button.
    if pick == 0:
        yield open("handbook")


@on_talk("outfitter")
def the_outfitter():
    """The wardrobe. Revisitable, and nothing in it is bought."""
    yield say(NOOK, who=OUTFITTER)
    yield open("wardrobe")


@on_talk("trophy_wall")
def the_wall():
    """What four years put on a shelf, counted rather than promised.

    No panel at all. The wall itself is the readout, and everything on it got
    there because of something the student did somewhere else. A thing you walk
    up to that changed because of a voyage you took two years ago is worth more
    than a list of the same information.

    WHAT `show` CAN AND CANNOT DO HERE, said plainly because it is the honest
    limit. The engine can hide or reveal any placement an anchor is bound to, by
    the anchor's name. This wall is bound to ONE placement, a drawn shelf, so
    what `show` can express is a shelf that is there or a shelf that is not.
    Filling it trophy by trophy needs one placement per trophy, drawn and bound
    in MAPVIS, and until those exist the count is carried by the line.
    """
    trophies = yield get("trophies")
    count = on_the_wall(trophies)

    # the shelf arrives with the first thing that goes on it. Before that the
    # wall is bare, which is true, and is the one difference in this room a
    # student can read at walking speed.
    yield show(WALL, count > 0)

    if count == 0:
        yield say(EMPTY_WALL, who=THOR)
        return
    yield say(wall_line(count), who=WALL)
