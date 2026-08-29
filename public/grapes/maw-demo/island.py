"""What happens when a member's island claims an anchor the vine already answers to.

`hearth` is one of the Panther's Maw's own stations, written in TypeScript in
src/game/maw/stations.ts. This file claims the same name.

THE ISLAND WINS, and that is the ruling rather than an accident. §80.8 asks for
the router order to be written down rather than discovered: a grape is asked
first and the station table is the fallback, so the Maw stops being a special
case the moment there is a second author, and a member on their own map can take
over an anchor the vine already uses without asking anybody.

Load it onto the Maw stand-in with:

    ?scene=pmap&map=panther-maw&grape=/grapes/maw-demo/

then walk to the hearth and press E. The line below is what appears, and the
station that would otherwise have run does not.
"""
from grape import manifest, on_talk
from vine import say, set_flag


@on_talk("hearth")
def take_the_hearth():
    yield say("A member's python is answering this anchor, not the vine's.",
              who="the hearth")
    yield say("The station that used to own it is the fallback now.", who="the hearth")
    # written bare; the engine files it under this island's own programme id
    yield set_flag("took_the_hearth")
    yield say("Flag written as %s:took_the_hearth." % manifest()["programme"],
              who="the hearth")
