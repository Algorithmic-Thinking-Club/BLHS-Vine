"""What a member's island imports.

Every function in here builds a dict and does nothing else. Putting `yield` in
front of one is what makes it happen, because the thing that performs it is the
engine, on the other side of the worker.

One rule, and it is the whole rule: A WORD ONLY HAPPENS IF YOU YIELD IT. Some of
them come back the instant the engine has done them and some wait for the player
to click, and you yield both the same way. A call with no `yield` in front builds
a dict, throws it away, and the engine never hears about it.

The names and the spelling come from src/vine/intents.ts. `say` builds
{"kind": "say"} because that is the kind the engine already performs, and
nothing between here and there translates anything. There are twenty-five words
and this file has all twenty-five: for a year it had two, so thirteen things the
engine could already do were unreachable from a member's island, and the ten
below that were added after are the ones for DIRECTING a scene rather than
walking through one.

EVERY PLACE IS AN ANCHOR NAME, NEVER AN X AND A Y. MAPVIS is the only thing that
can make an anchor, it keeps the name separate from the label so renaming a door
for the player cannot break your code, and a coordinate would break the moment
Ash moved the table you were pointing at. A name the map does not carry is
refused, and the refusal is raised on YOUR line.
"""


# ---- talking ---------------------------------------------------------------

def say(text, who=None, portrait=None):
    """One line in the dialogue box. Comes back when the player clicks on.

    `who` is a name: an anchor's, or the word "thor" for the player, and the box
    prints the LABEL whoever placed that anchor typed rather than the name your
    code addresses it by.

    `portrait` is the face beside it, by the id of a drawn one. There is one so
    far, "principal". Leave it off and the box shows a plate with no face, which
    is what almost every line in this game is.
    """
    intent = {"kind": "say", "text": text}
    # a key left out entirely rather than sent as None: the engine's `who` is
    # optional, and an explicit null is a different thing from an absent name
    if who is not None:
        intent["who"] = who
    # THE FACE WAS ENGINE-ONLY AND THAT WAS AN ACCIDENT. `Intent` has carried
    # `portrait` since the box was written, the cutscene registry uses it, and
    # this builder did not have the argument, so the one drawn face in the game
    # was reachable from TypeScript and not from a member's island. Same field,
    # same wire, one keyword.
    if portrait is not None:
        intent["portrait"] = portrait
    return intent


def choose(options, prompt=None):
    """Buttons over the box. Comes back as the index the player picked."""
    intent = {"kind": "choose", "options": options}
    if prompt is not None:
        intent["prompt"] = prompt
    return intent


# ---- moving him, and moving the camera -------------------------------------

def guide_to(anchor):
    """Draw the arrow to an anchor. Comes back at once; he still walks himself.

    `guide_to(None)` takes it down again and hands the pointing back to the
    year, which is what you want the moment your beat is over: an arrow you
    raised and never lowered sits over the last thing you pointed at and hides
    whatever the game wanted to send him to next.
    """
    # None IS the message, the same way it is in look_at, so it is sent rather
    # than left out
    return {"kind": "guide_to", "anchor": anchor}


def walk_to(anchor):
    """Take the controls and walk him there. Comes back when he arrives."""
    return {"kind": "walk_to", "anchor": anchor}


def look_at(anchor, ms=None):
    """Point the camera at an anchor. `look_at(None)` gives it back to him."""
    # None IS the message here, so unlike every other optional it is sent rather
    # than left out: an absent anchor would read as "no argument", and letting
    # the camera go is a thing an island asks for on purpose
    intent = {"kind": "look_at", "anchor": anchor}
    if ms is not None:
        intent["ms"] = ms
    return intent


# ---- his own body ------------------------------------------------------------

def pose(name=None, facing=None):
    """Set what he is doing while standing still, and which way he is looking.

    `pose("sleep")` lies him down, `pose("sit")` sits him, `pose("stand")` puts
    him back on his feet. `facing` turns him WITHOUT WALKING him, which is the
    beat you want nine times out of ten: "he hears something and looks north".
    Both together is one call.

    A pose whose picture nobody has drawn is refused on your line and told you
    which ones exist, so you never ship a scene where he was supposed to wake up
    and just stands there.
    """
    intent = {"kind": "pose"}
    if name is not None:
        intent["pose"] = name
    if facing is not None:
        intent["facing"] = facing
    return intent


# ---- somebody else's body ------------------------------------------------------
#
# The four words below drive a thing that is already on the map. You name it by
# its ANCHOR, the same way you name everywhere else, and MAPVIS is where that
# anchor gets tied to the picture it drives.
#
# Taking one over STOPS whatever it was doing on its own. Letting it go starts
# that up again from wherever the clock has got to, not from where you left it,
# so a person you walked across a square goes back to her rounds instead of
# standing where your scene abandoned her.

def actor_move(actor, to, facing=None):
    """Walk somebody to an anchor. Comes back when they get there."""
    intent = {"kind": "actor_move", "actor": actor, "to": to}
    if facing is not None:
        intent["facing"] = facing
    return intent


def actor_face(actor, facing):
    """Turn somebody, without moving them."""
    return {"kind": "actor_face", "actor": actor, "facing": facing}


def actor_look(actor, look):
    """Change which picture somebody is wearing, by the name MAPVIS gave it."""
    return {"kind": "actor_look", "actor": actor, "look": look}


def actor_release(actor=None):
    """Give somebody back to themselves. No name lets everybody go."""
    intent = {"kind": "actor_release"}
    if actor is not None:
        intent["actor"] = actor
    return intent


# ---- following a line somebody drew --------------------------------------------

def route(path, who=None, backwards=False):
    """Send somebody along a named path that was drawn on the map.

    `who` is left out for the player, is an anchor name for anybody else, and is
    the word "ship" to make the crossing happen: THAT is how a voyage starts.

    The path knows whether it is a walk or a sail, and it is checked. A walk over
    ground nobody can stand on and a sail over dry land are both refused on your
    line, with the point that broke it, instead of a body wandering off the
    painting while your script waits forever.
    """
    intent = {"kind": "route", "path": path}
    if who is not None:
        intent["who"] = who
    if backwards:
        intent["backwards"] = True
    return intent


def framing(shot, ms=None):
    """Take a shot somebody set up on the map, by its name.

    `framing(None)` gives the camera back. This is the composed version of
    `look_at`: the angle, the distance and the offset were dragged into place by
    the person looking at the painting, so your scene does not carry numbers that
    stop being true the next time the map is re-cut.
    """
    intent = {"kind": "framing", "shot": shot}
    if ms is not None:
        intent["ms"] = ms
    return intent


# ---- time ----------------------------------------------------------------------

def wait(ms):
    """Do nothing, for this many milliseconds. Beats need air."""
    return {"kind": "wait", "ms": ms}


def wait_for(anchor, ms=None):
    """Wait until he walks into an anchor. Comes back True if he did.

    `ms` is how long you are willing to wait. Without one you wait forever, and
    the answer can only be True. With one, a False is the player deciding to do
    something else, which is a thing your island is allowed to have an opinion
    about.
    """
    intent = {"kind": "wait_for", "anchor": anchor}
    if ms is not None:
        intent["ms"] = ms
    return intent


# ---- sound ---------------------------------------------------------------------

def sound(name, gain=None):
    """Play one effect from the library, once.

    A name the library does not hold is refused on your line with the list of the
    ones it does. There is no music yet, by ruling.
    """
    intent = {"kind": "sound", "name": name}
    if gain is not None:
        intent["gain"] = gain
    return intent


# ---- the world ---------------------------------------------------------------

def show(anchor, visible=True):
    """Make the thing at an anchor appear or disappear."""
    return {"kind": "show", "anchor": anchor, "visible": visible}


def fx(name, anchor=None, data=None):
    """Play a one-shot effect, at an anchor or wherever the effect decides."""
    intent = {"kind": "fx", "name": name}
    if anchor is not None:
        intent["anchor"] = anchor
    if data is not None:
        intent["data"] = data
    return intent


def enter(map, at=None):
    """Go to another map. `at` is the anchor there to arrive on."""
    # without `at` every door into a room drops the player on that room's one
    # global spawn, however far that is from the door they walked through
    intent = {"kind": "enter", "map": map}
    if at is not None:
        intent["at"] = at
    return intent


def cutscene(script):
    """Play an authored cutscene. Comes back when it is over."""
    return {"kind": "cutscene", "script": script}


# ---- the panels a player sits down with -------------------------------------

def open(ui):
    """Open one panel: planner, handbook, chart, wardrobe or settings."""
    # this shadows the builtin `open` if you import it by name, and that costs
    # nothing: there is no filesystem inside the worker to open a file on. The
    # name matches the engine's word, and one spelling is worth more than one
    # builtin nobody can use here.
    return {"kind": "open", "ui": ui}


# ---- doing something that gets a score --------------------------------------

def play(beat, as_plain=None):
    """Run a scored activity. Comes back as the score, or None if it was left."""
    # LEAVE as_plain ALONE unless you mean it. Left out, the engine renders the
    # arm this player was assigned at join, which is what keeps the study's two
    # arms looking at the same content. Passing True forces the plain rendering
    # for everybody, which is a real thing to want for a moment that should read
    # the same either way. You cannot force the game rendering, because that
    # would let one island opt the control arm out of being a control.
    intent = {"kind": "play", "beat": beat}
    if as_plain is not None:
        intent["as_plain"] = as_plain
    return intent


# ---- the run ------------------------------------------------------------------

def get(path):
    """Read one thing about the run. Comes back as the value.

    year        1 to 4
    gpa         a number, or None when nothing has been graded yet. GUARD IT.
    tokens      how many seasons are still in hand, as a COUNT and not a list
    cords       the ids of the cords already earned
    cord_board  every cord as a dict: name, rule, earned, progress, detail
    trophies    {"stickers": [...], "badges": [...]}, what is on the wall
    flags       your island's own flags, with your programme id stripped back off
    islands     {programme id: "misty"/"discovered"/"available"/"active"/"completed"}
    handle      the name the player chose, or None
    mode        "game" or "plain", which half of the class this is
    graduated   True or False
    """
    return {"kind": "get", "path": path}


def set_flag(flag):
    """Remember that something happened, for the rest of the run."""
    return {"kind": "set_flag", "flag": flag}


def award(programme=None, grade=None, tags=None, fact=None, sticker=None, badge=None):
    """Write the row your island earned onto the transcript.

    `programme` is the roster id this grade finishes, and it is the one that
    matters: from it the engine knows the title, the credit, the kind, the cord
    tags and the rank track. Say what you finished; what it is worth is not
    yours to decide.
    """
    intent = {"kind": "award"}
    for key, value in (("programme", programme), ("grade", grade), ("tags", tags),
                       ("fact", fact), ("sticker", sticker), ("badge", badge)):
        if value is not None:
            intent[key] = value
    return intent


def log(event, data=None):
    """Add a line to the record. You add to it; you do not write it."""
    intent = {"kind": "log", "event": event}
    if data is not None:
        intent["data"] = data
    return intent
