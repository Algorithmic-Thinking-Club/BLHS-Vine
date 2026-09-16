"""Everything anybody says in the Maw, in one place.

A speaker is an anchor name, and the dialogue box prints the label whoever
placed that anchor typed in MAPVIS, not the string here. THOR is the reserved
name for the player, so the box prints the name the student chose.

Keep a line to one idea, about twelve words, and one line per beat.
"""

# ---- who is speaking ---------------------------------------------------------

THOR = "thor"
HEARTH = "hearth"
COUNSELOR = "counselor"
PRINCIPAL = "principal_desk"
WALL = "trophy_wall"
OUTFITTER = "outfitter"
TABLE = THOR

# the only drawn portrait. pass it as `portrait=FACE` on a say. a line with no
# portrait shows a plate with no face, which is most lines in this game.
FACE = "principal"


# ---- the principal, and the five lines of the rail ---------------------------
#
# the principal walks ahead and stops at five places. at each stop he says one
# sentence saying why the stop is happening, never what to press.

# BEAT 1, at the tunnel mouth, after he has walked over to you.
WELCOME = "Welcome to Bonney Lake High. Come with me."

# BEAT 2, at the table, before the schedule opens.
SCHEDULE_IS_YOURS = "Your schedule. Every Panther fills one in."
# said when he closes the schedule without stamping, so the rail can offer it again.
STAMP_IT = "Fill both Elective periods, pick one club or sport, then stamp it."

# BEAT 3, at the fire, before Advisory.
ADVISORY_IS_MONDAY = "This is Advisory. Every Monday starts here."
# and when he left the questions unfinished. Recovery, like STAMP_IT.
COME_BACK = "Come back to the fire when you have a minute."

# BEAT 4, at the wall, before it opens.
WALL_IS_YOURS = "What you earn goes up here."

# every visit after the rail is over, at the desk
BACK_AGAIN = "Everything you need is on the walls. Take a look around."


# ---- the objective panel at the top of the screen ----------------------------
#
# one short imperative each, a verb and its target. nobody says these out loud;
# they name the step the student is on.
FOLLOW = "Follow the principal."
FILL_IT_IN = "Fill your schedule."
ANSWER = "Answer Advisory."
LOOK_AT_WALL = "Look at your trophy wall."
TALK_TO_HER = "Talk to the counselor."
# the last step of the introduction, over the wide shot of the room
LOOK_AROUND = "Look around the Maw."
# the last step of the year, over the button the closing film ends on
SAIL_STEP = "Sail home."


# ---- the end of the introduction, one line over a wide shot ------------------
#
# it hands the room over and says where the year ends.
THE_MAW_IS_YOURS = "The Maw is yours. Find me when your year is done."


# ---- the fire ----------------------------------------------------------------

CIRCLE = "Advisory is starting. Answer the questions."
BANKED = "Advisory is done for this year. Come back next year."
# `play` comes back None when they closed the panel, and None is not a score
LEFT = "You did not finish Advisory. Come back when you have a minute."


# ---- the counselor -----------------------------------------------------------

NOTHING_YET = "No cord started yet. That is what four years are for."
ASK = "Ask about the cords?"
SHOW_ME = "Open the Guide"
NOT_NOW = "Not now"

# ---- the closing film, where she hands over the cord -------------------------
#
# ask for the year word, never write "year one" into a line.
YEAR_WORDS = ("zero", "one", "two", "three", "four")


def year_word(n):
    """"two", for a sentence. The engine spells it the same way."""
    return YEAR_WORDS[n] if 0 <= n < len(YEAR_WORDS) else str(n)


CORD = "Year %s is done. Here is your %s cord."
# and which cord it is, which is a different fact from which year it is
CORD_ORDINAL = ("", "first", "second", "third", "fourth")


# ---- the chart table ---------------------------------------------------------

SHEET = "This is My Year. Plan all four years here."


# ---- the outfitter -----------------------------------------------------------

NOOK = "Pick a new coat color. Nothing here costs anything."


# ---- the trophy wall ---------------------------------------------------------

# no number in either line. the wall panel does the counting; these introduce it.
EMPTY_WALL = "This is my trophy wall. What I earn this year goes up here."
FULL_WALL = "This is my trophy wall. Let's see what is on it."


# ---- the principal's congratulation, built from the save ---------------------
#
# `well_done` in founding.py fills one of these three with the student's own
# name and picks.
WELL_DONE = "%s, you picked %s."
WELL_DONE_GRADED = "%s, you picked %s, and Advisory came back %s."
WELL_DONE_BARE = "%s, that is your first year at Bonney Lake."

# what he is called when the student never typed a name
SOMEBODY = "Panther"

# ---- the end of the year -----------------------------------------------------
#
# said after the yearbook page turns.
YEAR_DONE = (
    "%s. That is year %s at Bonney Lake, finished. The cord is yours and it stays yours."
)
YEAR_DONE_BARE = "That is year %s at Bonney Lake, finished. The cord is yours and it stays yours."

# and the one thing left to do, which is the last press of the year
SAIL_HOME = "Sail Home"
GO_HOME_PROMPT = "Your boat is at the dock."
