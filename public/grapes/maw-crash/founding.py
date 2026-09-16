"""The second half of the intro film: the tunnel mouth to the handover.

The bars are already up when this runs. Six beats, in order: the tunnel, the
table, the fire, the wall, the counselor, and the handover. Each one asks the
run what is already done, so a reload picks up at the beat the student is in.
"""
from vine import (  # noqa: A004 (open is the engine's word)
    actor_face, actor_release, as_a_cutscene, choose, enter, get,
    guide_to, lead_to, log,
    movie, objective, open, place, play, say, set_flag, show, view, wait, walk_to,
)

from board import on_the_wall

from lines import (
    ADVISORY_IS_MONDAY, ANSWER, COME_BACK, CORD, CORD_ORDINAL, COUNSELOR, FACE,
    FILL_IT_IN, FOLLOW, LOOK_AT_WALL,
    LOOK_AROUND, PRINCIPAL, SCHEDULE_IS_YOURS, SOMEBODY, STAMP_IT, TALK_TO_HER,
    GO_HOME_PROMPT, SAIL_HOME, SAIL_STEP,
    THE_MAW_IS_YOURS, THOR, WALL, WALL_IS_YOURS, WELCOME, WELL_DONE,
    WELL_DONE_BARE, WELL_DONE_GRADED, YEAR_DONE, YEAR_DONE_BARE, year_word,
)

# the year-one flag the rest of the game reads. it is bare because the engine
# runs this island unscoped; your own island's flags are scoped to your
# programme, so do not copy this shape into one.
FOUNDING = "maw:founding"

# the two corner buttons, granted at the handover once the bars are down
CHART = "chart:granted"
HANDBOOK = "handbook:granted"

# the wall beat leaves no other trace in the run, so it carries its own flag
def wall_shown(year):
    """The flag saying this year's wall has been walked to."""
    return "maw:wall_shown:y%d" % year

# the film has played. `island.py` reads this so the room stops opening on it.
RAILED = "maw:railed"

# the room has been handed over: bars down, corner buttons granted, lines said
HANDED_OVER = "maw:handed_over"

# the spot the tunnel puts a student on, and the one name on this map that means
# where the tunnel puts a student down, logged as the road beat 1 came in by
MEET = "arrive_maw"

# the four places the rail leads him to, in order, and the middle of the room
# it hands him at the end of it
TABLE = "chart_table"
HALL = "the_hall"
FIRE = "hearth"
WALL = "trophy_wall"
DESK = "counselor"

# ---- every stand point comes from the map by anchor name, never a number ----
# `lead_to` with no offset and `actor_face(x, "thor")` are worked out against
# the map that is loaded, so a table dragged in MAPVIS moves the pair of them.

# how many times the rail will offer the same screen again before it lets go. A
# student who closes the schedule twice has told you something.
OFFERS = 3


def dress_the_wall(count):
    """Puts the trophy case on the wall. `count` is logged and decides nothing.

    A map with no `trophy_wall` binding logs a line instead of stopping the film.
    """
    try:
        yield show(WALL, True)
    except Exception as refused:
        yield log("show_refused", {"anchor": WALL, "why": str(refused), "on": count})


def vignette(year):
    """The flag saying this year's engine card has been seen."""
    return "vignette:y%d" % year


def turned(year):
    """The flag the engine writes the moment a year's page has turned."""
    return "yearbook:y%d" % year


def he_steps_in_front(look_at=None):
    """Puts the principal in front of the student, wherever the student is standing.

    Pass `look_at` an anchor name to turn him towards it; with no name he looks
    at the student. Comes back False when the map binds no body to him.
    """
    try:
        yield place(PRINCIPAL, THOR)
    except Exception as refused:
        yield log("place_refused", {"actor": PRINCIPAL, "at": THOR, "why": str(refused)})
        return False
    if look_at:
        try:
            yield actor_face(PRINCIPAL, look_at)
        except Exception as refused:
            yield log("actor_face_refused", {"actor": PRINCIPAL, "at": look_at, "why": str(refused)})
    return True


def let_go():
    """Hands the principal back to the room, standing where the film left him."""
    try:
        yield actor_release(PRINCIPAL)
    except Exception as refused:
        yield log("actor_release_refused", {"actor": PRINCIPAL, "why": str(refused)})


def take_him(anchor):
    """The rail's one move: he leads, the student follows, and both stop clean.

    Lights the route, walks the principal to the anchor, walks the student onto
    the station's own standing spot, then turns the two of them face to face.
    """
    yield objective(FOLLOW)

    try:
        yield guide_to(anchor)
    except Exception as refused:
        yield log("guide_refused", {"anchor": anchor, "why": str(refused)})

    try:
        yield lead_to(PRINCIPAL, anchor, pace="walk")
    except Exception as refused:
        yield log("lead_to_refused", {"anchor": anchor, "why": str(refused)})

    # and the last two body lengths are the student's own: this puts him on the
    # station's own standing spot, turned the way its author drew it
    try:
        yield walk_to(anchor)
    except Exception as refused:
        yield log("walk_to_refused", {"anchor": anchor, "why": str(refused)})

    # and the man turns to the boy, who has moved since `lead_to` turned him
    try:
        yield actor_face(PRINCIPAL, "thor")
        # and the boy looks back
        yield actor_face("thor", PRINCIPAL)
    except Exception as refused:
        yield log("actor_face_refused", {"anchor": anchor, "why": str(refused)})


def step_off():
    """The rail lets go: arrow down, camera back, the principal his own again.

    The bars come down in `as_a_cutscene`'s own `finally`, not here.
    """
    yield guide_to(None)
    yield from let_go()
    yield view("walk")
    # and the panel goes back to the year, which names the one thing still lit
    yield objective(None)


# ---- the five beats ----------------------------------------------------------


def the_tunnel(walk):
    """BEAT 1. He is at the mouth, the principal is already there, one line."""
    yield objective(FOLLOW)
    yield say(WELCOME, who=PRINCIPAL, portrait=FACE)

    # the year has begun, which is what lights the table
    year = yield get("year")
    yield set_flag(FOUNDING)
    yield set_flag(vignette(year))
    yield log("founding_seen", {"where": MEET if walk else PRINCIPAL})


def the_table():
    """BEAT 2. He leads him to the table and his schedule opens.

    Comes back True when the schedule is really stamped. The screen is offered
    again when it is closed unstamped, because closing it is not a decision and
    walking him to the fire with an empty schedule would be the rail losing the
    one thing it walked him here for. Three times, and then it lets go: a student
    who has shut the same screen three times is telling you to leave them alone,
    and the year's own light is still on this table when they change their mind.
    """
    yield from take_him(TABLE)
    yield objective(FILL_IT_IN)
    yield say(SCHEDULE_IS_YOURS, who=PRINCIPAL, portrait=FACE)

    planned = False
    for _ in range(OFFERS):
        yield open("planner", wait=True)
        planned = yield get("planned")
        if planned:
            break
        yield say(STAMP_IT, who=PRINCIPAL, portrait=FACE)

    return planned


def the_fire(beat):
    """BEAT 3. He leads him to the fire and Advisory is three things by hand.

    No `award` here: the engine writes the grade for its own content. Your
    island scores its own content, so it writes the row itself.
    """
    yield from take_him(FIRE)
    yield objective(ANSWER)
    yield say(ADVISORY_IS_MONDAY, who=PRINCIPAL, portrait=FACE)

    # `play` runs the engine's own activity for this beat and hands back a score
    score = yield play(beat)

    # None is the player closing the panel; a zero is a student who answered badly
    if score is None:
        yield say(COME_BACK, who=PRINCIPAL, portrait=FACE)
        return False

    yield log("advisory_sat", {"beat": beat, "grade": score})
    return True


def the_wall(year):
    """BEAT 4. He leads him to the wall and it opens on what he picked.

    The panel is the readout: one frame per thing he chose, filled where he has
    earned it and honestly empty where he has not, in his own picks' names. The
    one line says why he is looking at it and nothing else.
    """
    yield from take_him(WALL)
    yield objective(LOOK_AT_WALL)
    yield say(WALL_IS_YOURS, who=PRINCIPAL, portrait=FACE)
    # the case is put back on the wall before the panel opens
    trophies = yield get("trophies")
    yield from dress_the_wall(on_the_wall(trophies))
    yield open("wall", wait=True)
    yield set_flag(wall_shown(year))


def the_counselor(year):
    """BEAT 5. He leads him to her, the cord, and the page turns.

    Comes back True only when the page really turned.
    """
    yield from take_him(DESK)
    yield objective(TALK_TO_HER)
    # the year and the cord are two different numbers
    yield say(
        CORD % (year_word(year), CORD_ORDINAL[year] if 0 < year < len(CORD_ORDINAL) else str(year)),
        who=COUNSELOR,
    )
    yield open("yearbook", wait=True)

    flags = yield get("flags")
    if turned(year) not in flags:
        return False

    yield log("year_one_closed", {"year": year})
    return True


def the_handover():
    """The end of the film: the bars come down and the game becomes his.

    The order matters. `movie(False)` is what puts the corner buttons on screen
    at all, so the bars come off before the first one is granted.
    """
    yield set_flag(RAILED)

    # ---- 1: he walks the student out into the middle of the room -----------
    # `the_hall` is the region over the middle of the room. A region has no
    # standing spot, so the walk goes to its own pixel.
    yield objective(LOOK_AROUND)
    yield from take_him_to_the_middle()

    # ---- 2: the camera pulls off his shoulder and shows him the room -------
    yield view("island")
    yield wait(1600)

    # ---- 3: the last line of the film, said while the bars are still up ----
    yield say(THE_MAW_IS_YOURS, who=PRINCIPAL, portrait=FACE)

    # ---- 4: the bars come down on the wide shot ----------------------------
    yield movie(False)
    # `movie(False)` drops the island's word, so the step is said again on the
    # far side of the bars coming down
    yield objective(LOOK_AROUND)

    # ---- 5: and the corner arrives, one plaque at a time, in silence --------
    # the wait is what makes it one at a time: two flags on the same frame are
    # one flicker rather than a corner filling up
    yield set_flag(HANDBOOK)
    yield wait(700)
    yield set_flag(CHART)
    yield wait(500)

    # ---- 6: and then somebody points at each of them -----------------------
    # `open("tour")` lights the real controls wherever the HUD has put them, and
    # `wait=True` keeps the next line from landing underneath it
    try:
        yield open("tour", wait=True)
    except Exception as refused:
        yield log("tour_refused", {"why": str(refused)})

    yield guide_to(None)
    yield from let_go()
    yield view("walk")
    # and only now: the film keeps the panel until it is finished
    yield objective(None)
    yield set_flag(HANDED_OVER)
    yield log("handover", {})


def take_him_to_the_middle():
    """He leads the student out into the open floor and lets go of him there.

    No arrow: `the_hall`'s own pixel sits in the fire, so pointing at it would
    light Advisory instead.
    """
    try:
        yield lead_to(PRINCIPAL, HALL, pace="walk")
    except Exception as refused:
        yield log("lead_to_refused", {"anchor": HALL, "why": str(refused)})
    try:
        yield walk_to(HALL)
    except Exception as refused:
        yield log("walk_to_refused", {"anchor": HALL, "why": str(refused)})
    try:
        yield actor_face(PRINCIPAL, "thor")
        yield actor_face("thor", PRINCIPAL)
    except Exception as refused:
        yield log("actor_face_refused", {"anchor": HALL, "why": str(refused)})


def name_list(names):
    """"A", "A and B", "A, B and C". Nobody in this game says "and B, C"."""
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    return "%s and %s" % (", ".join(names[:-1]), names[-1])


def well_done(handle, picks):
    """The principal's congratulation, built out of the save and nothing else.

    `picks` is already masked by the engine, so a programme nobody has built
    prints as its example name.
    """
    who = handle or SOMEBODY
    chose = [c["name"] for c in (picks.get("classes") or [])]
    chose += [p["name"] for p in (picks.get("seasons") or [])]

    # the Advisory row, which is the only thing in year one that carries a grade
    grade = None
    for row in picks.get("graded") or []:
        if row.get("kind") == "core":
            grade = row.get("grade")

    if chose and grade:
        return WELL_DONE_GRADED % (who, name_list(chose), grade)
    if chose:
        return WELL_DONE % (who, name_list(chose))
    return WELL_DONE_BARE % who


def well_done_now(handle, year):
    """What he says once the page has turned, with his own name in it if he typed one."""
    name = (handle or "").strip()
    if not name or name == SOMEBODY:
        return YEAR_DONE_BARE % year_word(year)
    return YEAR_DONE % (name, year_word(year))


def year_is_done():
    """True when the year has nothing left owing. The closing film's trigger.

    Asks the sequencer for `get("phase")`, whose word for a finished year is
    "yearbook".
    """
    phase = yield get("phase")
    return phase == "yearbook"


# ---- the opening film --------------------------------------------------------


def opening(walk):
    """The tunnel, the schedule, Advisory, the wall, and then the handover.

    It asks the run which beats are already done, so a student who reloads picks
    up where he left off.
    """
    flags = yield get("flags")
    first = FOUNDING not in flags

    # he is placed before the camera moves
    if first and walk:
        yield from he_steps_in_front()

    # the shot is the student's own shoulder for the whole of what follows
    yield view("close")

    if first:
        yield from the_tunnel(walk)

    planned = yield get("planned")
    if not planned:
        planned = yield from the_table()
        if not planned:
            yield from step_off()
            return

    beat = yield get("advisory")
    if beat is not None:
        sat = yield from the_fire(beat)
        if not sat:
            yield from step_off()
            return

    # ---- and the wall, the last beat before he is let go --------------------
    # the closing film owns the same beat: `wall_shown(year)` keeps them one, so
    # whichever film gets there first draws it and the other skips it
    # the wall's latch carries the year, so the opening has to know which one
    year = yield get("year")
    flags = yield get("flags")
    if wall_shown(year) not in flags:
        yield from the_wall(year)

    # ---- and the introduction ends at the handover, always -----------------
    # it never runs on into the closing film
    yield from the_handover()


# ---- the closing film --------------------------------------------------------


def closing_beats():
    """The counselor, the cord, the page, and out."""
    year = yield get("year")
    flags = yield get("flags")
    if turned(year) not in flags:
        closed = yield from the_counselor(year)
        if not closed:
            yield from step_off()
            return

    # ---- he congratulates him, and then there is one button ----------------
    # said on the far side of the page turning, which is the frame the year is
    # over on. he is already beside the student, so he turns rather than walks.
    handle = yield get("handle")
    try:
        yield actor_face(PRINCIPAL, "thor")
        # the last line of the year is said face to face
        yield actor_face("thor", PRINCIPAL)
    except Exception as refused:
        yield log("actor_face_refused", {"actor": PRINCIPAL, "why": str(refused)})
    yield say(well_done_now(handle, year), who=PRINCIPAL, portrait=FACE)

    # the last press of the year is his: one option draws as one big button and
    # the film waits on it. caught, so a refused button strands nobody.
    yield objective(SAIL_STEP)
    try:
        yield choose([SAIL_HOME], prompt=GO_HOME_PROMPT)
    except Exception as refused:
        yield log("sail_home_refused", {"why": str(refused)})

    # and out. the arrow, the panel and the driven body go first, because
    # `enter` tears this island down and anything left standing stays standing.
    yield guide_to(None)
    yield objective(None)
    yield from let_go()
    yield log("closing_done", {"year": year})
    yield enter("hub", cover="ceremony")


def closing():
    """The ending: one line naming what he did, the wall, the cord, the page.

    He is in front of the student when it opens, then walks the length of the
    hall with the student behind him.
    """
    # ---- he walks, and the walk is the first shot of the ending ------------
    # `lead_to` to the hall gives him the length of the room to cross, so his
    # legs are going. no arrow: `the_hall`'s own pixel is the fire. the camera
    # goes in first and holds a beat, so the walk happens inside a shot.
    yield view("close")
    yield wait(700)

    # the panel says what he is doing, and for this beat that is following
    yield objective(FOLLOW)

    try:
        yield lead_to(PRINCIPAL, HALL, pace="walk")
    except Exception as refused:
        # a man who cannot cross the room still has something to say
        yield log("lead_to_refused", {"anchor": HALL, "why": str(refused)})
        yield from he_steps_in_front()
    yield wait(400)

    handle = yield get("handle")
    picks = yield get("picks")
    yield say(well_done(handle, picks), who=PRINCIPAL, portrait=FACE)

    # the wall's latch carries the year, so this film has to know which one
    year = yield get("year")
    flags = yield get("flags")
    if wall_shown(year) not in flags:
        yield from the_wall(year)

    # ---- and the counselor, the cord, the page, and out --------------------
    yield from closing_beats()


# ---- the two of them, each inside its own frame ------------------------------


def as_a_film(scene):
    """`as_a_cutscene`, and the arrow and the panel come down with the bars too.

    `as_a_cutscene` promises only the bars. This puts the arrow and the top line
    back on every road out, including a refusal.
    """
    try:
        yield from as_a_cutscene(scene)
    finally:
        yield guide_to(None)
        yield objective(None)


def rail(walk=True):
    """The introduction, run inside the bars, which come down whatever happens.

    `as_a_cutscene` is `movie(True)`, the scene, and `movie(False)` in a
    `finally`. Copy that shape for anything a student watches.
    """
    yield from as_a_film(opening(walk))


def ending():
    """The closing film, inside its own frame.

    Its trigger is `year_is_done()`, and both callers are in `island.py`: the
    room opening with the year finished, and the principal being pressed.
    """
    yield from as_a_film(closing())
