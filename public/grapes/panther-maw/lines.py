"""Everything anybody says in the Maw, in one place.

An island is a folder and this is the first reason why. What the room SAYS is
content, and WHEN it says it is control flow, and the day somebody wants to
change one without reading the other they will be glad these were apart.

The names below are also the answer to a question you will hit in your own
island: who is talking. A speaker is an ANCHOR NAME, and the box prints the
label whoever placed that anchor typed in MAPVIS, never this string. So the
counselor's plate reads "The Counselor" because that is the label on her post,
and renaming that label cannot break a line of this file.

Two names are not anchors. THOR is the reserved word for the player, and the box
puts the name the student chose at setup on the plate. TABLE is THOR on purpose:
the chart table is furniture, furniture does not talk, and the anchor carries no
label anyway, so naming it as the speaker would print the raw identifier
`chart_table` at the exact spot a person's name goes.

HOW LONG A LINE MAY BE. One idea, about twelve words, and never more than three
in a row before the player does something. That rule is not a style preference,
it is the non-reader law: a student who skips every line in this room must still
end up understanding where the chart table is, because the arrow taught them and
the text only confirmed it.
"""

# ---- who is speaking ---------------------------------------------------------

THOR = "thor"
HEARTH = "hearth"
COUNSELOR = "counselor"
PRINCIPAL = "principal_desk"
WALL = "trophy_wall"
OUTFITTER = "outfitter"
TABLE = THOR

# the one drawn face in the game so far. It is the `principal-pro` character
# MAPVIS drew for this very room, cropped, and Ash locked it: do not draw
# another one. A line with no portrait shows a plate with no face, which is what
# nearly every line in this game is.
FACE = "principal"


# ---- walking in --------------------------------------------------------------
#
# Said once, the first time a run ever comes through the tunnel. Every arrival
# after that is silent, and that silence is deliberate: this is the room a
# student crosses forty times in an hour, and a room that greets you on the
# fortieth crossing is a room you learn to walk past.

ARRIVED = [
    "The bridge ends and the hall opens up.",
    "Someone has been keeping this swept.",
]


# ---- the founding event ------------------------------------------------------

GREETING = "You made it up the bridge. Most of them stop halfway."

# the room pointed out, one station per line, one idea per line. Three, because
# three is the most the non-reader law allows in a row, and because the chart
# table is introduced by the cutscene below and does not want saying twice.
TOUR = [
    (HEARTH, "That fire is advisory. Every year here starts at it."),
    (COUNSELOR, "She keeps the cord list. Ask her what you are near."),
    (WALL, "That wall is yours to fill. It starts empty."),
]

TURNING_BACK = "The rest of it you will find on your own."


# ---- the fire ----------------------------------------------------------------

CIRCLE = "The circle is drawn. Advisory is starting."
BANKED = "The fire is banked. Nothing is owed here this year."
# said after the beat, and only when the player actually finished it. `play`
# comes back None when they closed the panel, and None is not a score.
SAT = "That is this year's advisory settled."
LEFT = "The circle is still drawn. Come back when you have a minute."


# ---- the counselor -----------------------------------------------------------

NOTHING_YET = "Nothing on your cape yet. That is what four years are for."
ASK = "Ask about the cords?"
SHOW_ME = "Show me the board"
NOT_NOW = "Not now"


# ---- the chart table ---------------------------------------------------------

SHEET = "Four years, one sheet. Less room than it sounds like."


# ---- the outfitter -----------------------------------------------------------

NOOK = "Nothing here is bought. Try a dye on."


# ---- the trophy wall ---------------------------------------------------------

EMPTY_WALL = "Empty hooks, all the way along. Someone expects this to fill."
