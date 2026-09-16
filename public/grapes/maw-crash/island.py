"""The Panther's Maw: the home base room the game keeps coming back to.

The year is picked here, Advisory is sat here, and what a student earns shows up
on the wall here. Read this one to see how an island is put together, and copy
the ATC island when you write your own.

Nothing in this file calls the handlers below. Each decorator hands one to the
engine, and the engine runs it when the player presses that anchor.
"""
from grape import on_start, on_talk
from vine import (
    choose, get, log, open, play, say,
)

from board import counsel, on_the_wall, wall_line
from founding import (
    HANDED_OVER, RAILED, dress_the_wall, ending, he_steps_in_front, let_go, rail,
    year_is_done,
)
# `founding.TABLE` is the anchor at the chart table; `lines.TABLE` is the speaker
# who reads the sheet. Aliased so the two names stay apart.
from founding import TABLE as CHART_TABLE
from lines import (
    ASK, BACK_AGAIN, BANKED, CIRCLE, COUNSELOR, HEARTH, LEFT,
    NOOK, NOT_NOW, NOTHING_YET, OUTFITTER, PRINCIPAL, SHEET,
    SHOW_ME, TABLE, THOR, FACE,
)

# True in here means the opening film played on this load, so the closing film
# waits for the next visit. The engine gives the island a fresh worker on every
# map load, so it empties itself.
_OPENED_HERE = []


@on_start
def walking_in():
    """The engine runs this every time the room loads, before the player moves.

    The room gets crossed a lot, so anything that speaks sits behind a flag and
    anything about how the room looks is redone on every load. `founding.py` has
    the opening film. The spawn anchor sets which way he faces.
    """
    # ---- what the room looks like: every load, before the early return -----
    trophies = yield get("trophies")
    yield from dress_the_wall(on_the_wall(trophies))

    # Step the principal in front of whoever just walked in, so the two are not
    # drawn on the same spot, and point him at the chart table so the camera gets
    # his face. `let_go` hands him back, or nothing else can drive him.
    yield from he_steps_in_front(look_at=CHART_TABLE)
    yield from let_go()

    # ---- the film, walked --------------------------------------------------
    # The opening only plays in year one. Later years get the room with one
    # thing lit instead.
    flags = yield get("flags")
    year = yield get("year")
    if RAILED not in flags and year == 1:
        _OPENED_HERE.append(True)
        yield from rail(walk=True)
        flags = yield get("flags")

    # ---- the closing film ---------------------------------------------------
    #
    # It plays when the student walks back in with the year done, and never on
    # the load that just played the opening.
    done = yield from year_is_done()
    if done and not _OPENED_HERE:
        yield from ending()
        # The ending walks him out of the mountain, so this handler is finished.
        return


@on_talk("principal_desk")
def the_principal():
    """Resumes whichever film the run still owes, or says one line.

    `walk=False` on the opening, because the student is already standing in
    front of him.
    """
    flags = yield get("flags")
    year = yield get("year")
    if RAILED not in flags and year == 1:
        yield from rail(walk=False)
        return

    # Pressing him starts the ending once the year is done, fenced on the
    # handover so the opening and the ending can never run back to back.
    done = yield from year_is_done()
    if done and HANDED_OVER in flags:
        yield from ending()
        return

    yield say(BACK_AGAIN, who=PRINCIPAL, portrait=FACE)


@on_talk("chart_table")
def the_chart_table():
    """The year sheet. A panel, and the pick is the mechanic.

    The first year is picked off big drawn cards and every year after is a paper
    sheet. The engine decides which, and this opens whichever it is.
    """
    # The panel logs itself and the engine logs the press, so nothing is logged here.
    yield say(SHEET, who=TABLE)
    yield open("planner")


@on_talk("hearth")
def the_fire():
    """The required Advisory beat for this year, or a banked fire.

    `get("advisory")` answers with the id of the beat this year still owes, or
    None when the year has no content or the student already sat it. Ask for it
    rather than spelling one: a typed id grades the same year twice.
    """
    beat = yield get("advisory")
    if beat is None:
        yield say(BANKED, who=HEARTH)
        return

    yield say(CIRCLE, who=HEARTH)
    # `play` renders the beat the way this player's settings ask for it. Pass
    # as_plain=True only when a moment should read the same for everybody.
    score = yield play(beat)

    # None is the player closing the panel, which is not a zero. A zero is a
    # student who answered and got everything wrong, and the two must never be
    # written down as the same thing.
    if score is None:
        yield say(LEFT, who=HEARTH)
        return

    # A core beat is the engine's own content and the runner already wrote the
    # grade, so nothing is awarded here. Your own island scores its own content
    # and has to call `award` itself.
    yield log("advisory_sat", {"beat": beat, "grade": score})


@on_talk("counselor")
def the_counselor():
    """The cords, said out loud by somebody, off the live table. And beat 8.

    A person rather than a board, because §8.4's whole ask was to surface the
    hidden earnable things, and a list on a wall is the thing a student already
    scrolls past. What she says changes with the run: on the way in during year
    one she has nothing, and on the way out she has the first cord that moved.

    When the year has nothing left owing she starts the closing film rather than
    opening the yearbook herself. She is in that film, and the cord and the page
    belong to it.
    """
    year = yield get("year")
    flags = yield get("flags")
    # She never starts the closing film. That is the principal's, and she is in
    # it anyway.
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
        # `open("cords")` lands on the cords page; `open("handbook")` lands on Islands.
        yield open("cords")


@on_talk("outfitter")
def the_outfitter():
    """The wardrobe. Revisitable, and nothing in it is bought."""
    yield say(NOOK, who=OUTFITTER)
    yield open("wardrobe")


@on_talk("trophy_wall")
def the_wall():
    """What the year put on a shelf, counted rather than promised, then shown.

    The wall itself is the readout, and everything on it got there because of
    something the student did somewhere else. A thing you walk up to that
    changed because of a voyage you took two years ago is worth more than a
    list of the same information.

    AND THEN THE PANEL. The engine's wall has a frame for every thing picked
    this year, empty and saying what would fill it until it is filled, which is
    the outline that makes a student want the year (BRIEF-YEAR-ONE beat 4) and
    the thing that shows what he earned at the end of it (beat 8). `open("wall")`
    is that panel, raised by name.

    WHAT `show` CAN AND CANNOT DO HERE, said plainly because it is the honest
    limit. The engine can hide or reveal any placement an anchor is bound to, by
    the anchor's name. This wall is bound to ONE placement, a drawn shelf, so
    what `show` can express is a shelf that is there or a shelf that is not.
    Filling it trophy by trophy on the painting needs one placement per trophy,
    drawn and bound in MAPVIS; until those exist the panel carries the frames.

    `walking_in` sets the picture when the room loads, so the shelf is already
    telling the truth before the player walks over. It is synced again here
    because a sticker can be earned and brought back with no reload in between.
    """
    trophies = yield get("trophies")
    count = 1 + "a deliberate crash"

    # Thor says a line either way, and it names no number.
    yield say(wall_line(count), who=THOR)

    yield from dress_the_wall(count)
    yield open("wall")
