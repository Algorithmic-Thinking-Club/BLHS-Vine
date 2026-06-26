"""WARM palette-grade for the gold-standard hero tiles. The plain palette_grade.py snaps each
pixel ~62% toward the nearest ramp colour, which flattens directional light into a uniform muted
slab. The gold standard depends on KEEPING the warm top-left light and the soft ambient-occlusion
gradient. So this grader:
  1. pulls the *hue/chroma* of each pixel toward the nearest palette ramp colour (kills cartoon
     saturation, enforces the muted BLHS family),
  2. but preserves each pixel's own *relative luminance* (so the AO shadow side and the lit side
     survive — the light isn't graded away),
  3. adds a subtle warm bias to the lit pixels (golden-hour feel) and a cool/dark bias to shadows.

Usage: python scripts/palette_grade_warm.py <in.png> <material> <out.png> [chroma_blend] [warm]
Defaults chroma_blend=0.70, warm=0.06. Operates on RGBA, leaves alpha untouched.
"""
import sys
import numpy as np
from PIL import Image

# reuse the same material ramps as palette_grade.py (base, shadow/face, highlight, accents)
RAMPS = {
    # grass ramp weighted toward muted PNW green (dropped the dry-grass/bark entries that were
    # pulling mids to olive/tan); a single dry tone kept for sun-bleached pixels only
    "grass":    [0x45563e, 0x364532, 0x59624e, 0x2c3a28, 0x3f4f38, 0x6a7158],
    "turf":     [0x3f5236, 0x364532, 0x4a6040, 0x55714a, 0x2c3f26],
    "forest":   [0x233124, 0x2c3f26, 0x364532, 0x1c2a1e, 0x45563e, 0x6b4a32],
    "concrete": [0xc8c6bf, 0xa8a69e, 0xd8d6cd, 0x8f8d85, 0xb6b3aa],
    "asphalt":  [0x3a3b3f, 0x4d4a47, 0x55565a, 0x2c2d31, 0x6a6a6e],
    "dirt":     [0x8a6b4a, 0x5e3d31, 0x9c7a56, 0x705236, 0xa98a64],
    "brick":    [0x9e745e, 0x5e3d31, 0xb38a73, 0xb0a99a, 0x7a5446],
    # concrete+grass blends keep both families so an edge tile grades cleanly
    "edge_gc":  [0xc8c6bf, 0xa8a69e, 0xd8d6cd, 0x45563e, 0x364532, 0x59624e],
    "edge_gb":  [0x9e745e, 0x5e3d31, 0xb38a73, 0x45563e, 0x364532, 0x59624e],
    # building-facade families (courtyard facade hint)
    "greige":   [0xb6b3aa, 0xa8a69e, 0xc8c6bf, 0x97958d, 0x86847c, 0xd8d6cd],
    "white":    [0xe8e6df, 0xd8d6cd, 0xf2f0ea, 0xc8c6bf, 0xb6b3aa],
    "black":    [0x2a2c2e, 0x1c1e20, 0x3a3d40, 0x141517, 0x4a4e52],
}

WARM = np.array([14.0, 6.0, -10.0])   # push lit pixels toward warm (R+,G+,B-)
COOL = np.array([-6.0, -2.0, 8.0])    # push shadow pixels slightly cool/blue


def hexrgb(h):
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], dtype=np.float32)


def luma(rgb):
    return (rgb * np.array([0.299, 0.587, 0.114])).sum(-1, keepdims=True)


def grade(path, material, out, chroma_blend=0.70, warm=0.06):
    ramp = np.array([hexrgb(h) for h in RAMPS[material]], dtype=np.float32)
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im, dtype=np.float32)
    rgb, alpha = a[..., :3], a[..., 3:]
    H, W, _ = rgb.shape
    L = luma(rgb)

    # nearest ramp colour per pixel
    flat = rgb.reshape(-1, 3)
    d = ((flat[:, None, :] - ramp[None, :, :]) ** 2).sum(-1)
    nearest = ramp[d.argmin(1)].reshape(H, W, 3)

    # graded target = nearest ramp colour, but RE-LIT to this pixel's own luminance so directional
    # light survives. (scale the ramp colour to match L, clamp.)
    nL = luma(nearest)
    relit = nearest * (L / np.clip(nL, 1.0, None))
    target = np.clip(relit, 0, 255)

    # blend original toward the re-lit palette target (chroma correction, luma preserved)
    graded = rgb * (1 - chroma_blend) + target * chroma_blend

    # golden-hour bias: warm the bright pixels, slightly cool the dark ones. weight by luma.
    t = np.clip((L - 90.0) / 120.0, -1.0, 1.0)  # -1 dark .. +1 bright
    bias = np.where(t > 0, WARM * t, COOL * (-t))
    graded = graded + bias * warm * 12.0

    res = np.concatenate([np.clip(graded, 0, 255), alpha], -1).astype(np.uint8)
    Image.fromarray(res, "RGBA").save(out)
    print(f"warm-graded {material:9s} {path.split(chr(92))[-1].split('/')[-1]} -> {out.split('/')[-1]}")


if __name__ == "__main__":
    cb = float(sys.argv[4]) if len(sys.argv) > 4 else 0.70
    wm = float(sys.argv[5]) if len(sys.argv) > 5 else 0.06
    grade(sys.argv[1], sys.argv[2], sys.argv[3], cb, wm)
