"""Bake a depth map for a picture, for /picture/ (engine/picture.js).

Runs Depth Anything V2 Small (Apache-2.0) and writes `<name>.depth.png` next to the image:
8-bit greyscale relative inverse depth, white = near, black = far (sky).

    source ~/.venvs/dl/bin/activate
    python tools/depth.py assets/pictures/venice.jpg

Model: Yang et al., "Depth Anything V2" (2024), https://arxiv.org/abs/2406.09414
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"


def estimate_depth(image: Image.Image, device: str) -> np.ndarray:
    """Return relative inverse depth at the image's own size (larger = nearer).

    Parameters
    ----------
    image : PIL.Image.Image
        RGB input picture.
    device : str
        Torch device ("mps", "cuda" or "cpu").

    Returns
    -------
    np.ndarray
        float32 array of shape (height, width).
    """
    processor = AutoImageProcessor.from_pretrained(MODEL_ID)
    model = AutoModelForDepthEstimation.from_pretrained(MODEL_ID, use_safetensors=True).to(device).eval()
    inputs = processor(images=image, return_tensors="pt").to(device)
    with torch.no_grad():
        predicted = model(**inputs).predicted_depth  # (1, h', w')
    resized = torch.nn.functional.interpolate(
        predicted.unsqueeze(1), size=(image.height, image.width), mode="bicubic", align_corners=False
    )
    return resized.squeeze().float().cpu().numpy()


def to_png(depth: np.ndarray) -> Image.Image:
    """Normalise depth to 0..255 with robust percentiles, so a few outliers don't flatten the range.

    Parameters
    ----------
    depth : np.ndarray
        Relative inverse depth.

    Returns
    -------
    PIL.Image.Image
        8-bit greyscale image, white = near.
    """
    lo, hi = np.percentile(depth, [0.5, 99.5])
    scaled = np.clip((depth - lo) / max(hi - lo, 1e-6), 0.0, 1.0)
    return Image.fromarray((scaled * 255.0 + 0.5).astype(np.uint8), mode="L")


def main(argv: list[str]) -> int:
    """Bake depth maps for every picture path given on the command line."""
    if not argv:
        print(__doc__)
        return 1
    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    for arg in argv:
        src = Path(arg)
        out = src.with_suffix(".depth.png")
        image = Image.open(src).convert("RGB")
        to_png(estimate_depth(image, device)).save(out, optimize=True)
        print(f"{src} -> {out} ({image.width}x{image.height}, {device})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
