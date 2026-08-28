"""The sandbox, on purpose.

This island says a line, takes an answer, and then does something no island
should survive. The point is entirely what happens next: the engine keeps
running, the dialogue box is still there, and the player is told the island is
under construction instead of watching the tab die.

The traceback names this file and this line, which is the thing that makes a
beginner able to fix it.
"""
from vine import say, choose


def main():
    yield say("I am going to break on the line after your answer.", who="the broken island")

    pick = yield choose(["Break it.", "Break it anyway."])

    # a number plus a string. This is the bug, and it is line 20 of broken.py.
    score = pick + " points"

    yield say(score, who="the broken island")
