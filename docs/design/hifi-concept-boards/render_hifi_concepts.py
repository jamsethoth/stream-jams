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
    "mono": font(13),
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
    draw.rounded_rectangle(xy, radius=radius, fill=fill or None, outline=outline, width=width)


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


def editor_chrome(draw: ImageDraw.ImageDraw, title: str, profile: str, dirty: bool = True) -> None:
    draw.rectangle((0, 0, W, H), fill="#EEF1F5")
    draw.rectangle((0, 0, W, 72), fill="#FFFFFF", outline="#E5E7EB")
    text(draw, (28, 18), "Modules / Alerts / Default Alerts / Twitch / Follow", COLORS["muted"], F["xs"])
    text(draw, (28, 38), title, COLORS["text"], F["h2"])
    pill(draw, (520, 24), profile, COLORS["blue_soft"], "#1D4ED8", 126)
    if dirty:
        pill(draw, (660, 24), "Unsaved changes", COLORS["amber_soft"], "#92400E", 130)
    button(draw, (960, 18), "Revert", w=92)
    button(draw, (1066, 18), "Preview", w=98)
    button(draw, (1178, 18), "Send test", w=104)
    button(draw, (1296, 18), "Save", primary=True, w=88)


def draw_editor_left_tree(draw: ImageDraw.ImageDraw) -> None:
    card(draw, (24, 96, 320, 920), "Default Alerts")
    rr(draw, (48, 146, 296, 182), COLORS["soft"], COLORS["border"], radius=7)
    text(draw, (64, 156), "Search alerts", COLORS["muted"], F["sm"])
    text(draw, (48, 208), "TWITCH", COLORS["muted"], F["xs"])
    items = [
        ("Follow / Default", "Needs review", COLORS["amber_soft"], "#92400E", True),
        ("Raid / Large raid", "Warning", COLORS["amber_soft"], "#92400E", False),
        ("Subscriber / Tier 1", "Disabled", COLORS["soft"], COLORS["muted"], False),
        ("Cheer / 1000 bits", "Invalid", COLORS["red_soft"], "#991B1B", False),
        ("Custom / Stream start", "Disabled", COLORS["soft"], COLORS["muted"], False),
    ]
    for i, (label, state, bg, fg, active) in enumerate(items):
        y = 238 + i * 68
        rr(draw, (48, y, 296, y + 52), COLORS["blue_soft"] if active else "#FFFFFF", COLORS["border"], radius=8)
        text(draw, (64, y + 10), label, COLORS["text"], F["body_sb"])
        pill(draw, (64, y + 30), state, bg, fg, 94)
    text(draw, (48, 642), "Set switcher", COLORS["muted"], F["xs"])
    rr(draw, (48, 670, 296, 708), COLORS["soft"], COLORS["border"], radius=7)
    text(draw, (64, 680), "Default Alerts", COLORS["text"], F["sm"])


def draw_canvas_area(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], profile: str) -> None:
    x1, y1, x2, y2 = xy
    card(draw, xy)
    text(draw, (x1 + 24, y1 + 22), "Canvas", face=F["h3"])
    pill(draw, (x2 - 188, y1 + 18), "Fit  100%  +", COLORS["soft"], COLORS["muted"], 150)
    rr(draw, (x1 + 34, y1 + 70, x2 - 34, y2 - 92), "#F1F5F9", "#CBD5E1", radius=8)
    # Checkerboard hint.
    for row_idx in range(0, 9):
        for col_idx in range(0, 14):
            if (row_idx + col_idx) % 2 == 0:
                cx = x1 + 50 + col_idx * 42
                cy = y1 + 88 + row_idx * 42
                draw.rectangle((cx, cy, cx + 42, cy + 42), fill="#E2E8F0")
    if profile == "Landscape 16:9":
        frame = (x1 + 84, y1 + 132, x2 - 84, y1 + 486)
    else:
        frame = (x1 + 210, y1 + 92, x2 - 210, y2 - 120)
    rr(draw, frame, "#FFFFFF", "#94A3B8", radius=10)
    rr(draw, (frame[0] + 52, frame[1] + 54, frame[2] - 52, frame[1] + 170), "#0F172A", "#334155", radius=12)
    if profile == "Vertical 9:16":
        text(draw, (frame[0] + 76, frame[1] + 78), "Thanks,", "#FFFFFF", F["h2"])
        text(draw, (frame[0] + 76, frame[1] + 108), "{userName}!", "#FFFFFF", F["h3"])
        rr(draw, (frame[0] + 58, frame[1] + 208, frame[2] - 58, frame[1] + 268), COLORS["blue_soft"], "#93C5FD", radius=8)
        text(draw, (frame[0] + 78, frame[1] + 222), "Sample:", "#1D4ED8", F["sm"])
        text(draw, (frame[0] + 78, frame[1] + 242), "LongViewer_123", "#1D4ED8", F["sm"])
    else:
        text(draw, (frame[0] + 88, frame[1] + 86), "Thanks for the follow, {userName}!", "#FFFFFF", F["h2"])
        rr(draw, (frame[0] + 124, frame[1] + 208, frame[2] - 124, frame[1] + 252), COLORS["blue_soft"], "#93C5FD", radius=8)
        text(draw, (frame[0] + 150, frame[1] + 220), "Sample: VeryLongViewerName_123", "#1D4ED8", F["body_sb"])
    rr(draw, (frame[0] + 20, frame[1] + 20, frame[2] - 20, frame[3] - 20), "", "#22C55E", radius=8, width=2)
    text(draw, (x1 + 34, y2 - 66), "Preview controls: replay, pause/play, scrub. Send test stays in toolbar.", COLORS["muted"], F["sm"])
    rr(draw, (x1 + 34, y2 - 36, x2 - 34, y2 - 24), "#CBD5E1", radius=6)
    rr(draw, (x1 + 34, y2 - 36, x1 + 220, y2 - 24), COLORS["blue"], radius=6)


def draw_inspector(draw: ImageDraw.ImageDraw, selected_tab: str = "Layers", blocked: bool = False) -> None:
    card(draw, (1068, 96, 1416, 920), "Inspector")
    tabs = ["Layers", "Alert", "Event"]
    for i, tab in enumerate(tabs):
        x = 1092 + i * 92
        pill(draw, (x, 146), tab, COLORS["blue_soft"] if tab == selected_tab else COLORS["soft"], "#1D4ED8" if tab == selected_tab else COLORS["muted"], 78)
    if selected_tab == "Layers":
        text(draw, (1092, 202), "Layer list", face=F["body_sb"])
        layers = [("Text: follow message", "Visible"), ("Image: avatar burst", "Visible"), ("Audio: chime", "On"), ("TTS: follow line", "Muted preview")]
        for i, (name, state) in enumerate(layers):
            y = 236 + i * 52
            rr(draw, (1092, y, 1392, y + 40), COLORS["blue_soft"] if i == 0 else "#FFFFFF", COLORS["border"], radius=7)
            text(draw, (1110, y + 10), name, COLORS["text"], F["sm"])
            text(draw, (1284, y + 11), state, COLORS["muted"], F["xs"])
        button(draw, (1092, 462), "Add layer", w=112)
        text(draw, (1092, 530), "Selected text", face=F["body_sb"])
        for i, (label, value) in enumerate([("X", "672"), ("Y", "278"), ("Width", "560"), ("Height", "64")]):
            x = 1092 + (i % 2) * 150
            y = 566 + (i // 2) * 62
            text(draw, (x, y), label, COLORS["muted"], F["xs"])
            rr(draw, (x, y + 20, x + 126, y + 54), COLORS["soft"], COLORS["border"], radius=6)
            text(draw, (x + 14, y + 29), value, COLORS["text"], F["sm"])
        text(draw, (1092, 710), "Animation preset", COLORS["muted"], F["xs"])
        rr(draw, (1092, 734, 1392, 770), COLORS["soft"], COLORS["border"], radius=6)
        text(draw, (1110, 744), "Pop in / fade out", COLORS["text"], F["sm"])
    else:
        text(draw, (1092, 202), "Sample payload", face=F["body_sb"])
        rr(draw, (1092, 236, 1392, 282), COLORS["soft"], COLORS["border"], radius=7)
        text(draw, (1110, 250), "Long username edge case", COLORS["text"], F["sm"])
        text(draw, (1092, 316), "Template variables", face=F["body_sb"])
        wrapped(draw, (1092, 348), "{userName}, {displayName}, {followedAt}, {providerName}", 280)
    if blocked:
        rr(draw, (1092, 796, 1392, 884), COLORS["red_soft"], "#FECACA", radius=8)
        text(draw, (1110, 812), "Cannot send test", "#991B1B", F["body_sb"])
        wrapped(draw, (1110, 838), "No connected Landscape browser-source client. Copy/open the output URL, then retry. Ref ERR-42B7.", 250, "#7F1D1D", F["xs"], 3)


def draw_alert_editor_landscape() -> None:
    image, draw = img()
    editor_chrome(draw, "Follow alert editor", "Landscape 16:9")
    draw_editor_left_tree(draw)
    draw_canvas_area(draw, (344, 96, 1044, 920), "Landscape 16:9")
    draw_inspector(draw, "Layers")
    image.save(ROOT / "hi-fi-alert-editor-landscape.png")


def draw_alert_editor_vertical() -> None:
    image, draw = img()
    editor_chrome(draw, "Follow alert editor", "Vertical 9:16")
    draw_editor_left_tree(draw)
    draw_canvas_area(draw, (344, 96, 1044, 920), "Vertical 9:16")
    draw_inspector(draw, "Alert")
    rr(draw, (666, 112, 1020, 152), COLORS["amber_soft"], "#FDE68A", radius=8)
    text(draw, (684, 124), "Vertical profile disabled for live output until reviewed", "#92400E", F["body_sb"])
    button(draw, (1100, 844), "Mark reviewed", w=132)
    button(draw, (1246, 844), "Enable profile", primary=True, w=132)
    image.save(ROOT / "hi-fi-alert-editor-vertical.png")


def draw_alert_editor_send_test_blocked() -> None:
    image, draw = img()
    editor_chrome(draw, "Follow alert editor", "Landscape 16:9")
    draw_editor_left_tree(draw)
    draw_canvas_area(draw, (344, 96, 1044, 920), "Landscape 16:9")
    draw_inspector(draw, "Event", blocked=True)
    rr(draw, (470, 256, 918, 512), "#FFFFFF", "#CBD5E1", radius=10)
    text(draw, (500, 286), "Send test blocked", face=F["h2"])
    wrapped(draw, (500, 326), "No connected browser-source client can receive this test. This should never report success silently.", 360)
    rr(draw, (500, 390, 888, 444), COLORS["red_soft"], "#FECACA", radius=8)
    text(draw, (520, 404), "Reference ID ERR-42B7", "#991B1B", F["body_sb"])
    text(draw, (520, 426), "Open Diagnostics for details and retry steps.", "#7F1D1D", F["xs"])
    button(draw, (500, 464), "Open outputs", primary=True, w=132)
    button(draw, (646, 464), "Open Diagnostics", w=152)
    button(draw, (812, 464), "Cancel", w=76)
    image.save(ROOT / "hi-fi-alert-editor-send-test-blocked.png")


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


def field(draw: ImageDraw.ImageDraw, xy: tuple[int, int], label: str, value: str, w: int = 320) -> None:
    x, y = xy
    text(draw, (x, y), label, COLORS["muted"], F["xs"])
    rr(draw, (x, y + 22, x + w, y + 58), COLORS["soft"], COLORS["border"], radius=7)
    text(draw, (x + 14, y + 32), value, COLORS["text"], F["body"])


def draw_assets_library() -> None:
    image, draw = img()
    shell(draw, "Assets", "Assets", "Home / Assets")
    text(draw, (276, 112), "Asset library", face=F["h1"])
    wrapped(draw, (276, 152), "Manage reusable images, audio, and video clips. Assets can still be added from alert creation without leaving that flow.", 850)
    button(draw, (1072, 118), "Import assets", w=132)
    button(draw, (1218, 118), "New folder", primary=True, w=112)

    card(draw, (276, 210, 1352, 306), "Filters")
    field(draw, (304, 254), "Search", "neon, raid, winter", 280)
    for i, label in enumerate(["Images", "Audio", "In use", "Needs review", "Tagged"]):
        pill(draw, (612 + i * 120, 276), label, COLORS["blue_soft"] if i == 2 else COLORS["soft"], "#1D4ED8" if i == 2 else COLORS["muted"], 104)

    card(draw, (276, 336, 1352, 862), "Assets")
    headers = [("Preview", 134, COLORS["muted"], F["xs"]), ("Name", 238, COLORS["muted"], F["xs"]), ("Type", 118, COLORS["muted"], F["xs"]), ("Tags", 244, COLORS["muted"], F["xs"]), ("Linked in", 176, COLORS["muted"], F["xs"]), ("Actions", 106, COLORS["muted"], F["xs"])]
    row(draw, (304, 392, 1324, 424), headers)
    assets = [
        ("", "winter-follow.png", "Image", "winter, follow, sparkle", "3 alerts", "Preview  Edit"),
        ("", "raid-horn.wav", "Audio", "raid, loud", "1 alert", "Preview  Edit"),
        ("", "subscriber-loop.webm", "Video", "subscriber, loop", "2 alerts", "Preview  Edit"),
        ("", "old-cheer.gif", "Image", "legacy, cheer", "Unused", "Preview  Delete"),
        ("", "tts-chime.mp3", "Audio", "speech, chime", "TTS preset", "Preview  Edit"),
    ]
    for i, data in enumerate(assets):
        y = 434 + i * 72
        row(draw, (304, y, 1324, y + 56), [(data[0], 134, COLORS["text"], F["body_sb"]), (data[1], 238, COLORS["text"], F["body_sb"]), (data[2], 118, COLORS["muted"], F["sm"]), (data[3], 244, COLORS["muted"], F["sm"]), (data[4], 176, COLORS["muted"], F["sm"]), (data[5], 106, COLORS["blue"], F["sm"])])
        x0 = 322
        rr(draw, (x0, y + 10, x0 + 54, y + 46), COLORS["blue_soft"] if i % 2 == 0 else COLORS["amber_soft"], radius=6)
        draw.ellipse((x0 + 18, y + 17, x0 + 36, y + 35), fill="#FFFFFF")
        if i == 3:
            pill(draw, (1120, y + 15), "Unused", COLORS["amber_soft"], "#92400E", 82)
    image.save(ROOT / "hi-fi-assets-library.png")


def draw_asset_detail_usage() -> None:
    image, draw = img()
    shell(draw, "Assets", "Asset details", "Home / Assets / winter-follow.png")
    text(draw, (276, 112), "winter-follow.png", face=F["h1"])
    wrapped(draw, (276, 152), "Update one source asset and every linked alert receives the change. Destructive actions show usage impact first.", 760)
    button(draw, (1056, 118), "Replace file", primary=True, w=128)
    button(draw, (1198, 118), "Download", w=104)
    button(draw, (1314, 118), "Delete", w=76)

    card(draw, (276, 214, 774, 858), "Preview")
    rr(draw, (318, 286, 732, 592), "#0F172A", radius=8)
    draw.rectangle((352, 424, 698, 468), fill="#FFFFFF")
    text(draw, (386, 430), "Thanks for the follow!", "#111827", F["h2"])
    draw.ellipse((462, 330, 586, 454), fill="#38BDF8")
    draw.ellipse((520, 286, 628, 394), fill="#FBBF24")
    text(draw, (318, 632), "Metadata", face=F["h3"])
    field(draw, (318, 674), "Display name", "Winter follow sparkle", 360)
    field(draw, (318, 752), "Tags", "winter, follow, sparkle", 360)

    card(draw, (804, 214, 1352, 858), "Linked usage")
    usage = [
        ("Default Alerts / Twitch Follow", "Landscape + Vertical", "Active set"),
        ("Default Alerts / Twitch Raid", "Landscape", "Disabled"),
        ("Winter 2026 / Follow", "Landscape", "Draft set"),
    ]
    for i, item in enumerate(usage):
        y = 294 + i * 100
        rr(draw, (832, y, 1324, y + 76), COLORS["soft"], COLORS["border"], radius=8)
        text(draw, (852, y + 16), item[0], face=F["body_sb"])
        text(draw, (852, y + 40), item[1], COLORS["muted"], F["sm"])
        pill(draw, (1162, y + 20), item[2], COLORS["teal_soft"] if item[2] == "Active set" else COLORS["amber_soft"], "#065F46" if item[2] == "Active set" else "#92400E", 124)
    rr(draw, (832, 664, 1324, 760), COLORS["amber_soft"], "#FDE68A", radius=8)
    text(draw, (852, 686), "Replacement impact", "#92400E", F["body_sb"])
    wrapped(draw, (852, 714), "Replacing this file updates 3 alert surfaces. Preview first when active set is live.", 420, "#78350F", F["sm"])
    button(draw, (832, 792), "Open first linked alert", primary=True, w=178)
    image.save(ROOT / "hi-fi-asset-detail-usage.png")


def draw_asset_picker_upload() -> None:
    image, draw = img()
    editor_chrome(draw, "Follow alert editor", "Landscape 16:9")
    draw_editor_left_tree(draw)
    draw_canvas_area(draw, (344, 96, 948, 920), "Landscape 16:9")
    rr(draw, (972, 96, 1408, 920), "#FFFFFF", COLORS["border"], radius=10)
    text(draw, (1000, 124), "Choose asset", face=F["h2"])
    wrapped(draw, (1000, 158), "Pick an existing reusable asset or register a new one without leaving alert creation.", 348)
    field(draw, (1000, 220), "Search library", "sparkle", 360)
    rr(draw, (1000, 310, 1380, 430), COLORS["blue_soft"], "#BFDBFE", radius=8)
    text(draw, (1022, 336), "Drop file or browse", "#1D4ED8", F["h3"])
    wrapped(draw, (1022, 368), "PNG, GIF, WEBM, MP3, WAV. Asset is added to library after validation.", 310, "#1D4ED8")
    assets = [("winter-follow.png", "Image - linked in 3 alerts"), ("sparkle-loop.webm", "Video - unused"), ("soft-chime.wav", "Audio - TTS preset")]
    for i, item in enumerate(assets):
        y = 462 + i * 72
        rr(draw, (1000, y, 1380, y + 54), COLORS["soft"], COLORS["border"], radius=8)
        rr(draw, (1020, y + 12, 1064, y + 42), COLORS["amber_soft"] if i == 1 else COLORS["teal_soft"], radius=5)
        text(draw, (1080, y + 12), item[0], face=F["body_sb"])
        text(draw, (1080, y + 32), item[1], COLORS["muted"], F["xs"])
    rr(draw, (1000, 714, 1380, 778), COLORS["red_soft"], "#FECACA", radius=8)
    text(draw, (1020, 732), "Upload failed: file exceeds 50 MB", "#991B1B", F["body_sb"])
    text(draw, (1020, 752), "Try compressing the file. Reference ID ERR-88A1", "#7F1D1D", F["xs"])
    button(draw, (1000, 844), "Cancel", w=84)
    button(draw, (1098, 844), "Use selected", primary=True, w=136)
    image.save(ROOT / "hi-fi-asset-picker-upload.png")


def draw_event_sources_list_detail() -> None:
    image, draw = img()
    shell(draw, "Event sources", "Event sources", "Home / Configuration / Event sources")
    text(draw, (276, 112), "Event sources", face=F["h1"])
    wrapped(draw, (276, 152), "Register many providers, but keep one active event-source provider for MVP intake.", 760)
    button(draw, (1162, 118), "Add source", primary=True, w=126)

    card(draw, (276, 214, 890, 858), "Registered sources")
    row(draw, (304, 272, 862, 304), [("Provider", 170, COLORS["muted"], F["xs"]), ("State", 130, COLORS["muted"], F["xs"]), ("Intake", 140, COLORS["muted"], F["xs"]), ("Events", 90, COLORS["muted"], F["xs"])])
    sources = [
        ("Twitch - main", "Active", "Auto on start", "12 today"),
        ("Streamer.bot local", "Registered", "Off", "0 today"),
        ("Twitch - alt", "Needs auth", "Off", "0 today"),
    ]
    for i, item in enumerate(sources):
        y = 316 + i * 78
        row(draw, (304, y, 862, y + 58), [(item[0], 170, COLORS["text"], F["body_sb"]), (item[1], 130, "#065F46" if item[1] == "Active" else "#92400E", F["sm"]), (item[2], 140, COLORS["muted"], F["sm"]), (item[3], 90, COLORS["muted"], F["sm"])])
    rr(draw, (304, 616, 862, 760), COLORS["amber_soft"], "#FDE68A", radius=8)
    text(draw, (326, 640), "Switching active source affects alert matching", "#92400E", F["body_sb"])
    wrapped(draw, (326, 670), "Current active alert set uses Twitch event types. Switching to Streamer.bot would disable 8 matching rules until remapped.", 480, "#78350F", F["sm"])

    card(draw, (920, 214, 1352, 858), "Twitch - main")
    pill(draw, (1214, 242), "Active", COLORS["teal_soft"], "#065F46", 86)
    field(draw, (948, 300), "Provider type", "Twitch EventSub", 340)
    field(draw, (948, 378), "Account", "jamsethoth", 340)
    field(draw, (948, 456), "Startup behavior", "Receive alerts automatically", 340)
    text(draw, (948, 552), "Health", face=F["h3"])
    for i, item in enumerate(["Auth valid", "WebSocket connected", "No duplicate messages"]):
        pill(draw, (948 + i * 126, 594), item, COLORS["teal_soft"], "#065F46", 118)
    button(draw, (948, 736), "Test source", w=112)
    button(draw, (1074, 736), "Edit", w=76)
    button(draw, (1164, 736), "Set active", primary=True, w=112)
    image.save(ROOT / "hi-fi-event-sources-list-detail.png")


def draw_tts_provider_setup() -> None:
    image, draw = img()
    shell(draw, "TTS providers", "TTS provider setup", "Home / Configuration / TTS providers / Add")
    text(draw, (276, 112), "Connect Speaker.bot for TTS", face=F["h1"])
    wrapped(draw, (276, 152), "TTS is optional. Provider registration is separate from event-source setup and validates before saving.", 780)

    card(draw, (276, 214, 918, 858), "Setup wizard")
    for i, step in enumerate(["Choose provider", "Connection", "Voice test", "Save"]):
        pill(draw, (304 + i * 144, 274), step, COLORS["blue_soft"] if i < 3 else COLORS["soft"], "#1D4ED8" if i < 3 else COLORS["muted"], 126)
    text(draw, (304, 342), "Speaker.bot connection", face=F["h2"])
    field(draw, (304, 404), "Host", "127.0.0.1", 260)
    field(draw, (594, 404), "Port", "7580", 160)
    field(draw, (304, 488), "Default voice", "Brian", 260)
    field(draw, (594, 488), "Max message length", "180 characters", 220)
    rr(draw, (304, 596, 852, 666), COLORS["teal_soft"], "#99F6E4", radius=8)
    text(draw, (326, 616), "Connection test passed", "#065F46", F["body_sb"])
    text(draw, (326, 640), "Voice list loaded. Send a test before saving.", "#065F46", F["xs"])
    button(draw, (304, 730), "Send voice test", w=142)
    button(draw, (462, 730), "Save provider", primary=True, w=134)

    card(draw, (948, 214, 1352, 858), "MVP safety")
    safety = [("One active TTS provider", "Alerts can reference the active capability only."), ("Provider-owned safety controls", "Voice, volume, rate, length, and profanity rules live here."), ("No silent failures", "TTS errors show reference IDs and next steps.")]
    for i, item in enumerate(safety):
        y = 292 + i * 132
        rr(draw, (976, y, 1324, y + 92), COLORS["soft"], COLORS["border"], radius=8)
        text(draw, (996, y + 18), item[0], face=F["body_sb"])
        wrapped(draw, (996, y + 44), item[1], 286)
    image.save(ROOT / "hi-fi-tts-provider-setup.png")


def draw_tts_provider_detail_safety() -> None:
    image, draw = img()
    shell(draw, "TTS providers", "Speaker.bot", "Home / Configuration / TTS providers / Speaker.bot")
    text(draw, (276, 112), "Speaker.bot", face=F["h1"])
    wrapped(draw, (276, 152), "Provider detail owns TTS defaults and safety limits. Alert editors choose TTS behavior without duplicating provider setup.", 820)
    button(draw, (1110, 118), "Test voice", w=110)
    button(draw, (1234, 118), "Save changes", primary=True, w=132)

    card(draw, (276, 214, 760, 858), "Connection")
    pill(draw, (602, 242), "Active TTS", COLORS["teal_soft"], "#065F46", 112)
    field(draw, (304, 300), "Host", "127.0.0.1", 360)
    field(draw, (304, 378), "Port", "7580", 360)
    field(draw, (304, 456), "Default voice", "Brian", 360)
    rr(draw, (304, 558, 704, 628), COLORS["red_soft"], "#FECACA", radius=8)
    text(draw, (326, 578), "Last test failed", "#991B1B", F["body_sb"])
    text(draw, (326, 602), "Speaker.bot not reachable. Reference ID ERR-TTS-19", "#7F1D1D", F["xs"])

    card(draw, (790, 214, 1352, 858), "Safety controls")
    controls = [("Volume", "72%"), ("Rate", "Normal"), ("Max length", "180 characters"), ("Blocked words", "12 entries"), ("Queue policy", "Drop duplicate tests")]
    for i, item in enumerate(controls):
        y = 292 + i * 70
        text(draw, (818, y), item[0], COLORS["muted"], F["xs"])
        rr(draw, (818, y + 24, 1280, y + 36), "#E5E7EB", radius=6)
        rr(draw, (818, y + 24, 990 + i * 22, y + 36), "#2563EB", radius=6)
        text(draw, (1294, y + 18), item[1], COLORS["text"], F["sm"])
    text(draw, (818, 684), "Used by alerts", face=F["h3"])
    for i, item in enumerate(["Twitch Follow", "Subscriber", "Raid"]):
        pill(draw, (818 + i * 132, 728), item, COLORS["blue_soft"], "#1D4ED8", 118)
    image.save(ROOT / "hi-fi-tts-provider-detail-safety.png")


def draw_diagnostics_problems() -> None:
    image, draw = img()
    shell(draw, "Diagnostics", "Diagnostics", "Home / Diagnostics / Problems")
    text(draw, (276, 112), "Diagnostics", face=F["h1"])
    wrapped(draw, (276, 152), "Failures are never silent. Each issue has a plain-language message, next step, and reference ID that maps to logs.", 820)
    for i, tab in enumerate(["Problems", "Events", "Raw logs"]):
        pill(draw, (276 + i * 118, 198), tab, COLORS["blue_soft"] if i == 0 else COLORS["soft"], "#1D4ED8" if i == 0 else COLORS["muted"], 104)

    card(draw, (276, 252, 904, 858), "Open problems")
    problems = [
        ("Event source disconnected", "Twitch WebSocket closed unexpectedly.", "Reconnect Twitch", "ERR-EVT-440"),
        ("Send test blocked", "No browser-source client is connected.", "Open output in OBS/browser", "ERR-42B7"),
        ("TTS provider unreachable", "Speaker.bot did not respond on 127.0.0.1:7580.", "Open TTS provider", "ERR-TTS-19"),
    ]
    for i, item in enumerate(problems):
        y = 322 + i * 136
        rr(draw, (304, y, 876, y + 106), COLORS["red_soft"] if i != 1 else COLORS["amber_soft"], "#FECACA" if i != 1 else "#FDE68A", radius=8)
        fg = "#991B1B" if i != 1 else "#92400E"
        text(draw, (326, y + 18), item[0], fg, F["body_sb"])
        text(draw, (326, y + 42), item[1], fg, F["sm"])
        text(draw, (326, y + 70), item[3], fg, F["xs"])
        button(draw, (704, y + 54), item[2], primary=i == 0, w=142)

    card(draw, (934, 252, 1352, 858), "Selected issue")
    text(draw, (962, 324), "Event source disconnected", face=F["h2"])
    wrapped(draw, (962, 362), "Stream Jams stopped receiving Twitch events at 10:42:18 PM. Alerts will not fire until connection resumes.", 330)
    text(draw, (962, 458), "Next steps", face=F["h3"])
    for i, item in enumerate(["Check Twitch auth", "Reconnect active event source", "Review raw log ERR-EVT-440"]):
        rr(draw, (962, 498 + i * 52, 1324, 534 + i * 52), COLORS["soft"], COLORS["border"], radius=7)
        text(draw, (982, 508 + i * 52), item, COLORS["text"], F["sm"])
    button(draw, (962, 742), "Open Event sources", primary=True, w=172)
    button(draw, (1148, 742), "Copy reference ID", w=150)
    image.save(ROOT / "hi-fi-diagnostics-problems.png")


def draw_diagnostics_events() -> None:
    image, draw = img()
    shell(draw, "Diagnostics", "Events", "Home / Diagnostics / Events")
    text(draw, (276, 112), "Event stream", face=F["h1"])
    wrapped(draw, (276, 152), "Sortable, filterable raw event feed for connected event sources. Useful for debugging matching and provider payloads.", 820)
    for i, tab in enumerate(["Problems", "Events", "Raw logs"]):
        pill(draw, (276 + i * 118, 198), tab, COLORS["blue_soft"] if i == 1 else COLORS["soft"], "#1D4ED8" if i == 1 else COLORS["muted"], 104)

    card(draw, (276, 252, 956, 858), "Received events")
    field(draw, (304, 302), "Filter", "provider:twitch follow", 280)
    row(draw, (304, 384, 928, 416), [("Time", 118, COLORS["muted"], F["xs"]), ("Source", 130, COLORS["muted"], F["xs"]), ("Event", 146, COLORS["muted"], F["xs"]), ("Matched", 112, COLORS["muted"], F["xs"]), ("Result", 86, COLORS["muted"], F["xs"])])
    events = [
        ("22:42:13", "Twitch", "channel.follow", "Twitch Follow", "Queued"),
        ("22:41:52", "Twitch", "channel.raid", "Twitch Raid", "Shown"),
        ("22:39:10", "Twitch", "channel.cheer", "No alert", "Ignored"),
        ("22:31:44", "Streamer.bot", "test.follow", "Twitch Follow", "Test"),
        ("22:28:07", "Twitch", "channel.subscribe", "Subscriber", "Failed"),
    ]
    for i, item in enumerate(events):
        color = "#991B1B" if item[4] == "Failed" else "#065F46" if item[4] in {"Shown", "Queued"} else COLORS["muted"]
        row(draw, (304, 430 + i * 58, 928, 472 + i * 58), [(item[0], 118, COLORS["text"], F["sm"]), (item[1], 130, COLORS["text"], F["sm"]), (item[2], 146, COLORS["text"], F["body_sb"]), (item[3], 112, COLORS["muted"], F["sm"]), (item[4], 86, color, F["sm"])])

    card(draw, (986, 252, 1352, 858), "Event detail")
    text(draw, (1014, 324), "channel.follow", face=F["h2"])
    pill(draw, (1014, 366), "Queued", COLORS["teal_soft"], "#065F46", 90)
    field(draw, (1014, 426), "Provider", "Twitch - main", 290)
    field(draw, (1014, 504), "Matched alert", "Default Alerts / Follow", 290)
    text(draw, (1014, 614), "Sample payload", face=F["h3"])
    rr(draw, (1014, 650, 1324, 748), "#111827", radius=8)
    text(draw, (1032, 672), "{ user_name: \"viewer42\" }", "#E5E7EB", F["mono"])
    button(draw, (1014, 786), "Open alert", primary=True, w=112)
    button(draw, (1140, 786), "Use as sample", w=128)
    image.save(ROOT / "hi-fi-diagnostics-events.png")


def draw_diagnostics_raw_logs_failure_detail() -> None:
    image, draw = img()
    shell(draw, "Diagnostics", "Raw logs", "Home / Diagnostics / Raw logs")
    text(draw, (276, 112), "Raw logs", face=F["h1"])
    wrapped(draw, (276, 152), "Log detail is redacted by default but deep-links back to the broken configuration surface.", 760)
    for i, tab in enumerate(["Problems", "Events", "Raw logs"]):
        pill(draw, (276 + i * 118, 198), tab, COLORS["blue_soft"] if i == 2 else COLORS["soft"], "#1D4ED8" if i == 2 else COLORS["muted"], 104)
    button(draw, (1146, 118), "Export diagnostics", primary=True, w=170)

    card(draw, (276, 252, 898, 858), "Logs")
    lines = [
        ("22:42:18", "error", "ERR-EVT-440 Twitch WebSocket closed"),
        ("22:42:16", "info", "received channel.follow message id redacted"),
        ("22:41:52", "info", "queued alert playback default-follow"),
        ("22:39:10", "warn", "no alert matched channel.cheer"),
        ("22:31:44", "error", "ERR-42B7 send test blocked no client"),
    ]
    for i, item in enumerate(lines):
        y = 316 + i * 66
        bg = COLORS["red_soft"] if item[1] == "error" else COLORS["amber_soft"] if item[1] == "warn" else COLORS["soft"]
        fg = "#991B1B" if item[1] == "error" else "#92400E" if item[1] == "warn" else COLORS["text"]
        rr(draw, (304, y, 870, y + 48), bg, COLORS["border"], radius=8)
        text(draw, (324, y + 14), item[0], COLORS["muted"], F["mono"])
        text(draw, (410, y + 14), item[1], fg, F["mono"])
        text(draw, (474, y + 14), item[2], fg, F["sm"])

    card(draw, (928, 252, 1352, 858), "Failure detail")
    text(draw, (956, 320), "ERR-EVT-440", face=F["h2"])
    wrapped(draw, (956, 358), "Twitch EventSub socket closed and reconnect did not complete before keepalive timeout.", 330)
    rr(draw, (956, 454, 1324, 594), "#111827", radius=8)
    for i, line in enumerate(["provider: twitch-main", "message_id: [redacted]", "route_key: [redacted]", "next: reconnect source"]):
        text(draw, (976, 478 + i * 26), line, "#E5E7EB", F["mono"])
    button(draw, (956, 664), "Open Event sources", primary=True, w=172)
    button(draw, (1142, 664), "Copy log bundle", w=142)
    image.save(ROOT / "hi-fi-diagnostics-raw-logs-failure-detail.png")


def draw_settings_overview() -> None:
    image, draw = img()
    shell(draw, "Settings", "Settings", "Home / Settings")
    text(draw, (276, 112), "Settings", face=F["h1"])
    wrapped(draw, (276, 152), "Global app preferences stay separate from module setup and provider configuration.", 780)

    card(draw, (276, 214, 760, 858), "App preferences")
    prefs = [("Theme", "System, with Dark and Light override"), ("Density", "Comfortable by default"), ("Startup", "Open management UI on launch"), ("Logs", "Keep 14 days"), ("Data folder", "C:/Users/James/AppData/Local/StreamJams")]
    for i, item in enumerate(prefs):
        y = 292 + i * 86
        field(draw, (304, y), item[0], item[1], 380)

    card(draw, (790, 214, 1352, 858), "Maintenance")
    items = [
        ("Backup and restore", "Export/import complete user config including assets."),
        ("Route keys", "Regenerate browser-source keys with active-output warning."),
        ("Diagnostics", "Export redacted logs and current app health."),
        ("Version", "Stream Jams 0.1.0 local MVP"),
    ]
    for i, item in enumerate(items):
        y = 292 + i * 112
        rr(draw, (818, y, 1324, y + 82), COLORS["soft"], COLORS["border"], radius=8)
        text(draw, (838, y + 16), item[0], face=F["body_sb"])
        wrapped(draw, (838, y + 42), item[1], 340)
        text(draw, (1260, y + 32), "Open", COLORS["blue"], F["sm"])
    image.save(ROOT / "hi-fi-settings-overview.png")


def draw_backup_export() -> None:
    image, draw = img()
    shell(draw, "Settings", "Backup export", "Home / Settings / Backup")
    text(draw, (276, 112), "Export backup", face=F["h1"])
    wrapped(draw, (276, 152), "Create a complete local backup of user config and assets. Secrets are excluded and must be reconnected after restore.", 850)

    card(draw, (276, 214, 852, 858), "Backup contents")
    checks = [("Alert sets and rules", "Included"), ("Assets", "Included"), ("Provider registrations", "Included without secrets"), ("Route keys", "Regenerate on restore"), ("Raw logs", "Excluded by default")]
    for i, item in enumerate(checks):
        y = 294 + i * 78
        rr(draw, (304, y, 824, y + 56), COLORS["soft"], COLORS["border"], radius=8)
        text(draw, (326, y + 17), item[0], face=F["body_sb"])
        pill(draw, (636, y + 14), item[1], COLORS["teal_soft"] if "Included" in item[1] else COLORS["amber_soft"], "#065F46" if "Included" in item[1] else "#92400E", 160)
    rr(draw, (304, 732, 824, 800), COLORS["blue_soft"], "#BFDBFE", radius=8)
    text(draw, (326, 754), "File: stream-jams-backup-2026-07-13.streamjams-backup", "#1D4ED8", F["sm"])

    card(draw, (882, 214, 1352, 858), "Export review")
    text(draw, (910, 300), "Ready to export", face=F["h2"])
    wrapped(draw, (910, 338), "Export can run while offline. The app validates file integrity before reporting success.", 356)
    rr(draw, (910, 452, 1324, 530), COLORS["amber_soft"], "#FDE68A", radius=8)
    text(draw, (932, 474), "Reconnect providers after restore", "#92400E", F["body_sb"])
    text(draw, (932, 500), "Tokens and secrets are never exported.", "#78350F", F["xs"])
    button(draw, (910, 730), "Cancel", w=86)
    button(draw, (1010, 730), "Export backup", primary=True, w=142)
    image.save(ROOT / "hi-fi-backup-export.png")


def draw_restore_backup() -> None:
    image, draw = img()
    shell(draw, "Settings", "Restore backup", "Home / Settings / Restore")
    text(draw, (276, 112), "Restore from backup", face=F["h1"])
    wrapped(draw, (276, 152), "Restore validates the archive, creates a safety backup, and regenerates route keys unless user explicitly keeps them.", 860)

    card(draw, (276, 214, 864, 858), "Restore plan")
    field(draw, (304, 292), "Selected file", "stream-jams-backup-2026-07-13.streamjams-backup", 500)
    rows = [("Alert sets", "6 imported"), ("Assets", "42 files verified"), ("Providers", "3 require reconnect"), ("Route keys", "Regenerate after restore"), ("Safety backup", "Create before applying")]
    for i, item in enumerate(rows):
        y = 400 + i * 68
        rr(draw, (304, y, 824, y + 48), COLORS["soft"], COLORS["border"], radius=8)
        text(draw, (326, y + 14), item[0], face=F["body_sb"])
        text(draw, (650, y + 14), item[1], COLORS["muted"], F["sm"])

    card(draw, (894, 214, 1352, 858), "Warnings")
    rr(draw, (922, 294, 1324, 394), COLORS["red_soft"], "#FECACA", radius=8)
    text(draw, (944, 318), "Live activity detected", "#991B1B", F["body_sb"])
    wrapped(draw, (944, 346), "Stop alert intake before restore to avoid losing in-flight events.", 320, "#7F1D1D", F["sm"])
    rr(draw, (922, 430, 1324, 530), COLORS["amber_soft"], "#FDE68A", radius=8)
    text(draw, (944, 454), "Route keys will change", "#92400E", F["body_sb"])
    wrapped(draw, (944, 482), "OBS browser sources need updated URLs after restore.", 320, "#78350F", F["sm"])
    button(draw, (922, 730), "Cancel", w=84)
    button(draw, (1020, 730), "Restore backup", primary=True, w=142)
    image.save(ROOT / "hi-fi-restore-backup.png")


def draw_dirty_navigation_guard() -> None:
    image, draw = img()
    editor_chrome(draw, "Follow alert editor", "Landscape 16:9", dirty=True)
    draw_editor_left_tree(draw)
    draw_canvas_area(draw, (344, 96, 1044, 920), "Landscape 16:9")
    draw_inspector(draw, "Alert")
    rr(draw, (0, 0, W, H), "#02061780", radius=0)
    rr(draw, (462, 276, 978, 562), "#FFFFFF", "#CBD5E1", radius=10)
    text(draw, (500, 316), "Unsaved alert changes", face=F["h2"])
    wrapped(draw, (500, 356), "You changed the active alert set. Leaving now can affect what is saved for live outputs.", 410)
    rr(draw, (500, 432, 940, 488), COLORS["amber_soft"], "#FDE68A", radius=8)
    text(draw, (520, 448), "Landscape profile has unsaved position and text edits.", "#92400E", F["body_sb"])
    button(draw, (500, 510), "Save and leave", primary=True, w=140)
    button(draw, (654, 510), "Discard changes", w=146)
    button(draw, (814, 510), "Keep editing", w=112)
    image.save(ROOT / "hi-fi-dirty-navigation-guard.png")


def draw_active_set_save_warning() -> None:
    image, draw = img()
    shell(draw, "Alerts", "Save active set", "Home / Modules / Alerts / Sets")
    text(draw, (276, 112), "Save changes to active set", face=F["h1"])
    wrapped(draw, (276, 152), "Activation is separate from saving, but edits to the active set need explicit live-impact warning.", 820)
    card(draw, (276, 232, 852, 838), "Changed alerts")
    rows = [("Twitch Follow", "Layout moved 120 px", "Landscape live"), ("Twitch Raid", "Audio asset replaced", "Landscape live"), ("Subscriber", "Vertical enabled", "Not live")]
    for i, item in enumerate(rows):
        y = 310 + i * 86
        rr(draw, (304, y, 824, y + 58), COLORS["soft"], COLORS["border"], radius=8)
        text(draw, (326, y + 16), item[0], face=F["body_sb"])
        text(draw, (500, y + 16), item[1], COLORS["muted"], F["sm"])
        pill(draw, (656, y + 13), item[2], COLORS["amber_soft"] if "live" in item[2].lower() else COLORS["soft"], "#92400E" if "live" in item[2].lower() else COLORS["muted"], 136)

    card(draw, (882, 232, 1352, 838), "Live impact")
    rr(draw, (910, 310, 1324, 430), COLORS["amber_soft"], "#FDE68A", radius=8)
    text(draw, (934, 338), "This set is active", "#92400E", F["h3"])
    wrapped(draw, (934, 372), "Saving updates connected browser-source outputs immediately for Landscape profile.", 330, "#78350F", F["sm"])
    rr(draw, (910, 480, 1324, 560), COLORS["blue_soft"], "#BFDBFE", radius=8)
    text(draw, (934, 506), "Vertical remains disabled", "#1D4ED8", F["body_sb"])
    text(draw, (934, 532), "Generated vertical profile still needs review.", "#1D4ED8", F["xs"])
    button(draw, (910, 714), "Review changes", w=132)
    button(draw, (1056, 714), "Save active set", primary=True, w=142)
    image.save(ROOT / "hi-fi-active-set-save-warning.png")


def draw_destructive_confirmation() -> None:
    image, draw = img()
    shell(draw, "Alerts", "Regenerate output key", "Home / Modules / Alerts / Outputs")
    text(draw, (276, 112), "Regenerate route key", face=F["h1"])
    wrapped(draw, (276, 152), "Destructive operations require explicit confirmation, clear blast radius, and recovery steps.", 780)
    card(draw, (276, 232, 824, 838), "Current browser-source output")
    text(draw, (304, 304), "Landscape 16:9", face=F["h2"])
    rr(draw, (304, 364, 768, 420), "#E5E7EB", radius=7)
    text(draw, (326, 382), "http://127.0.0.1:5173/overlay/.../[masked]", COLORS["muted"], F["mono"])
    pill(draw, (304, 464), "Connected now", COLORS["teal_soft"], "#065F46", 120)
    pill(draw, (438, 464), "Active set uses this output", COLORS["amber_soft"], "#92400E", 184)
    wrapped(draw, (304, 532), "After regeneration, OBS/browser sources using the old URL stop receiving alerts until updated.", 430)

    card(draw, (854, 232, 1352, 838), "Confirm action")
    rr(draw, (882, 304, 1324, 414), COLORS["red_soft"], "#FECACA", radius=8)
    text(draw, (904, 330), "This cannot be undone", "#991B1B", F["h3"])
    wrapped(draw, (904, 362), "New route key is generated immediately. Old key is revoked.", 360, "#7F1D1D", F["sm"])
    field(draw, (882, 486), "Type REGENERATE to confirm", "REGENERATE", 360)
    rr(draw, (882, 598, 1324, 666), COLORS["soft"], COLORS["border"], radius=8)
    text(draw, (904, 620), "Recovery", face=F["body_sb"])
    text(draw, (1004, 620), "Copy new URL into OBS browser source.", COLORS["muted"], F["sm"])
    button(draw, (882, 730), "Cancel", w=84)
    button(draw, (980, 730), "Regenerate key", primary=True, w=150)
    image.save(ROOT / "hi-fi-destructive-confirmation.png")


def main() -> None:
    draw_home()
    draw_event_source_setup()
    draw_alert_sets_overview()
    draw_alert_editor_landscape()
    draw_alert_editor_vertical()
    draw_alert_editor_send_test_blocked()
    draw_assets_library()
    draw_asset_detail_usage()
    draw_asset_picker_upload()
    draw_event_sources_list_detail()
    draw_tts_provider_setup()
    draw_tts_provider_detail_safety()
    draw_diagnostics_problems()
    draw_diagnostics_events()
    draw_diagnostics_raw_logs_failure_detail()
    draw_settings_overview()
    draw_backup_export()
    draw_restore_backup()
    draw_dirty_navigation_guard()
    draw_active_set_save_warning()
    draw_destructive_confirmation()
    manifest = {
        "createdBy": "codex-stream-jams-hifi-concepts",
        "implementationStatus": "implemented-with-documented-backlog",
        "implementationAudit": "../ui-refactor-implementation-audit.md",
        "boards": [
            {"name": "Hi-Fi - Home", "file": "hi-fi-home.png", "width": W, "height": H},
            {"name": "Hi-Fi - Event Source Setup", "file": "hi-fi-event-source-setup.png", "width": W, "height": H},
            {"name": "Hi-Fi - Alert Sets Overview", "file": "hi-fi-alert-sets-overview.png", "width": W, "height": H},
            {"name": "Hi-Fi - Alert Editor Landscape", "file": "hi-fi-alert-editor-landscape.png", "width": W, "height": H},
            {"name": "Hi-Fi - Alert Editor Vertical", "file": "hi-fi-alert-editor-vertical.png", "width": W, "height": H},
            {"name": "Hi-Fi - Alert Editor Send Test Blocked", "file": "hi-fi-alert-editor-send-test-blocked.png", "width": W, "height": H},
            {"name": "Hi-Fi - Assets Library", "file": "hi-fi-assets-library.png", "width": W, "height": H},
            {"name": "Hi-Fi - Asset Detail Usage", "file": "hi-fi-asset-detail-usage.png", "width": W, "height": H},
            {"name": "Hi-Fi - Asset Picker Upload", "file": "hi-fi-asset-picker-upload.png", "width": W, "height": H},
            {"name": "Hi-Fi - Event Sources List Detail", "file": "hi-fi-event-sources-list-detail.png", "width": W, "height": H},
            {"name": "Hi-Fi - TTS Provider Setup", "file": "hi-fi-tts-provider-setup.png", "width": W, "height": H},
            {"name": "Hi-Fi - TTS Provider Detail Safety", "file": "hi-fi-tts-provider-detail-safety.png", "width": W, "height": H},
            {"name": "Hi-Fi - Diagnostics Problems", "file": "hi-fi-diagnostics-problems.png", "width": W, "height": H},
            {"name": "Hi-Fi - Diagnostics Events", "file": "hi-fi-diagnostics-events.png", "width": W, "height": H},
            {"name": "Hi-Fi - Diagnostics Raw Logs Failure Detail", "file": "hi-fi-diagnostics-raw-logs-failure-detail.png", "width": W, "height": H},
            {"name": "Hi-Fi - Settings Overview", "file": "hi-fi-settings-overview.png", "width": W, "height": H},
            {"name": "Hi-Fi - Backup Export", "file": "hi-fi-backup-export.png", "width": W, "height": H},
            {"name": "Hi-Fi - Restore Backup", "file": "hi-fi-restore-backup.png", "width": W, "height": H},
            {"name": "Hi-Fi - Dirty Navigation Guard", "file": "hi-fi-dirty-navigation-guard.png", "width": W, "height": H},
            {"name": "Hi-Fi - Active Set Save Warning", "file": "hi-fi-active-set-save-warning.png", "width": W, "height": H},
            {"name": "Hi-Fi - Destructive Confirmation", "file": "hi-fi-destructive-confirmation.png", "width": W, "height": H},
        ],
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
