"""GATE validator: take a page->feet affine (a,b,c,d,e,f), transform ALL extracted survey geometry to
feet, then draw it on the aerial via a north-up aerial<->feet map calibrated on football+building, so
we can SEE whether the survey locks onto the aerial. Prints residuals of the two control points."""
import pickle, sys, math
import numpy as np
from PIL import Image, ImageDraw

a, b, c, d, e, f = [float(x) for x in sys.argv[1:7]]
def page_to_feet(x, y):
    return (a*x + c*y + e, b*x + d*y + f)

# aerial<->feet north-up calibration from football & building (feet known, aerial px measured)
# football feet(-582.4,108.3) px(614.7,470.2); building feet(-15.9,-8.3) px(853,516)
fX, fY, fpx, fpy = -582.4, 108.3, 614.7, 470.2
bX, bY, bpx, bpy = -15.9, -8.3, 853.0, 516.0
sx = (bpx - fpx) / (bX - fX)
sy = (bpy - fpy) / -(bY - fY)
s = (sx + sy) / 2
ox = fpx - s*fX; oy = fpy + s*fY
def feet_to_aer(X, Y): return (ox + s*X, oy - s*Y)

L = pickle.load(open('reference/floorplans-maps/_civil/C400feat.pkl', 'rb'))
aer = Image.open('reference/floorplans-maps/aerial-esri.png').convert('RGB')
im = aer.copy(); dr = ImageDraw.Draw(im, 'RGBA')
plans = {
    'rgb(70.195007%, 70.195007%, 70.195007%)': (255, 255, 0, 55),
    'rgb(0%, 0%, 0%)': (255, 40, 40, 200),
    'rgb(10.195923%, 10.195923%, 10.195923%)': (0, 220, 255, 220),
}
for col, color in plans.items():
    if col not in L: continue
    for pts in L[col]:
        if len(pts) >= 2:
            ft = [page_to_feet(x, y) for x, y in pts]
            dr.line([feet_to_aer(X, Y) for X, Y in ft], fill=color, width=1)
# control markers
for (px, py), col, lab in [((555.4, 874.7), (0, 255, 0), 'FB'), ((906, 813), (255, 0, 255), 'BL')]:
    X, Y = page_to_feet(px, py); ax, ay = feet_to_aer(X, Y)
    dr.line([(ax-10, ay), (ax+10, ay)], fill=col+(255,), width=2)
    dr.line([(ax, ay-10), (ax, ay+10)], fill=col+(255,), width=2)
im.save('reference/floorplans-maps/_civil/validate-feet.png')
print('aerial<->feet: s=%.4f px/ft (sx=%.4f sy=%.4f) ox=%.1f oy=%.1f' % (s, sx, sy, ox, oy))
print('FB page->feet', np.round(page_to_feet(555.4, 874.7), 1), 'expect (-582.4,108.3)')
print('BL page->feet', np.round(page_to_feet(906, 813), 1), 'expect (-15.9,-8.3)')
print('saved validate-feet.png')
