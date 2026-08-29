"""How the game reaches into your island.

vine.py gives you words to say. This gives the engine a way to call you.

THIS IS THE WHOLE DIFFERENCE BETWEEN AN ISLAND AND A SCRIPT. A script runs top
to bottom and then it is over, which means it cannot remember you, cannot open
differently on a third visit, and cannot answer a press on a door. An island
instead hands the engine a set of handlers and the engine decides when each one
runs. You write the what; the game owns the when.

    from grape import on_talk
    from vine import say

    @on_talk("greeter")
    def meet_the_greeter():
        yield say("You made it.", who="the greeter")

Nothing calls meet_the_greeter in this file, or in yours. The player walks up to
the anchor named "greeter" and presses E, and the engine calls it.

THE GAME WRITES THIS FILE INTO THE PYTHON RUNTIME before it imports an island,
so this copy is the one that runs. The copy in the members' repo is the same
file, kept there so an editor and an offline test can see the names, and a test
in that repo fails the moment the two differ.
"""

# filled by the decorators as your island is imported, read by the engine the
# moment the import finishes. You never touch this dict.
_handlers = {}


def _forget():
    """Between loads. An island reloaded is an island whose old handlers are gone."""
    _handlers.clear()


def _registered():
    """Every handler key this island claims, which is what the engine is told."""
    return sorted(_handlers.keys())


def _register(key, fn, what):
    # TWO HANDLERS ON ONE KEY IS A BUG THAT LOOKS LIKE NOTHING HAPPENING. One of
    # them silently wins, and it is whichever you wrote last, which is not a rule
    # anybody could guess from the outside. Better to stop at import, with both
    # function names in the message.
    if key in _handlers:
        raise ValueError(
            "%s is already handled by %s(), so %s() would never run. One handler each."
            % (what, getattr(_handlers[key], "__name__", "?"), getattr(fn, "__name__", "?")))
    _handlers[key] = fn
    return fn


def on_start(fn):
    """Run this the moment the island loads, before the player has done anything.

    Good for a first-visit line, or for reading `get("mode")` once and keeping
    the answer. Not for a wall of text: the player came to play, not to read.
    """
    return _register("start", fn, "the island's start")


def on_talk(anchor):
    """Run this when the player presses E on the thing you named in MAPVIS.

    The name is the anchor's `name`, not the `label` the player reads on the
    sign, so renaming the sign cannot break your code. If nothing happens when
    you press E, the name here and the name in MAPVIS do not match.
    """
    if not isinstance(anchor, str) or not anchor:
        raise ValueError('on_talk needs the anchor name, as text: @on_talk("greeter")')

    def register(fn):
        return _register("talk:" + anchor, fn, 'the anchor "%s"' % anchor)
    return register


class Scored:
    """Anything your island grades. Every one of these renders twice.

    Half the class plays the game and half reads the same content as plain text
    with a plain check, and the entire study is the comparison between those two
    halves. That comparison only means anything if both halves are reading THE
    SAME THING, so a scored activity has to be able to render either way out of
    one set of items.

    It is here from the first day rather than added later because it cannot be
    added later. An island written without it has its content and its control
    flow tangled together, and untangling twenty of those in October is not a
    thing anybody is going to do.

    Subclass it, keep your items in one place, and write as_plain().
    """

    title = "an activity"

    def as_plain(self):
        """The same content as plain lines. Not a summary of it, the same thing.

        Same questions, same options, same order. What changes between the two
        arms is who is speaking and what happens around it, never what is asked.
        """
        raise NotImplementedError(
            "%s has no as_plain(), so half the class has nothing to read. "
            "Return the same questions, in the same order, as plain lines."
            % type(self).__name__)
