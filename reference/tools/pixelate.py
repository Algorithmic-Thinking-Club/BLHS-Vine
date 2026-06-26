from PIL import Image
import sys

# Turn a diffusion render into clean 16-bit: shrink to a small pixel grid, snap to a limited
# palette, then scale back up with nearest-neighbor so the pixels stay crisp.
src, dst, px, ncol, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
im = Image.open(src).convert('RGB')
small = im.resize((px, px), Image.LANCZOS)
quant = small.quantize(colors=ncol, method=Image.MEDIANCUT).convert('RGB')
big = quant.resize((out, out), Image.NEAREST)
big.save(dst)
print('pixelated', src, '->', dst, px, 'px', ncol, 'colors')
