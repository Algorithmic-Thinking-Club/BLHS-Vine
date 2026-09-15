"""How the game reaches into your island.

vine.py gives you words to say. This gives the engine a way to call you.

    from grape import on_talk
    from vine import say

    @on_talk("greeter")
    def meet_the_greeter():
        yield say("You made it.", who="greeter")

Nothing calls meet_the_greeter in this file, or in yours. The player walks up to
the anchor named "greeter", presses E, and the engine calls it. That is the
difference between an island and a script: an island can remember you, open
differently on a third visit, and answer a press on a door.

The game writes this file into the Python runtime before it imports an island,
so this copy is the one that runs. The copy in the members' repo is the same
file, and a test there fails the moment the two differ.
"""

# filled by the decorators as your island is imported, read by the engine the
# moment the import finishes. You never touch this dict.
_handlers = {}

# your island.json, put here by the engine before your island is imported
_manifest = {}


def manifest():
    """Your own island.json, as a dict.

        yield award(programme=manifest()["programme"], grade=score)

    Read your programme id out of here rather than typing it again, so it is
    written once. Two copies of one id drift, and a student's grade then lands
    on somebody else's row.

    A copy, so editing what you get back cannot change what the engine thinks
    your island is.
    """
    return dict(_manifest)


def _forget():
    """Between loads. An island reloaded is an island whose old handlers are gone."""
    _handlers.clear()
    _manifest.clear()


def _describe(fields):
    _manifest.clear()
    _manifest.update(fields)


def _registered():
    """Every handler key this island claims, which is what the engine is told."""
    return sorted(_handlers.keys())


def _register(key, fn, what):
    # two handlers on one key is a bug that looks like nothing happening, because
    # one of them silently wins. Stop at import instead, naming both functions.
    if key in _handlers:
        raise ValueError(
            "%s is already handled by %s(), so %s() would never run. One handler each."
            % (what, getattr(_handlers[key], "__name__", "?"), getattr(fn, "__name__", "?")))
    _handlers[key] = fn
    return fn


def on_start(fn):
    """Run this the moment the island loads, before the player has done anything.

    Good for a first line, or for reading the run once and keeping the answer.
    Not for a wall of text: the player came to play, not to read.
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
