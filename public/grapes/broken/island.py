"""The sandbox, on purpose.

This island has two handlers. One of them says a line, takes an answer, and then
does something no island should survive. The other one works.

The point is entirely what happens next. The engine keeps running, the dialogue
box is still there, the player is told the island is under construction, and
THE OTHER HANDLER STILL WORKS, because a crash inside one beat stops that beat
and not the island. Press the second button after the first one to see it.

The traceback names this file and this line, which is the thing that makes a
beginner able to fix it.
"""
from grape import on_talk
from vine import choose, guide_to, say

WHO = "the broken island"


@on_talk("break_it")
def break_it():
    yield say("I am going to break on the line after your answer.", who=WHO)

    pick = yield choose(["Break it.", "Break it anyway."])

    # a number plus a string. This is the bug, and it is line 27 of island.py.
    score = pick + " points"

    yield say(score, who=WHO)


@on_talk("still_here")
def still_here():
    yield say("The island crashed and I still work. That is the sandbox.", who=WHO)


@on_talk("ask_for_the_impossible")
def ask_for_the_impossible():
    """A word the engine understands, in a scene that cannot perform it.

    This harness has no map, so there is no ground to draw an arrow over. The
    engine does not quietly do nothing and it does not answer ok: it refuses,
    and the refusal is raised back HERE, at the yield on the next line, so the
    traceback names the member's own file. A word that cannot perform says so.
    """
    yield say("Watch what happens when I ask for something this scene cannot do.", who=WHO)
    yield guide_to("a_place_that_is_not_here")
    yield say("You will not see this line.", who=WHO)
