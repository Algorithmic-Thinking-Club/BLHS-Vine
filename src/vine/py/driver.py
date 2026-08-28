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

Nothing here is ever handed python source built in JavaScript. The module name,
the entry name and the reply all arrive through globals, which carries quotes,
newlines and unicode intact (measured), so there is no escaping to get wrong and
no way for an island's text to become code.
"""
import json
import sys

_gen = None
_step = "null"


def _begin(module, entry):
    global _gen
    # dropped first, so a re-run picks up the file as it is on disk rather than
    # whatever was imported the first time
    if module in sys.modules:
        del sys.modules[module]

    _gen = getattr(__import__(module), entry)()

    # the forgotten `yield`, caught at dispatch. MicroPython has no inspect
    # module, so this is type(x).__name__, which the spike measured works.
    if type(_gen).__name__ != "generator":
        raise TypeError(
            "%s.%s() never yielded, so nothing ran. Put `yield` in front of the "
            "things that take time." % (module, entry))

    _pump(lambda: _gen.send(None))


def _resume(reply_json):
    reply = json.loads(reply_json)
    if reply.get("ok"):
        _pump(lambda: _gen.send(reply.get("value")))
    else:
        _pump(lambda: _gen.throw(RuntimeError(reply.get("why", "the engine refused that"))))


def _pump(advance):
    global _step
    try:
        _step = json.dumps({"t": "intent", "intent": advance()})
    except StopIteration:
        _step = json.dumps({"t": "done"})
