"""Plain functions that turn the run's cord board and trophies into lines to say.

Hand them what `get("cord_board")` or `get("trophies")` returned. Nothing here
yields. A line only repeats a row's own `rule` and `detail`, never a threshold
of its own.
"""


def earned(board):
    """The cords already on the cape."""
    return [c for c in board if c["earned"]]


def close_to(board):
    """Cords started and not finished, nearest first.

    A cord still at zero counts as untouched. At most one cord with
    `settlesAtGraduation` is included.
    """
    started = [c for c in board if not c["earned"] and c["progress"] > 0]
    nearest = sorted(started, key=lambda c: c["progress"], reverse=True)

    out = []
    said_a_gpa_band = False
    for cord in nearest:
        if cord.get("settlesAtGraduation"):
            if said_a_gpa_band:
                continue
            said_a_gpa_band = True
        out.append(cord)
    return out


def settled_line(cord):
    """One earned cord, said out loud."""
    return "You earned %s. That one is yours." % cord["name"]


def progress_line(cord):
    """One cord in progress, using the row's own `detail` text from the engine."""
    return "Still working toward %s. %s" % (cord["name"], cord["detail"])


def counsel(board, most=2):
    """Everything the counselor says, as a list of lines.

    At most `most` earned cords and `most` in progress.
    """
    lines = []
    for cord in earned(board)[:most]:
        lines.append(settled_line(cord))
    for cord in close_to(board)[:most]:
        lines.append(progress_line(cord))
    return lines


def on_the_wall(trophies):
    """How many things are up there, stickers and badges counted together."""
    return len(trophies["stickers"]) + len(trophies["badges"])


def wall_line(count):
    """What Thor says at the wall, which never carries a number. The words come from lines.py."""
    from lines import EMPTY_WALL, FULL_WALL

    return FULL_WALL if count > 0 else EMPTY_WALL
