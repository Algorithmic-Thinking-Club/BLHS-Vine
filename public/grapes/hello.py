"""The first grape: a member's python, running inside the game.

Nothing in this file is engine code. It imports two names, puts `yield` in front
of the things that take time, and the number that comes back from `choose` is
the button the player actually clicked.

The engine drew every line you see. This file only asked for them.
"""
from vine import say, choose


def main():
    yield say("This is Python, and it is running in a worker while the engine draws.", who="the vine")

    pick = yield choose(
        ["Prove the answer got back into Python.", "I believe you."],
        prompt="Which way?",
    )

    if pick == 0:
        yield say("You clicked button %d, and Python counted it." % pick, who="the vine")
        yield say("An if statement in hello.py picked this line over the other one.", who="the vine")
    else:
        yield say("You clicked button %d, so you got the other branch." % pick, who="the vine")
        yield say("Same file, different line, chosen on the Python side.", who="the vine")
