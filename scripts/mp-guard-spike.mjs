/* WHICH THINGS MICROPYTHON CALLS A GENERATOR FUNCTION, measured.
 *
 * driver.py has to decide, BEFORE calling a member's handler, whether it forgot
 * its `yield`. Getting that wrong in either direction is expensive: convict a
 * working handler and a member is told to add a yield that is already there;
 * acquit a plain function and its whole body runs before anybody notices.
 *
 * CPython's answer is inspect.isgeneratorfunction and it is wrong here, because
 * this build reports False for a bound method and for a closure, and a closure
 * is what every decorator returns.
 *
 * Run: node scripts/mp-guard-spike.mjs
 */
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript/micropython.mjs'

const mp = await loadMicroPython()

mp.runPython(`
import inspect

def plain():
    return 5

def geny():
    yield 1

def logged(fn):
    def wrapper():
        return fn()
    return wrapper

@logged
def decorated():
    yield 1

def factory(n):
    def inner():
        yield n
    return inner
closure_gen = factory(3)

def forgot_factory(n):
    def inner():
        return n
    return inner
closure_plain = forgot_factory(3)

class C:
    def m(self):
        yield 1
    def p(self):
        return 1
c = C()

class Callable:
    def __call__(self):
        yield 1
callable_gen = Callable()

CASES = (
    ("plain, forgot yield", plain, False),
    ("module generator", geny, True),
    ("decorated closure gen", decorated, True),
    ("factory closure gen", closure_gen, True),
    ("closure, forgot yield", closure_plain, False),
    ("bound method gen", c.m, True),
    ("bound method, forgot", c.p, False),
    ("callable object gen", callable_gen, True),
    ("lambda, forgot yield", lambda: 1, False),
)

rows = []
for label, fn, is_gen in CASES:
    tname = type(fn).__name__
    old = (not inspect.isgeneratorfunction(fn)) and tname not in ("bound_method",)
    new = tname == "function"
    # a guard is WRONG when it convicts something that really is a generator
    wrong_old = old and is_gen
    wrong_new = new and is_gen
    rows.append("%-24s type=%-12s really_gen=%-5s  OLD_convicts=%-5s%s  NEW_convicts=%-5s%s"
                % (label, tname, is_gen, old, "  <-- WRONG" if wrong_old else "",
                   new, "  <-- WRONG" if wrong_new else ""))

# and the second gate: what the CALL returns, for everything the guard lets past
after = []
for label, fn, is_gen in CASES:
    if type(fn).__name__ == "function":
        continue
    got = type(fn()).__name__
    after.append("%-24s call() -> %s" % (label, got))

out = "\\n".join(rows) + "\\n\\nwhat the second check sees for everything the new guard lets past:\\n" + "\\n".join(after)
`)

console.log(mp.globals.get('out'))
