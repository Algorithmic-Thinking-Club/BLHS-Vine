"""The first grape: a member's python, running inside the game.

Nothing in this file is engine code. It imports from two modules the engine
provides and one it ships beside itself, puts `yield` in front of the things
that take time, and the number that comes back from `choose` is the button the
player actually clicked.

This is the ENGINE'S OWN FIXTURE, not the template. The thing a member copies
lives in the blhs-islands repo, at islands/skeleton. This one exists so the pipe
can be watched working with nothing else in the frame.

The engine drew every line you see. This file only asked for them.
"""
from grape import on_start, on_talk
from vine import choose, say

from lines import BRANCHES, OPENING, WHO


@on_start
def opened():
    """Called by the engine the moment the island finishes importing."""
    yield say(OPENING, who=WHO)


@on_talk("harness")
def pressed():
    """Called by the engine when the player presses E on the anchor `harness`.

    Nothing in this file calls it. That is the whole point of the decorator: the
    game owns when, the island owns what.
    """
    pick = yield choose(
        ["Prove the answer got back into Python.", "I believe you."],
        prompt="Which way?",
    )

    yield say("You clicked button %d, and Python counted it." % pick, who=WHO)
    yield say(BRANCHES[0] if pick == 0 else BRANCHES[1], who=WHO)
