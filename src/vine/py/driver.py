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


def _load(island, entry, names_json):
    """Put a member's package on sys.path, import it, report what registered."""
    global _gen, _step
    _gen = None

    # THE ISLAND'S OWN FOLDER IS THE IMPORT ROOT, which is what lets a member
    # write `from questions import Quiz` about the file sitting beside island.py.
    # A real package with __init__.py works too (measured), but then the sibling
    # import has to be `from . import questions`, and that is the one sharp edge
    # in the whole surface. This is the version a beginner survives.
    #
    # EVERY OTHER ISLAND'S FOLDER COMES OFF THE PATH FIRST. Leave one on and a
    # second island can import a file the first one shipped, which works here and
    # nowhere else, because the engine only ever fetches the modules an island
    # actually lists.
    here = "islands/" + island
    sys.path[:] = [p for p in sys.path if not p.startswith("islands/")]
    sys.path.insert(0, here)

    # dropped before the import, so a re-run picks the files up as they are on
    # disk rather than as they were the first time. EVERY module the island
    # ships, not just the entry: editing a sibling and re-running used to reuse
    # the cached old one, and a member would watch a bug they had already fixed
    # keep happening.
    for name in json.loads(names_json):
        mod = name[:-3] if name.endswith(".py") else name
        if mod in sys.modules:
            del sys.modules[mod]

    grape._forget()
    try:
        __import__(entry[:-3] if entry.endswith(".py") else entry)
    except:
        # AN IMPORT THAT RAISES HALFWAY HAS ALREADY REGISTERED HALF THE ISLAND,
        # and those handlers stay in the dict and stay callable. "The island did
        # not import" has to mean the island cannot run, or a member debugs a
        # file where the first two anchors work and the third does nothing.
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

    # THE FORGOTTEN `yield`, CAUGHT BEFORE THE BODY RUNS where that is possible.
    #
    # AND NOT WITH inspect.isgeneratorfunction, which is the obvious answer and
    # the wrong one. This build does carry an inspect module, so the old comment
    # here claiming it does not was wrong, but measured against 1.29.0-6 it
    # answers False for a bound method AND for a CLOSURE, and a closure is what
    # every decorator returns. Convicting on a False told a member whose handler
    # was wrapped in their own decorator that it had no yield in it, and named
    # the wrapper rather than their function. scripts/mp-guard-spike.mjs is the
    # measurement.
    #
    # What this build does instead is put the answer in the type name. A `def`
    # containing a yield is type `generator` before it is ever called; a plain
    # one is `function`; a closure is `closure` either way. So `function` is the
    # one case that can be convicted without running anything, and it is exactly
    # the case a beginner hits. Everything else is judged on what the call
    # returned, one line down, which costs the body of a closure that forgot and
    # is the price of never accusing a working handler.
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
        # dropped, so a stray resume lands on the message above rather than on a
        # generator that has already finished
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
