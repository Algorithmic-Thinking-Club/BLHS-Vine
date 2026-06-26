"""Pixelate a Blender iso render into a clean pixel-art sprite.
Crop -> downscale (area) -> palette quantize -> save. Upscaled preview for review."""
import sys
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else 'reference/floorplans-maps/rendered/pac-3d-raw.png'
out = sys.argv[2] if len(sys.argv) > 2 else 'public/art/iso/landmarks/pac-3d.png'
TW = int(sys.argv[3]) if len(sys.argv) > 3 else 300

im = Image.open(src).convert('RGBA')
im = im.crop(im.getbbox())
th = max(1, round(im.height * TW / im.width))
small = im.resize((TW, th), Image.BILINEAR)
# quantize RGB to a tight palette, preserve alpha (hard cut)
rgb = small.convert('RGB').quantize(colors=24, method=Image.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).convert('RGB')
a = small.split()[3].point(lambda v: 255 if v > 110 else 0)
res = Image.merge('RGBA', (*rgb.split(), a))
res.save(out)
res.resize((TW * 3, th * 3), Image.NEAREST).save('reference/floorplans-maps/rendered/pac-3d-px.png')
print('pixelated', res.size, '->', out)
