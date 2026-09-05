"""A second file, so the fixture proves a package and not a file.

An island is a folder, and the engine fetches every module the manifest lists
and writes them into the runtime side by side. That is what makes the plain
`from lines import ...` below work, and it is why a traceback in here names
lines.py rather than <stdin>.
"""

WHO = "the vine"

OPENING = "This is Python, and it is running in a worker while the engine draws."

BRANCHES = [
    "You picked the first button, so you got this line.",
    "You picked the second button, so you got this one instead.",
]
