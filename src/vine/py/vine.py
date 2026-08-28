"""What a member's island imports.

Every function in here builds a dict and does nothing else. Putting `yield` in
front of one is what makes it happen, because the thing that performs it is the
engine, on the other side of the worker.

One rule, and it is the whole rule: yield anything that takes time.

The names and the spelling come from src/vine/intents.ts. `say` builds
{"kind": "say"} because that is the kind the engine already performs, and
nothing between here and there translates anything.
"""


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
