#!/usr/bin/env python3
"""Convert CircleSfera .excalidraw scenes to static SVG previews."""

from __future__ import annotations

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PREVIEW = ROOT / "preview"
FONTS = {1: "Virgil, Segoe Script, cursive", 2: "Helvetica, Arial, sans-serif", 3: "Cascadia, Consolas, monospace"}


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def dash(style: str | None) -> str:
    if style == "dashed":
        return 'stroke-dasharray="8 6"'
    if style == "dotted":
        return 'stroke-dasharray="2 6"'
    return ""


def opacity(el: dict) -> float:
    raw = el.get("opacity", 100)
    return raw / 100 if raw > 1 else raw


def bbox(elements: list[dict]) -> tuple[float, float, float, float]:
    min_x = min_y = 1e12
    max_x = max_y = -1e12
    for el in elements:
        if el.get("isDeleted"):
            continue
        x, y = float(el.get("x", 0)), float(el.get("y", 0))
        w, h = float(el.get("width", 0) or 0), float(el.get("height", 0) or 0)
        if el["type"] in {"arrow", "line"}:
            pts = el.get("points") or [[0, 0]]
            xs = [x + p[0] for p in pts]
            ys = [y + p[1] for p in pts]
            min_x, max_x = min(min_x, *xs), max(max_x, *xs)
            min_y, max_y = min(min_y, *ys), max(max_y, *ys)
        else:
            min_x, max_x = min(min_x, x), max(max_x, x + w)
            min_y, max_y = min(min_y, y), max(max_y, y + h)
    pad = 48
    return min_x - pad, min_y - pad, max_x + pad, max_y + pad


def arrowhead(x1: float, y1: float, x2: float, y2: float, color: str, width: float) -> str:
    import math

    angle = math.atan2(y2 - y1, x2 - x1)
    size = 10 + width * 2
    left = (
        x2 - size * math.cos(angle - 0.45),
        y2 - size * math.sin(angle - 0.45),
    )
    right = (
        x2 - size * math.cos(angle + 0.45),
        y2 - size * math.sin(angle + 0.45),
    )
    return (
        f'<polygon points="{x2:.1f},{y2:.1f} {left[0]:.1f},{left[1]:.1f} '
        f'{right[0]:.1f},{right[1]:.1f}" fill="{esc(color)}" />'
    )


def render_element(el: dict) -> str:
    if el.get("isDeleted"):
        return ""
    kind = el["type"]
    x, y = float(el.get("x", 0)), float(el.get("y", 0))
    w, h = float(el.get("width", 0) or 0), float(el.get("height", 0) or 0)
    stroke = el.get("strokeColor") or "#1e1e1e"
    fill = el.get("backgroundColor") or "transparent"
    if fill in {"transparent", ""}:
        fill_attr = "none"
    else:
        fill_attr = esc(fill)
    sw = el.get("strokeWidth") or 1
    op = opacity(el)
    extra = dash(el.get("strokeStyle"))

    if kind == "rectangle":
        rx = 10 if el.get("roundness") else 0
        return (
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
            f'rx="{rx}" fill="{fill_attr}" stroke="{esc(stroke)}" '
            f'stroke-width="{sw}" {extra} opacity="{op:.2f}" />'
        )

    if kind == "ellipse":
        return (
            f'<ellipse cx="{x + w / 2:.1f}" cy="{y + h / 2:.1f}" '
            f'rx="{w / 2:.1f}" ry="{h / 2:.1f}" fill="{fill_attr}" '
            f'stroke="{esc(stroke)}" stroke-width="{sw}" {extra} opacity="{op:.2f}" />'
        )

    if kind in {"arrow", "line"}:
        pts = el.get("points") or [[0, 0], [w, h]]
        abs_pts = [(x + p[0], y + p[1]) for p in pts]
        d = "M " + " L ".join(f"{px:.1f} {py:.1f}" for px, py in abs_pts)
        parts = [
            f'<path d="{d}" fill="none" stroke="{esc(stroke)}" '
            f'stroke-width="{sw}" {extra} opacity="{op:.2f}" '
            f'stroke-linecap="round" stroke-linejoin="round" />'
        ]
        if kind == "arrow" and el.get("endArrowhead") and len(abs_pts) >= 2:
            parts.append(arrowhead(*abs_pts[-2], *abs_pts[-1], stroke, sw))
        return "\n".join(parts)

    if kind == "text":
        text = el.get("text") or ""
        size = float(el.get("fontSize") or 16)
        family = FONTS.get(el.get("fontFamily") or 2, FONTS[2])
        align = el.get("textAlign") or "left"
        if align == "center":
            tx, anchor = x + w / 2, "middle"
        elif align == "right":
            tx, anchor = x + w, "end"
        else:
            tx, anchor = x, "start"
        lines = text.split("\n")
        line_h = size * float(el.get("lineHeight") or 1.25)
        chunks = []
        for i, line in enumerate(lines):
            ty = y + size * 0.85 + i * line_h
            chunks.append(
                f'<text x="{tx:.1f}" y="{ty:.1f}" font-size="{size:.1f}" '
                f'font-family="{family}" fill="{esc(stroke)}" text-anchor="{anchor}" '
                f'opacity="{op:.2f}">{esc(line)}</text>'
            )
        return "\n".join(chunks)

    return ""


def convert(src: Path) -> Path:
    data = json.loads(src.read_text())
    elements = [e for e in data.get("elements", []) if not e.get("isDeleted")]
    min_x, min_y, max_x, max_y = bbox(elements)
    width, height = max(max_x - min_x, 1), max(max_y - min_y, 1)
    bg = (data.get("appState") or {}).get("viewBackgroundColor") or "#F7F7F5"
    body = "\n".join(render_element(el) for el in elements)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{min_x:.1f} {min_y:.1f} '
        f'{width:.1f} {height:.1f}" width="{width:.0f}" height="{height:.0f}">\n'
        f'<rect x="{min_x:.1f}" y="{min_y:.1f}" width="{width:.1f}" height="{height:.1f}" fill="{esc(bg)}" />\n'
        f"{body}\n</svg>\n"
    )
    dest = PREVIEW / f"{src.stem}.svg"
    dest.write_text(svg)
    return dest


def write_index(svgs: list[Path]) -> None:
    items = []
    for svg in svgs:
        items.append(
            f'<button type="button" data-src="preview/{esc(svg.name)}">{esc(svg.stem)}</button>'
        )
    first = svgs[0].name if svgs else ""
    html_doc = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CircleSfera — arquitectura</title>
  <style>
    :root {{ color-scheme: light; font-family: Helvetica, Arial, sans-serif; }}
    body {{ margin: 0; display: grid; grid-template-columns: 280px 1fr; height: 100vh; background: #f3f2ee; }}
    nav {{ overflow: auto; padding: 16px 12px; background: #fff; border-right: 1px solid #ddd; }}
    h1 {{ font-size: 16px; margin: 0 8px 12px; }}
    p {{ font-size: 12px; color: #666; margin: 0 8px 16px; }}
    button {{ display: block; width: 100%; text-align: left; margin: 0 0 4px; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; cursor: pointer; }}
    button:hover, button.active {{ background: #e8eaf6; }}
    main {{ overflow: auto; padding: 16px; }}
    img {{ width: 100%; height: auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 8px #0001; }}
  </style>
</head>
<body>
  <nav>
    <h1>CircleSfera arquitectura</h1>
    <p>Previews SVG. Los .excalidraw se editan en excalidraw.com o con la extensión Excalidraw.</p>
    {"".join(items)}
  </nav>
  <main>
    <img id="stage" src="preview/{esc(first)}" alt="Diagrama" />
  </main>
  <script>
    const stage = document.getElementById("stage");
    document.querySelectorAll("nav button").forEach((btn, i) => {{
      if (i === 0) btn.classList.add("active");
      btn.addEventListener("click", () => {{
        document.querySelectorAll("nav button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        stage.src = btn.dataset.src;
      }});
    }});
  </script>
</body>
</html>
"""
    (ROOT / "index.html").write_text(html_doc)


def main() -> None:
    PREVIEW.mkdir(exist_ok=True)
    sources = sorted(ROOT.glob("*.excalidraw"))
    svgs = [convert(src) for src in sources]
    write_index(svgs)
    print(f"wrote {len(svgs)} svgs + index.html")


if __name__ == "__main__":
    main()
