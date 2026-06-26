"""Palette-grade a PixelLab tile onto the real BLHS palette.ts ramp for its material. This is the
post-process the proof tiles were missing: it pulls every pixel toward the material's palette colors
(muted PNW cohesion, one ramp) while keeping the micro-texture (blend, not hard snap) and a slight
desaturation. Usage: python palette_grade.py <in.png> <material> <out.png>"""
import sys
import numpy as np
from PIL import Image

# per-material ramps sampled from src/vine/palette.ts (base, shadow/face, highlight, accents)
RAMPS = {
    'grass':    [0x45563e, 0x364532, 0x59624e, 0x707760, 0x2c3a28, 0x8a6b4a],
    'turf':     [0x3f5236, 0x364532, 0x4a6040, 0x55714a, 0x2c3f26],
    'forest':   [0x233124, 0x2c3f26, 0x364532, 0x1c2a1e, 0x45563e],
    'concrete': [0xc8c6bf, 0xa8a69e, 0xd8d6cd, 0x8f8d85, 0xb6b3aa],
    'asphalt':  [0x3a3b3f, 0x4d4a47, 0x55565a, 0x2c2d31, 0x6a6a6e],
    'dirt':     [0x8a6b4a, 0x5e3d31, 0x9c7a56, 0x705236, 0xa98a64],
    'court':    [0x47707f, 0x2f5160, 0x6f9eae, 0x3a5a50, 0xe0dccf],
    'brick':    [0x9e745e, 0x5e3d31, 0xb38a73, 0xb0a99a, 0x7a5446],
    'track':    [0x9e5a47, 0x5e3d31, 0xb06a55, 0x804636, 0xe0dccf],
}

def hexrgb(h):
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], dtype=np.float32)

def grade(path, material, out, blend=0.62, desat=0.12):
    ramp = np.array([hexrgb(h) for h in RAMPS[material]], dtype=np.float32)  # (k,3)
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im, dtype=np.float32)
    rgb = a[..., :3]; alpha = a[..., 3:]
    H, W, _ = rgb.shape
    # slight desaturation toward luma (mute the over-saturated PixelLab output)
    luma = (rgb * np.array([0.299, 0.587, 0.114])).sum(-1, keepdims=True)
    rgb = rgb * (1 - desat) + luma * desat
    # nearest ramp colour per pixel, then blend toward it (keeps texture, enforces palette)
    flat = rgb.reshape(-1, 3)
    d = ((flat[:, None, :] - ramp[None, :, :]) ** 2).sum(-1)   # (N,k)
    nearest = ramp[d.argmin(1)]                                 # (N,3)
    graded = flat * (1 - blend) + nearest * blend
    out_rgb = graded.reshape(H, W, 3)
    res = np.concatenate([np.clip(out_rgb, 0, 255), alpha], -1).astype(np.uint8)
    Image.fromarray(res, 'RGBA').save(out)
    print(f'graded {material:9s} {path.split("/")[-1]} -> {out.split("/")[-1]}')

if __name__ == '__main__':
    grade(sys.argv[1], sys.argv[2], sys.argv[3])
