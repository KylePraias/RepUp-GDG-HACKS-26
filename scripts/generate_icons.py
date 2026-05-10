"""Generate 16/48/128 PNG icons for the RepUp Chrome extension.

Simple, on-brand: black square with a lime "R" and a small orange dot.
Run:  python3 scripts/generate_icons.py
Outputs: extension/icons/icon16.png, icon48.png, icon128.png
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


OUT = Path(__file__).resolve().parent.parent / "extension" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (9, 9, 11)        # #09090B
LIME = (204, 255, 0)   # #CCFF00
ORANGE = (255, 92, 0)  # #FF5C00


def find_bold_font(size: int):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVu-Sans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for c in candidates:
        if Path(c).exists():
            return ImageFont.truetype(c, size=size)
    return ImageFont.load_default()


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG + (255,))
    draw = ImageDraw.Draw(img)

    # Rounded background tile
    radius = max(4, size // 6)
    draw.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=radius,
        fill=BG + (255,),
        outline=(40, 40, 45, 255),
        width=max(1, size // 64),
    )

    # Big "R" centred
    font = find_bold_font(int(size * 0.74))
    text = "R"
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        x = (size - tw) // 2 - bbox[0]
        y = (size - th) // 2 - bbox[1] - int(size * 0.04)
    except AttributeError:
        tw, th = draw.textsize(text, font=font)
        x = (size - tw) // 2
        y = (size - th) // 2

    draw.text((x, y), text, fill=LIME + (255,), font=font)

    # Orange dot bottom-right
    dot = max(2, int(size * 0.15))
    margin = max(2, int(size * 0.10))
    draw.ellipse(
        [
            (size - dot - margin, size - dot - margin),
            (size - margin, size - margin),
        ],
        fill=ORANGE + (255,),
    )

    return img


for s in (16, 48, 128):
    out = OUT / f"icon{s}.png"
    draw_icon(s).save(out, "PNG")
    print(f"wrote {out}")
