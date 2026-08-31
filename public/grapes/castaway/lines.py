"""Everything anybody says, kept out of island.py.

A member changing a line should not have to read the code that plays it, and a
person reading the code should be able to see the shape of the scene without
wading through prose. This is the split every island in the members' repo starts
from.
"""

# who is speaking. Empty means it is his own head, which the box draws without a
# name plate, and that is right for a man alone on a beach.
THOR = None

WAKING = [
    "Ugh. Sand. A whole lot of sand.",
    "Last thing I remember is water. So much water.",
]

LOOKING = "...Where is this?"

# the moment the sea puts something on the sand in front of him
SPOTTED = "Something washed ashore."

# what is actually in the bottle. Three lines, because the box is a box and a
# paragraph in it is a wall.
MESSAGE = [
    "The paper is dry, which means somebody corked it properly.",
    "“If you are reading this, you are further from home than you meant to be.",
    "Take the boat. Make for the light on the central island, and ask for the Maw.”",
]

# after the message, before he moves
DECIDED = "A boat with my name on it. Might as well see her."

# the arrow has been up for a while and he has not moved
NUDGED = "It is not going to open itself."

CAST_OFF = "Right. The light on the central island."
