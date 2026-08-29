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
import inspect
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
    __import__(entry[:-3] if entry.endswith(".py") else entry)
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
    # This build DOES carry an inspect module, including isgeneratorfunction, and
    # the old comment here saying otherwise was wrong. But it is not the whole
    # answer either: measured, a BOUND METHOD reports False from
    # isgeneratorfunction even when it plainly is one, so trusting a False alone
    # would tell a member with a class-based island that a working handler never
    # yielded. So a False only convicts when the thing is an ordinary function,
    # and everything else is judged on what the call returns.
    if not inspect.isgeneratorfunction(fn) and type(fn).__name__ not in ("bound_method",):
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
        _step = json.dumps({"t": "intent", "intent": advance()})
    except StopIteration:
        # dropped, so a stray resume lands on the message above rather than on a
        # generator that has already finished
        _gen = None
        _step = json.dumps({"t": "done"})
