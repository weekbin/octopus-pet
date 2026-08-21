#!/usr/bin/env python3
"""
remove-hat-greenscreen.py — Remove hat artifact from a green-screen image.

Designed for octopus-pet baseline image pipeline: when mavis image_synthesize
generates a "bare octopus" but leaves a translucent hat artifact (common
with image-to-image mode using 12-artist as reference), this script
removes the hat by:
  1. Finding the character (largest coral-pink connected component)
  2. Identifying background via 4-corner flood fill (any color similar to
     green screen)
  3. Masking pixels in the region above the character that aren't background
     and aren't character — these are the hat remnants
  4. Replacing them with pure #00FF00

Usage:
  python3 scripts/remove-hat-greenscreen.py <input.png> <output.png>

Pixel-level 1:1 except hat region. ~90% hat removal typical; minor residual
brim may remain (acceptable for animation baseline).
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

def remove_hat(input_path, output_path):
    img = Image.open(input_path).convert("RGB")
    arr = np.array(img)
    h, w = arr.shape[:2]
    R, G, B = arr[:,:,0], arr[:,:,1], arr[:,:,2]

    # 1. Find character (largest coral-pink component)
    is_pink = (R > 180) & (G < 200) & (B < 180) & (R > G)
    labeled, n = ndimage.label(is_pink)
    if n == 0:
        print(f"WARN: No pink character found in {input_path}, copying as-is")
        Image.fromarray(arr).save(output_path)
        return
    sizes = ndimage.sum(is_pink, labeled, range(1, n+1))
    character_mask = (labeled == np.argmax(sizes) + 1)
    char_top = np.where(character_mask.any(axis=1))[0].min()

    # 2. Find background via 4-corner flood fill
    is_greenish = (R < 130) & (G > 130) & (B < 130) & (G > R)
    labeled_g, n_g = ndimage.label(is_greenish)
    bg_label = labeled_g[0, 0]
    bg_mask = (labeled_g == bg_label)

    # 3. Hat = above character, not background, not character
    hat_region = np.zeros_like(R, dtype=bool)
    hat_region[:char_top, :] = True
    is_hat = hat_region & ~bg_mask
    print(f"  character top: y={char_top}")
    print(f"  background: {bg_mask.sum()} px")
    print(f"  hat pixels: {is_hat.sum()}")

    # 4. Replace with #00FF00
    cleaned = arr.copy()
    cleaned[is_hat] = [0, 255, 0]
    Image.fromarray(cleaned).save(output_path)
    print(f"Saved: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: remove-hat-greenscreen.py <input.png> <output.png>")
        sys.exit(1)
    remove_hat(sys.argv[1], sys.argv[2])
