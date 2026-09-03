"""Turning what the run actually holds into sentences somebody can say.

Not one `yield` in this file, on purpose. Reading the run and speaking about it
are two jobs, and separating them is what lets the counselor be tested with a
list of dicts and no game at all. Everything here is a plain function: hand it
what `get("cord_board")` or `get("trophies")` came back with, get lines out.

WHY THE COUNSELOR IS NOT ALLOWED TO INVENT A CRITERION. The cord table is the
school's, forwarded from Ms. Pinzon through Mr. Wiseman, and it lives in
`docs/blhs/awards.md`. Three criteria in this project were once invented under
cover of a citation to a document that never existed. So every row already
carries `rule`, which is the school's own words, and `detail`, which is the live
status line the tracker board prints, and this file only ever repeats those two.
It never writes a threshold of its own. If you catch yourself typing a number
about the real school into your island, stop and go find who published it.
"""


def earned(board):
    """The cords already on the cape."""
    return [c for c in board if c["earned"]]


def close_to(board):
    """Started and not finished, nearest first.

    `progress` is 0 to 1 and it is the engine's own arithmetic, so sorting on it
    is sorting on the same number the fraying thread on the tracker is drawn
    from. A cord at exactly zero is not "close to" anything, it is untouched,
    and saying otherwise on the first sheet of year one would be the counselor
    congratulating a student for existing.
    """
    started = [c for c in board if not c["earned"] and c["progress"] > 0]
    return sorted(started, key=lambda c: c["progress"], reverse=True)


def settled_line(cord):
    """One earned cord, said out loud."""
    return "%s is yours. That one is settled." % cord["name"]


def progress_line(cord):
    """One cord in progress, in the words the board itself uses.

    `detail` is written once by the engine ("GPA 3.20 of 3.76", "3 of 5 AP
    classes passed") and read by both the tracker and this line, so the person
    and the board can never disagree about the same cord.
    """
    return "%s. %s" % (cord["name"], cord["detail"])


def counsel(board, most=2):
    """Everything the counselor has to say, as a list of lines.

    Two of each at most. She is a person having a word on your way past, not a
    readout: seven cords recited every single visit is a wall of text the player
    learns to click through, and a student who clicks through it has read
    nothing at all.
    """
    lines = []
    for cord in earned(board)[:most]:
        lines.append(settled_line(cord))
    for cord in close_to(board)[:most]:
        lines.append(progress_line(cord))
    return lines


def on_the_wall(trophies):
    """How many things are up there.

    Stickers and badges are different things everywhere else in the save and the
    engine hands them over as two lists rather than one. The wall does not care
    which is which: it is a shelf, and what a shelf says is how full it is.
    """
    return len(trophies["stickers"]) + len(trophies["badges"])


def wall_line(count):
    """What the wall says about itself, which is a fact and not a compliment."""
    if count == 1:
        return "One thing up there now. Earned somewhere out on the water."
    return "%d up there now. All of it earned somewhere out on the water." % count
