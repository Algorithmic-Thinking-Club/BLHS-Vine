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
nothing between here and there translates anything. There are fifteen words and
this file has all fifteen: for a year it had two, so thirteen things the engine
could already do were unreachable from a member's island.

EVERY PLACE IS AN ANCHOR NAME, NEVER AN X AND A Y. MAPVIS is the only thing that
can make an anchor, it keeps the name separate from the label so renaming a door
for the player cannot break your code, and a coordinate would break the moment
Ash moved the table you were pointing at. A name the map does not carry is
refused, and the refusal is raised on YOUR line.
"""


# ---- talking ---------------------------------------------------------------

def say(text, who=None):
    """One line in the dialogue box. Comes back when the player clicks on."""
    intent = {"kind": "say", "text": text}
    # a key left out entirely rather than sent as None: the engine's `who` is
    # optional, and an explicit null is a different thing from an absent name
    if who is not None:
        intent["who"] = who
    return intent


def choose(options, prompt=None):
    """Buttons over the box. Comes back as the index the player picked."""
    intent = {"kind": "choose", "options": options}
    if prompt is not None:
        intent["prompt"] = prompt
    return intent


# ---- moving him, and moving the camera -------------------------------------

def guide_to(anchor):
    """Draw the arrow to an anchor. Comes back at once; he still walks himself."""
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

    year, gpa, tokens, cords, flags, islands, handle, mode, graduated.
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
