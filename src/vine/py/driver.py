"""THE PUMP, on the python side.

The mirror of src/game/maw/run-station.ts, which drives a TypeScript generator
through this exact protocol and said, in its own comment, that this was the
shape the runtime would have to match. It is:

    the island yields an intent   ->  _step carries it out to the worker
    the engine answers            ->  _resume sends the value back in
    the engine refuses            ->  _resume raises it AT the yield that asked

That last line is generator.throw(), and it is why a refused intent is not
swallowed. A member who asks for something this scene cannot do gets a
traceback pointing at their own line, not a line that quietly did nothing.

AND THE OTHER DIRECTION. _load imports a member's package, which is what runs
the decorators in grape.py, and hands back the names they registered. _call then
fires one of those by name. That is the engine calling into a grape rather than
a grape running top to bottom, and without it an island cannot remember you,
cannot open differently on a third visit, and cannot answer a press on an anchor.

Nothing here is ever handed python source built in JavaScript. The island name,
the entry name, the module list and the reply all arrive through globals, which
carries quotes, newlines and unicode intact (measured), so there is no escaping
to get wrong and no way for an island's text to become code.
"""
import json
import sys

import grape

_gen = None
_step = "null"


def _load(island, entry, names_json, manifest_json):
    """Put a member's package on sys.path, import it, report what registered."""
    global _gen, _step
    _gen = None

    # the island's own folder is the import root, which is what lets `from questions import Quiz` reach a sibling file, and every other island's folder comes off `sys.path` first because leaving one on lets a second island import a file the first shipped, which works here and nowhere else
    here = "islands/" + island
    sys.path[:] = [p for p in sys.path if not p.startswith("islands/")]
    sys.path.insert(0, here)

    # dropped before the import so a re-run reads the files as they are on disk, and for every module the island ships rather than the entry alone, because a cached sibling made an already fixed bug keep happening
    for name in json.loads(names_json):
        mod = name[:-3] if name.endswith(".py") else name
        if mod in sys.modules:
            del sys.modules[mod]

    grape._forget()
    # before the import, so a module level `manifest()["programme"]` works and not only one inside a handler
    grape._describe(json.loads(manifest_json))
    try:
        __import__(entry[:-3] if entry.endswith(".py") else entry)
    except:
        # an import that raises halfway has already registered half the island and those handlers stay callable, so "the island did not import" has to mean the island cannot run at all
        grape._forget()
        raise
    _step = json.dumps({"t": "ready", "handlers": grape._registered()})


def _call(name):
    """Fire one registered handler. The engine decided when; the island decided what."""
    global _gen
    fn = grape._handlers.get(name)
    if fn is None:
        raise LookupError(
            "this island registered no handler named %r. It registered: %s"
            % (name, ", ".join(grape._registered()) or "nothing"))

    # the forgotten `yield`, and not `inspect.isgeneratorfunction`: on 1.29.0-6 it answers False for a bound method and for a closure, what every decorator returns, so the type name is used instead, `generator` for a def holding a yield and `function` for a plain one, and only `function` is convicted without running the body
    if type(fn).__name__ == "function":
        raise TypeError(
            "%s() has no yield in it, so nothing it does would ever reach the "
            "engine. Put `yield` in front of the things that take time."
            % getattr(fn, "__name__", name))

    _gen = fn()
    if type(_gen).__name__ != "generator":
        raise TypeError(
            "%s() never yielded, so nothing ran. Put `yield` in front of the "
            "things that take time." % getattr(fn, "__name__", name))

    _pump(lambda: _gen.send(None))


def _resume(reply_json):
    if _gen is None:
        raise RuntimeError("the engine answered an island that is not waiting on anything")
    reply = json.loads(reply_json)
    if reply.get("ok"):
        _pump(lambda: _gen.send(reply.get("value")))
    else:
        _pump(lambda: _gen.throw(RuntimeError(reply.get("why", "the engine refused that"))))


def _pump(advance):
    global _gen, _step
    try:
        _step = _wire({"t": "intent", "intent": advance()})
    except StopIteration:
        # dropped, so a stray resume lands on the message above rather than on a generator that has already finished
        _gen = None
        _step = json.dumps({"t": "done"})


def _wire(message):
    """JSON, or a sentence about the value that would not become JSON.

    THIS BUILD'S json.dumps DOES NOT RAISE on something it cannot encode. It
    writes the repr and hands back a string that is not JSON, which then dies in
    the worker's JSON.parse, OUTSIDE the guard that turns a python problem into a
    readable message. A member who wrote `award(tags={"stem", "fall"})`, which is
    an ordinary set, got a JavaScript parser complaint with a byte offset in it.

    A set, an object, a class, nan. All things a member reaches for, and none of
    them survive a postMessage. So the round trip is checked here, where the
    value that caused it can still be named.
    """
    text = json.dumps(message)
    try:
        json.loads(text)
    except (ValueError, TypeError):
        raise TypeError(
            "this island yielded something the engine cannot be sent: %r. An "
            "intent carries text, numbers, True, False, None, lists and dicts, "
            "and nothing else. A set or one of your own objects has to become "
            "one of those first." % (message.get("intent"),))
    return text
