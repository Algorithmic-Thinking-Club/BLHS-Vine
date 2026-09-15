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
nothing between here and there translates anything. There are thirty-one words
and this file has all thirty-one: for a year it had two, so thirteen things the
engine could already do were unreachable from a member's island, and the ones
added after that are for DIRECTING a scene rather than walking through one.

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
    # the key is left out entirely rather than sent as None, because the engine's `who` is optional and an explicit null is a different thing from an absent name
    if who is not None:
        intent["who"] = who
    # `portrait` rides the same field the cutscene registry already reads, so the one drawn face is reachable from an island and not only from TypeScript
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
    # None is the message here, the same as in look_at, so it is sent rather than left out
    return {"kind": "guide_to", "anchor": anchor}


def highlight(anchor, on=True):
    """Light one thing up where it stands, with no arrow and no road to it.

        yield highlight("the_desk")        # the light goes on
        yield highlight(None)              # and off again

    `guide_to` is the other half of this and it is a louder word: it raises a big
    arrow over the thing AND lays a trail of marks along the floor from wherever
    you are standing to it AND lights it. That is the right thing to say when the
    student has to GO somewhere and does not know where.

    This is for when he is already looking at the thing and you only want to say
    WHICH ONE. The president's terrace has eight computers on it and exactly one of
    them is switched on; the difference between "that one" and "walk over there" is
    the difference between these two words.

    Both of them point at a live anchor, so a thing that walks about takes its
    light with it, and both of them are taken down the same way: pass None, or
    `on=False`, whichever reads better in your line.
    """
    return {"kind": "highlight", "anchor": anchor if on else None, "on": bool(on and anchor)}


def walk_to(anchor, off=None):
    """Take the controls and walk him there. Comes back when he arrives.

    He ends up on the standing spot whoever drew the anchor put there, turned the
    way they drew it to be looked at, which is nearly always what you want.

    `off` is two numbers from that spot, for the case where the map has not said:
    a post somebody moved without moving its standing spot, or a new thing nobody
    has drawn a spot for yet. It is the same `off` `lead_to` and `place` take.
    """
    intent = {"kind": "walk_to", "anchor": anchor}
    if off is not None:
        intent["off"] = [off[0], off[1]]
    return intent


def look_at(anchor, ms=None):
    """Point the camera at an anchor. `look_at(None)` gives it back to him."""
    # None is the message here, so unlike every other optional it is sent rather than left out: an absent anchor would read as no argument, and letting the camera go is a thing an island asks for on purpose
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


# these words drive a placement by its anchor: taking one over stops its own life, releasing it resumes from where the clock has got to, and `off` steps aside from the station's one authored mark in painting pixels, snapped onto legal floor and refused over ninety-six


def actor_move(actor, to, off=None, facing=None, pace=None):
    """Walk somebody to an anchor. Comes back when they get there.

    `pace` is how fast: "stroll", "walk" or "run". Left out it is a walk, which
    is the same speed the player walks this map at. A name nobody drew is
    refused on your line with the list of the ones that exist.

    `off` is two numbers, across and down, from the anchor's own standing spot,
    for a body that belongs beside a thing rather than on it.

    They walk with their legs going, if whoever drew them drew a walk cycle for
    the heading they are travelling on, and they stand on the first frame of it
    when they stop.

    `to` can also be the word "thor", which means "walk over to the player and
    stop in front of him, facing him". Use that when somebody is coming to find
    the student; `place` is the same spot with no walk, for a body that should
    already be there when a shot opens.
    """
    intent = {"kind": "actor_move", "actor": actor, "to": to}
    if off is not None:
        intent["off"] = [off[0], off[1]]
    if facing is not None:
        intent["facing"] = facing
    if pace is not None:
        intent["pace"] = pace
    return intent


def lead_to(actor, to, off=None, pace=None):
    """Somebody walks ahead to an anchor and the player follows them there.

    Comes back when they have BOTH stopped. The leader sets off, the player
    comes up behind him once he is a couple of body lengths clear, and the
    leader turns round to face the player at the end of it, which is when you
    say your line.

    `off` moves where the LEADER ends up, two numbers from the anchor's standing
    spot, and it is what you want at nearly every station: without it he stops on
    the spot the student is meant to stand on, in front of the thing. With it he
    stops beside it, and `walk_to` on the next line brings the student up onto
    the spot itself.

    This is the shape a guided tour has, and writing it as `actor_move` and then
    `walk_to` does not work: `actor_move` waits for the leader to ARRIVE, so the
    student stands still watching a man cross a room and then walks the same
    floor on his own afterwards.

    The leader goes ROUND things. `actor_move` carries a body straight at its
    target, which is right for a crate and wrong for a person crossing a room
    with a fire in the middle of it.
    """
    intent = {"kind": "lead_to", "actor": actor, "to": to}
    if off is not None:
        intent["off"] = [off[0], off[1]]
    if pace is not None:
        intent["pace"] = pace
    return intent


def place(actor, at, off=None, facing=None):
    """Put somebody at an anchor with no walk in it. For SETTING a scene.

    Use it before anything starts moving: the principal is already waiting at
    the tunnel mouth when the student walks in, rather than jogging over to him
    while he watches. With no `facing` they are turned to look at the player,
    because a body placed before a scene begins is nearly always waiting for him.

    `off` is two numbers from the anchor's standing spot, so that "waiting at the
    door" is a spot you chose rather than a spot the clearance rule picked.

    Placing somebody where the player is standing puts them BESIDE him, not
    inside him, which is the same clearance `actor_move` uses.
    """
    intent = {"kind": "place", "actor": actor, "at": at}
    if off is not None:
        intent["off"] = [off[0], off[1]]
    if facing is not None:
        intent["facing"] = facing
    return intent


def actor_face(actor, facing):
    """Turn somebody, without moving them.

        yield actor_face(PRESIDENT, "thor")      # he looks at the student
        yield actor_face("thor", PRESIDENT)      # the student looks at him

    `facing` is one of the eight headings, or the word "thor", which means "turn and
    look at the player wherever he is standing". Use that one after a walk: which way
    "at him" is depends on where you both ended up, and a compass point written in
    your island is a bet on a station nobody has moved yet.

    AND THE STUDENT HIMSELF CAN BE THE ONE WHO TURNS. Say "thor" as the FIRST
    argument and the name of a place or a person as the second, and he turns to look
    at it. That is the line for a beat where somebody walks up and starts talking:
    without it he takes the whole conversation facing wherever his last walk left
    him, which in the Maw's closing film was square to the wrong person.

    Both halves read the geometry off the map, so neither of them needs a number.
    """
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


def view(shot, ms=None):
    """One of the five shots the engine composes for itself.

        island   the whole painted island, centred and held still
        walk     the shot you walk around in, following the body
        close    in on the character, for a walk somebody is watching
        ship     riding with the boat, close enough that she is a boat
        sail     the wide sailing floor, the shot open water is crossed at

    `framing` needs a name somebody dragged onto one anchor, which is right for
    "the shot of the tunnel mouth" and no help for "show me the whole island",
    because no anchor the island hangs off. These five are worked out from the
    painting and the window, so they work on any map the day it is exported.

    It comes back when the camera has arrived, so the next line of your island
    does not talk over a move that is still travelling. Pass `ms` to hold the
    shot for that long as well.

    A room has no sea and answers "sail" and "ship" with the walking shot.
    """
    intent = {"kind": "view", "view": shot}
    if ms is not None:
        intent["ms"] = ms
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

def ashore():
    """Put the player off a berthed boat and onto the dock.

    A crossing you scripted ties the ship up and leaves him ABOARD, so that you
    can pull the camera out, play a card and let him look at where he has landed
    before anybody moves. This is the line that ends that.

    Harmless on a body already on its feet.
    """
    return {"kind": "ashore"}


def objective(text=None):
    """The one line at the top of the screen: what the student is doing NOW.

        yield objective("Follow the principal")
        ...
        yield objective(None)      # hand it back to the year

    THE PANEL IS ALWAYS THERE and something is always in it. Left alone it says
    what the YEAR wants next, which the engine works out from the run: stamp the
    schedule, sit Advisory, talk to the counselor. Inside a scene you are
    directing, that sentence is about a step you are walking the student PAST,
    and the honest line for the thirty seconds he is following somebody across a
    room is "Follow the principal". That is a step only you know about, so this
    is the word that says it.

    ONE SHORT IMPERATIVE. A verb and its target, about six words. The panel draws
    one line and clips what will not fit, because a paragraph at the top of the
    screen is the thing this game has been told three times not to do.

    IT DOES NOT HAVE TO BE TURNED OFF, though it is tidier to. The bars coming
    down hand the panel back to the year on their own, so a scene wrapped in
    `as_a_cutscene` cannot leave a stale sentence on the glass even if it
    refuses in the middle.
    """
    return {"kind": "objective", "text": text}


def island_tasks(tasks):
    """Everything your island is asking of the student, as a list.

        yield island_tasks([
            {"id": "meet", "name": "Meet the club president",
             "note": "He is at the top of the stair"},
            {"id": "program", "name": "Fix the half-finished program"},
        ])

    `objective` is the ONE line saying what to do now. This is the list under it,
    and it is what tells a student how much of your island is left. The sheet it
    draws in is the one the year's own tasks use, so you get the ticks, the notes
    and the counter without drawing anything.

    DECLARE THE WHOLE LIST, EVERY TIME. It REPLACES whatever was declared before,
    so the plainest thing to write is the right thing: say it in `@on_start` and
    let it run again every time the map loads. Which rows are already ticked comes
    back out of the save, not out of this call, so nothing is lost and nothing is
    double counted.

    ONE ROW IS ONE THING A STUDENT DOES. An `id` you tick it by, a `name` they
    read, and an optional `note` saying where it happens. Eight rows at most,
    because a list longer than that is a document.

    THE NAMES ARE FOR A FOURTEEN YEAR OLD. "Meet the club president", not "trigger
    the host dialogue". The note is where, not how.
    """
    return {"kind": "island_tasks", "tasks": tasks}


def task_done(id):
    """Tick one of your tasks off.

        yield task_done("meet")

    The tick is kept in the save under your island and the YEAR it happened in, so
    a student who closes the tab halfway through keeps what he finished, and a
    student who takes your club again next year starts the list fresh.

    SAY IT WHEN THE THING IS ACTUALLY DONE, not when it starts. A row that ticks
    itself on the way in is a list that lies about how far along somebody is.

    It is safe to say twice. An id you never declared is refused at the line that
    said it, so a typo is a sentence rather than a row that can never be finished.
    """
    return {"kind": "task_done", "id": id}


def movie(on=True):
    """Two black bars, no HUD, no plaques, and the controls taken away.

    This is for a stretch the student WATCHES. Everything else keeps working:
    the ship still sails her route, somebody can still say a line, the camera
    can still be moved. What changes is the frame around it.

    `movie(False)` gives it all back. TURN IT OFF. An island that raises the
    bars and then raises an exception leaves a student behind two black bars
    with no controls, which looks like a broken laptop rather than a game; the
    engine lifts them on its own after ten minutes and says so loudly, and that
    is a safety net rather than a way of writing this.

    Most scenes should use `cutscene()` below instead, which is this word with
    the turning-off already written.
    """
    return {"kind": "movie", "on": bool(on)}


def as_a_cutscene(scene):
    """Run a whole scene inside the bars, and take them down whatever happens.

        yield from as_a_cutscene(my_scene())

    where `my_scene` is a generator function of your own. The bars go up, the
    corner goes away and the controls are taken before your first line; they
    come back after your last one, and they come back even if a word in the
    middle refuses and your scene stops on the spot.

    THAT LAST PART IS THE WHOLE REASON IT EXISTS. `movie(True)` is one line and
    `movie(False)` is one line, and the gap between them is the one place in this
    API where forgetting leaves a student looking at a laptop that appears to
    have died. Written this way there is no forgetting: the `finally` is the
    engine's promise rather than yours.

    WHY IT IS NOT `with cutscene():`, which is the shape you would reach for
    first. Every word here HAPPENS by being yielded, and a `with` block's
    __enter__ and __exit__ are ordinary calls that cannot yield anything out of
    the generator they are written in. So the bars would not go up until the next
    line that happened to yield, and on the way out they would not come down at
    all. This is `with` with a `yield from` in front of it and it gives the same
    guarantee.

    AND IT IS NOT CALLED `cutscene`, because that word is already taken by the
    one below it, which plays a scene somebody registered in the engine. Two
    different things with one name is worse than a longer name.
    """
    yield movie(True)
    try:
        yield from scene
    finally:
        yield movie(False)


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


def enter(map, at=None, cover=None):
    """Go to another map. `at` is the anchor there to arrive on.

    Without `at` the player lands on that map's own spawn, however far that is
    from the door they walked through, so name one whenever you mean a door.

    COVERS BELONG TO MAPS. The picture that plays over the change is the
    DESTINATION's, drawn by whoever drew that place and published inside its own
    bundle, so twenty islands with three rooms each do not become sixty people
    choosing sixty different transitions. You get the right one for free.

    `cover` is the only thing you may say about it, and it is two things that look
    alike. An OCCASION says what the moment is: "ceremony" is the end of a year,
    "passing" is a map being crossed on the way somewhere and says nothing at all.
    A NAME is one of the covers the map you are going to actually carries, if it has
    more than one, in the same shape as every other name in this game: lower case,
    digits and underscores, starting with a letter. A name that could not exist is
    refused at this line rather than arriving as a picture nobody drew.

    THE MAP IS TORN DOWN AND YOUR ISLAND GOES WITH IT. Nothing after this line
    is going to run, so put your bars down and write your flags first.
    """
    intent = {"kind": "enter", "map": map}
    if at is not None:
        intent["at"] = at
    if cover is not None:
        intent["cover"] = cover
    return intent


def sail_to(map):
    """Sail to another island. One word, and the engine does the whole journey.

    Thor walks himself out of whatever room he is in, down the quay to the dock,
    hops aboard, and the ship sails herself across behind the two black bars. He
    steps off on the other side and that island's own `@on_start` takes over.

    You never say a route, a berth, a camera or a cover. There is nothing to get
    right: name the island and the engine reads the way there off the world.

    THE MAP IS TORN DOWN AT THE FAR END, the same as `enter`, so nothing after
    this line runs. Say what you have to say before it.
    """
    return {"kind": "sail_to", "map": map}


def end_run():
    """The run is over. Leave the world and go back to the title screen.

    For the last line of a closing film, and for nothing else. The save is kept:
    the title reads it and says the year is done, and the yearbook opens from
    there. Nothing after this line is going to run.
    """
    return {"kind": "end_run"}


def cutscene(script):
    """Play an authored cutscene. Comes back when it is over."""
    return {"kind": "cutscene", "script": script}


# ---- the panels a player sits down with -------------------------------------

def open(ui, wait=False):
    """Open one of the game's panels, by name.

    planner, handbook, cords, chart, wardrobe, settings, wall, yearbook, tour.

    "cords" is the Guide opened on its cords page rather than on islands, which
    is what `open("handbook")` lands on. Say it when the beat is about cords.

    "tour" is the odd one and it is not a panel: it lights the three corner
    plaques and the help mark one at a time with a pointer and a line each, and
    comes back when it is over or when the student skips it. Say it once, with
    `wait=True`, at the moment you have finished handing the room over.

    Comes back the instant the screen is up. Pass `wait=True` and it comes back
    when the panel has been CLOSED instead, which is what you want when the next
    thing your island does has to happen after the student has finished with it:

        yield open("planner", wait=True)   # he picks his year
        yield walk_to("hearth")            # and only then does he walk on

    Without it the line after this one runs underneath the panel, which is right
    for a station that opens the wardrobe and says nothing else, and wrong for
    anything that is walking somebody through a sequence.
    """
    # this shadows the builtin `open` and costs nothing, because there is no filesystem inside the worker to open a file on, and matching the engine's word is worth more
    intent = {"kind": "open", "ui": ui}
    if wait:
        intent["wait"] = True
    return intent


# ---- doing something that gets a score --------------------------------------

def play(beat, as_plain=None, title=None, place=None, items=None):
    """Run a scored activity. Comes back as the score, or None if it was left.

    Named on its own, `beat` is one the engine already has. Hand it `items` as well
    and the activity is YOURS: the engine builds it out of what you pass, renders it
    in both halves of the class, scores it, and gives you back a number out of four.

    An item is a dict with a `kind` and the fields that kind needs. The kinds are in
    src/vine/contract.ts and the useful ones are `choice` for a question with a reply
    per answer, `order` for putting things in sequence, `sort` for putting things in
    boxes, and `program` for building something that then runs in front of the
    student. `title` is what the result card calls it.

    ONE POINT PER ITEM, or per slot in the ones that hold several, and the grade is
    what you earned out of what was on offer, times four. You do not compute it; you
    are handed it.

    EVERYTHING IN `items` HAS TO BE PLAIN DATA. Dicts, lists, strings, numbers,
    True, False, None. A set or an object of your own does not survive the trip to
    the engine, and this runtime writes it out wrong rather than raising, so the
    driver checks and names the value instead.
    """
    # left out, `as_plain` renders the arm this player was assigned at join; True forces the plain rendering for everybody, and the game rendering cannot be forced because that would opt the control arm out of being a control
    intent = {"kind": "play", "beat": beat}
    if as_plain is not None:
        intent["as_plain"] = as_plain
    if title is not None:
        intent["title"] = title
    if place is not None:
        intent["place"] = place
    if items is not None:
        intent["items"] = items
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
    planned     True once this year's sheet has been stamped
    advisory    the beat id this year's Advisory is owed under, or None when it
                is not owed. NOT "did he pass it": a student who sat it and
                failed is not owed it again, and the Maw's hearth said the
                opposite for a week by asking whether a row existed instead.
    islands     {programme id: "misty"/"discovered"/"available"/"active"/"completed"}
    handle      the name the player chose, or None
    mode        "game" or "plain", which half of the class this is
    graduated   True or False
    phase       where the year is, in the sequencer's own words: "founding",
                "vignette", "plan", "core", "voyage", "rising", "yearbook" or
                "done". **"yearbook" is how you ask whether the year is
                finished.** Do not write that question as "Advisory is over":
                the day one island can be sailed to, a stamped sheet still owes
                a voyage and this is the only thing that knows it.
    picks       what he actually chose and earned THIS year, for a line that
                names it: {"classes": [{"id","name"}], "seasons":
                [{"season","id","name"}], "graded": [{"title","grade","kind"}],
                "gpa": a number or None}. The names are already masked, so an
                island nobody has built prints as an Example here too.
    rank        YOUR island, and you never name it: {"taken": how many EARLIER
                years this student finished it, "years": which ones, "best": the
                best grade they got or None, "rung": the ladder step}. A club can
                be taken again in a later year and the second afternoon is meant
                to be its own afternoon rather than a replay; this is how an
                island tells which one it is in.

    "rank" is about YOUR island and nobody has to name it: how many earlier years a
    student has finished this programme, which years those were, the best grade they
    got, and the rung of any ladder it keeps.

        been = yield get("rank")
        if been["taken"]:
            yield say("Back again. Good.")
        else:
            yield say("You must be new.")

    A club can be taken more than once, and the second time is meant to be a different
    afternoon rather than the same one replayed. This is how an island tells.
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
