from __future__ import annotations

import json
from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
W = 1440
H = 960

COLORS = {
    "page": "#F7F8FA",
    "sidebar": "#17171F",
    "sidebar_panel": "#222635",
    "card": "#FFFFFF",
    "border": "#E2E8F0",
    "muted": "#64748B",
    "text": "#111827",
    "soft": "#F8FAFC",
    "blue": "#2563EB",
    "blue_soft": "#E8F1FF",
    "teal": "#0F766E",
    "teal_soft": "#D1FAE5",
    "amber": "#D97706",
    "amber_soft": "#FEF3C7",
    "red": "#DC2626",
    "red_soft": "#FEE2E2",
    "purple": "#7C3AED",
    "purple_soft": "#EDE9FE",
}


def font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    candidates = {
        "regular": ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"],
        "semibold": ["C:/Windows/Fonts/seguisb.ttf", "C:/Windows/Fonts/arialbd.ttf"],
        "bold": ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"],
    }[weight]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


F = {
    "xs": font(11),
    "sm": font(13),
    "body": font(15),
    "body_sb": font(15, "semibold"),
    "h3": font(18, "semibold"),
    "h2": font(24, "bold"),
    "h1": font(30, "bold"),
    "xl": font(34, "bold"),
}


def img() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (W, H), COLORS["page"])
    return image, ImageDraw.Draw(image)


def rr(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], fill: str, outline: str | None = None, radius: int = 8, width: int = 1) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], value: str, fill: str = COLORS["text"], face: ImageFont.ImageFont = F["body"]) -> None:
    draw.text(xy, value, fill=fill, font=face)


def wrapped(draw: ImageDraw.ImageDraw, xy: tuple[int, int], value: str, width: int, fill: str = COLORS["muted"], face: ImageFont.ImageFont = F["sm"], line_gap: int = 5) -> int:
    x, y = xy
    avg = max(5, int(face.size * 0.54))
    lines: list[str] = []
    for para in value.split("\n"):
        lines.extend(wrap(para, max(1, width // avg)) or [""])
    for line in lines:
        draw.text((x, y), line, fill=fill, font=face)
        y += face.size + line_gap
    return y


def pill(draw: ImageDraw.ImageDraw, xy: tuple[int, int], label: str, fill: str, fg: str, w: int | None = None) -> None:
    x, y = xy
    bbox = draw.textbbox((0, 0), label, font=F["xs"])
    width = w or bbox[2] + 24
    rr(draw, (x, y, x + width, y + 26), fill, radius=13)
    draw.text((x + 12, y + 7), label, fill=fg, font=F["xs"])


def button(draw: ImageDraw.ImageDraw, xy: tuple[int, int], label: str, primary: bool = False, w: int = 128) -> None:
    x, y = xy
    fill = COLORS["blue"] if primary else COLORS["soft"]
    fg = "#FFFFFF" if primary else "#334155"
    outline = "#1D4ED8" if primary else COLORS["border"]
    rr(draw, (x, y, x + w, y + 38), fill, outline, radius=7)
    bbox = draw.textbbox((0, 0), label, font=F["sm"])
    draw.text((x + (w - bbox[2]) // 2, y + 11), label, fill=fg, font=F["sm"])


def card(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], title: str | None = None) -> None:
    rr(draw, xy, COLORS["card"], COLORS["border"], radius=8)
    if title:
        text(draw, (xy[0] + 24, xy[1] + 24), title, face=F["h3"])


def shell(draw: ImageDraw.ImageDraw, active: str, title: str, crumb: str) -> None:
    draw.rectangle((0, 0, 244, H), fill=COLORS["sidebar"])
    rr(draw, (22, 24, 54, 56), "#2DD4BF", radius=8)
    text(draw, (66, 25), "Stream Jams", "#FFFFFF", F["h3"])
    text(draw, (66, 49), "Local overlay control", "#9CA3AF", F["xs"])
    items = [("Home", 106, False), ("Event sources", 156, False), ("TTS providers", 204, False), ("Modules", 252, False), ("Alerts", 300, True), ("Assets", 348, False), ("Diagnostics", 396, False), ("Settings", 444, False)]
    for label, y, indent in items:
        is_active = label == active
        if is_active:
            rr(draw, (18, y - 8, 222, y + 32), COLORS["blue_soft"], radius=8)
        ix = 38 if indent else 20
        tx = 56 if indent else 38
        rr(draw, (ix, y + 2, ix + 10, y + 12), COLORS["blue"] if is_active else "#6B7280", radius=3)
        text(draw, (tx, y - 1), label, "#0F3F8C" if is_active else "#C7CAD1", F["sm"])
    rr(draw, (20, 868, 224, 922), COLORS["sidebar_panel"], "#3B4052", radius=8)
    text(draw, (38, 882), "Open operator console", "#F8FAFC", F["sm"])
    text(draw, (38, 902), "Second-monitor view", "#AEB4C1", F["xs"])
    draw.rectangle((244, 0, W, 72), fill="#FFFFFF", outline="#E5E7EB")
    text(draw, (276, 18), crumb, COLORS["muted"], F["xs"])
    text(draw, (276, 37), title, COLORS["text"], F["h2"])
    pill(draw, (1000, 22), "Local service running", COLORS["teal_soft"], "#065F46")
    pill(draw, (1174, 22), "System theme", COLORS["purple_soft"], "#3730A3")
    button(draw, (1278, 18), "Help", w=72)


def progress(draw: ImageDraw.ImageDraw, xy: tuple[int, int], done: int, total: int, width: int = 560) -> None:
    x, y = xy
    rr(draw, (x, y, x + width, y + 8), "#E5E7EB", radius=4)
    rr(draw, (x, y, x + int(width * done / total), y + 8), COLORS["blue"], radius=4)


def row(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], cols: list[tuple[str, int, str, ImageFont.ImageFont]]) -> None:
    x1, y1, x2, y2 = xy
    draw.line((x1, y2, x2, y2), fill=COLORS["border"], width=1)
    x = x1 + 18
    for label, width, color, face in cols:
        text(draw, (x, y1 + 14), label, color, face)
        x += width


def draw_home() -> None:
    image, draw = img()
    shell(draw, "Home", "Setup Home", "Home")
    text(draw, (276, 112), "Finish setup before going live", face=F["h1"])
    wrapped(draw, (276, 152), "Readiness comes from real service connections, reviewed starter alerts, and copied browser-source outputs. Management stays setup-focused.", 780)

    card(draw, (276, 214, 928, 574), "Setup checklist")
    text(draw, (790, 246), "1 of 4 complete", COLORS["muted"], F["sm"])
    progress(draw, (304, 282), 1, 4, 584)
    checks = [
        ("Connect an event source", "Twitch or Streamer.bot validates incoming events.", "Blocked", COLORS["red_soft"], "#991B1B", "Add source"),
        ("Add optional TTS provider", "Speaker.bot can be connected later; alerts still work without speech.", "Todo", COLORS["amber_soft"], "#92400E", "Add TTS"),
        ("Review starter alert set", "Default alerts are generated disabled and marked Needs review.", "Todo", COLORS["amber_soft"], "#92400E", "Review set"),
        ("Open browser-source outputs", "Copy masked Landscape and Vertical output URLs into OBS/browser sources.", "Complete", COLORS["teal_soft"], "#065F46", "View outputs"),
    ]
    for idx, item in enumerate(checks, 1):
        y = 318 + (idx - 1) * 62
        rr(draw, (304, y, 888, y + 48), "#FFFFFF", COLORS["border"], radius=8)
        rr(draw, (320, y + 14, 338, y + 32), item[4], radius=9)
        text(draw, (354, y + 9), item[0], face=F["body_sb"])
        text(draw, (354, y + 29), item[1], COLORS["muted"], F["xs"])
        pill(draw, (674, y + 11), item[2], item[3], item[4], 96)
        button(draw, (784, y + 5), item[5], w=88)

    card(draw, (956, 214, 1352, 574), "Active alert set")
    pill(draw, (1252, 240), "Active", COLORS["teal_soft"], "#065F46", 76)
    text(draw, (984, 292), "Default Alerts", face=F["h2"])
    text(draw, (984, 326), "Starter set created automatically", COLORS["muted"], F["sm"])
    stats = [("2", "Blockers", COLORS["red_soft"], "#991B1B"), ("5", "Warnings", COLORS["amber_soft"], "#92400E"), ("0", "Enabled", COLORS["teal_soft"], "#0F766E")]
    for i, (value, label, bg, fg) in enumerate(stats):
        x = 984 + i * 118
        rr(draw, (x, 372, x + 100, 454), bg, radius=8)
        text(draw, (x + 40, 386), value, fg, F["xl"])
        text(draw, (x + 22, 424), label, fg, F["xs"])
    button(draw, (984, 488), "Open selected set", primary=True, w=164)
    button(draw, (1162, 488), "Mark reviewed", w=164)

    card(draw, (276, 606, 776, 860), "Needs attention")
    problems = [
        ("No event source connected", "Connect Twitch or Streamer.bot before alerts receive live events.", COLORS["red_soft"], "#991B1B", "Open Event sources"),
        ("Starter alerts need review", "Vertical layouts are disabled until reviewed.", COLORS["amber_soft"], "#92400E", "Review alerts"),
    ]
    for i, (title, detail, bg, fg, action) in enumerate(problems):
        y = 680 + i * 82
        rr(draw, (304, y, 748, y + 64), bg, "#FECACA" if fg == "#991B1B" else "#FDE68A", radius=8)
        text(draw, (324, y + 14), title, fg, F["body_sb"])
        text(draw, (324, y + 36), detail, "#7F1D1D" if fg == "#991B1B" else "#78350F", F["xs"])
        text(draw, (614, y + 22), action, COLORS["blue"], F["xs"])

    card(draw, (804, 606, 1352, 860), "Connections")
    connections = [("Event source", "Not connected", "Blocks live alerts", COLORS["red_soft"], "#991B1B"), ("TTS provider", "Optional", "Speech disabled until configured", COLORS["soft"], COLORS["muted"]), ("Browser source", "Output URLs ready", "Landscape and Vertical routes", COLORS["teal_soft"], "#0F766E")]
    for i, (name, state, detail, bg, fg) in enumerate(connections):
        y = 680 + i * 54
        rr(draw, (832, y, 1324, y + 42), bg, COLORS["border"], radius=8)
        text(draw, (852, y + 11), name, face=F["body_sb"])
        text(draw, (1000, y + 11), state, fg, F["body_sb"])
        text(draw, (1150, y + 12), detail, COLORS["muted"], F["xs"])
    image.save(ROOT / "hi-fi-home.png")


def draw_event_source_setup() -> None:
    image, draw = img()
    shell(draw, "Event sources", "Event sources", "Home / Event sources")
    text(draw, (276, 112), "Register Twitch as an event source", face=F["h1"])
    wrapped(draw, (276, 152), "Setup is a guided connector flow. The provider is not registered until validation succeeds.", 760)
    button(draw, (1180, 118), "Cancel setup", w=132)

    card(draw, (276, 214, 910, 860), "Add event source")
    steps = [("Choose source", COLORS["teal_soft"], "#065F46"), ("Connect account", COLORS["blue_soft"], "#1D4ED8"), ("Validate", COLORS["soft"], COLORS["muted"])]
    for i, (label, bg, fg) in enumerate(steps):
        x = 304 + i * 174
        pill(draw, (x, 282), label, bg, fg, 136)
        if i < 2:
            draw.line((x + 140, 295, x + 170, 295), fill=COLORS["border"], width=2)
    text(draw, (304, 342), "Twitch EventSub", face=F["h2"])
    wrapped(draw, (304, 374), "Receive follows, raids, subscribers, cheers, and channel-point events through one active Twitch provider.", 540)
    labels = [("Connection name", "Main Twitch channel"), ("Twitch account", "jamsethoth"), ("Event intake", "Start automatically when app starts")]
    for i, (label, value) in enumerate(labels):
        y = 450 + i * 76
        text(draw, (304, y), label, COLORS["muted"], F["xs"])
        rr(draw, (304, y + 22, 724, y + 58), COLORS["soft"], COLORS["border"], radius=7)
        text(draw, (320, y + 32), value, COLORS["text"], F["body"])
    text(draw, (304, 682), "Enabled event types", face=F["body_sb"])
    for i, name in enumerate(["Follow", "Raid", "Subscriber", "Cheer", "Custom"]):
        x = 304 + i * 104
        pill(draw, (x, 716), name, COLORS["blue_soft"], "#1D4ED8", 92)
    rr(draw, (304, 776, 724, 824), COLORS["teal_soft"], "#99F6E4", radius=8)
    text(draw, (324, 790), "Auth connected. Test validation required before registration.", "#065F46", F["body_sb"])

    card(draw, (940, 214, 1352, 860), "Activation impact")
    text(draw, (968, 286), "Provider behavior", face=F["h3"])
    wrapped(draw, (968, 318), "Stream Jams allows any number of registered providers, but one active provider per capability in MVP.", 334)
    impact = [("Matching alert rules", "8 Twitch event rules found", COLORS["teal_soft"], "#065F46"), ("Current active source", "None configured", COLORS["amber_soft"], "#92400E"), ("Runtime intake", "Will start on next app launch", COLORS["blue_soft"], "#1D4ED8")]
    for i, item in enumerate(impact):
        y = 420 + i * 74
        rr(draw, (968, y, 1324, y + 54), item[2], radius=8)
        text(draw, (988, y + 10), item[0], item[3], F["body_sb"])
        text(draw, (988, y + 31), item[1], item[3], F["xs"])
    button(draw, (968, 692), "Test connection", w=152)
    button(draw, (1134, 692), "Register source", primary=True, w=160)
    rr(draw, (968, 766, 1324, 824), COLORS["soft"], COLORS["border"], radius=8)
    wrapped(draw, (988, 780), "If validation fails, stay in this wizard with human-readable next step and reference ID linking to Diagnostics.", 316)
    image.save(ROOT / "hi-fi-event-source-setup.png")


def draw_alert_sets_overview() -> None:
    image, draw = img()
    shell(draw, "Alerts", "Alerts", "Home / Modules / Alerts / Sets")
    text(draw, (276, 112), "Default Alerts", face=F["h1"])
    wrapped(draw, (276, 152), "Active set overview keeps activation, validation, alert review, and browser-source output in one surface.", 800)
    button(draw, (1046, 118), "Create set", w=112)
    button(draw, (1172, 118), "Open editor", primary=True, w=140)
    for i, tab in enumerate(["Sets", "Editor", "Settings"]):
        x = 276 + i * 94
        pill(draw, (x, 196), tab, COLORS["blue_soft"] if i == 0 else COLORS["soft"], "#1D4ED8" if i == 0 else COLORS["muted"], 82)

    card(draw, (276, 246, 654, 486), "Selected set")
    pill(draw, (506, 272), "Active", COLORS["teal_soft"], "#065F46", 74)
    text(draw, (304, 320), "Default Alerts", face=F["h2"])
    text(draw, (304, 354), "One active alert set. Starter rows remain disabled until reviewed.", COLORS["muted"], F["sm"])
    rr(draw, (304, 408, 626, 456), COLORS["amber_soft"], "#FDE68A", radius=8)
    text(draw, (324, 422), "Editing active set", "#92400E", F["body_sb"])
    text(draw, (470, 424), "Save may affect live outputs.", "#92400E", F["xs"])

    card(draw, (684, 246, 1352, 486), "Validation summary")
    vals = [("2 blockers", "Missing Twitch source; TTS-only alert has no provider", COLORS["red_soft"], "#991B1B"), ("5 warnings", "Vertical profile unreviewed; text may overflow", COLORS["amber_soft"], "#92400E"), ("1 valid profile", "Landscape can activate after blockers are fixed", COLORS["teal_soft"], "#065F46")]
    for i, (title, detail, bg, fg) in enumerate(vals):
        x = 712 + i * 208
        rr(draw, (x, 318, x + 188, 418), bg, radius=8)
        text(draw, (x + 18, 338), title, fg, F["h3"])
        wrapped(draw, (x + 18, 366), detail, 150, fg, F["xs"], 3)

    card(draw, (276, 516, 898, 858), "Alert inventory")
    header = [("Event", 150, COLORS["muted"], F["xs"]), ("State", 132, COLORS["muted"], F["xs"]), ("Profiles", 150, COLORS["muted"], F["xs"]), ("Actions", 120, COLORS["muted"], F["xs"])]
    row(draw, (304, 570, 870, 602), header)
    rows = [
        ("Twitch Follow", "Needs review", "Landscape, Vertical off", "Edit  Preview"),
        ("Twitch Raid", "Warning", "Landscape valid", "Edit  Enable"),
        ("Subscriber", "Disabled", "Both generated", "Edit  Enable"),
        ("Custom event", "Invalid", "No output action", "Fix"),
    ]
    for i, data in enumerate(rows):
        colors = [COLORS["text"], "#92400E" if data[1] == "Warning" or data[1] == "Needs review" else "#991B1B" if data[1] == "Invalid" else COLORS["muted"], COLORS["muted"], COLORS["blue"]]
        row(draw, (304, 612 + i * 50, 870, 650 + i * 50), [(data[0], 150, colors[0], F["body_sb"]), (data[1], 132, colors[1], F["sm"]), (data[2], 150, colors[2], F["sm"]), (data[3], 120, colors[3], F["sm"])])

    card(draw, (928, 516, 1352, 858), "Browser-source outputs")
    outputs = [("Landscape 16:9", "Connected", COLORS["teal_soft"], "#065F46"), ("Vertical 9:16", "Never connected", COLORS["amber_soft"], "#92400E")]
    for i, (name, state, bg, fg) in enumerate(outputs):
        y = 570 + i * 118
        rr(draw, (956, y, 1324, y + 92), COLORS["soft"], COLORS["border"], radius=8)
        text(draw, (976, y + 16), name, face=F["body_sb"])
        pill(draw, (1148, y + 12), state, bg, fg, 136)
        rr(draw, (976, y + 50, 1148, y + 74), "#E5E7EB", radius=5)
        text(draw, (988, y + 56), "Route key masked", COLORS["muted"], F["xs"])
        button(draw, (1162, y + 46), "Copy", w=70)
        button(draw, (1240, y + 46), "Reveal", w=72)
    button(draw, (956, 806), "Send test", w=112)
    button(draw, (1082, 806), "Regenerate key", w=142)
    image.save(ROOT / "hi-fi-alert-sets-overview.png")


def main() -> None:
    draw_home()
    draw_event_source_setup()
    draw_alert_sets_overview()
    manifest = {
        "createdBy": "codex-stream-jams-hifi-concepts",
        "boards": [
            {"name": "Hi-Fi - Home", "file": "hi-fi-home.png", "width": W, "height": H},
            {"name": "Hi-Fi - Event Source Setup", "file": "hi-fi-event-source-setup.png", "width": W, "height": H},
            {"name": "Hi-Fi - Alert Sets Overview", "file": "hi-fi-alert-sets-overview.png", "width": W, "height": H},
        ],
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
