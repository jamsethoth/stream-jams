import { expect, test } from "@playwright/test";
import {
  emptyComposition,
  installOverlayWebSocketMock,
  sendOverlayPlayback,
  textInstruction,
  visualInstruction
} from "./e2e-helpers.js";

test("live module overlay renders a synthetic follow playback event", async ({ page }) => {
  await installOverlayWebSocketMock(page);
  await page.route("**/overlay/modules/alerts/live/ovl_live/composition", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: emptyComposition({
        purpose: "live",
        scope: "module",
        modules: [
          {
            moduleId: "alerts",
            enabled: true,
            instructions: [
              textInstruction({
                id: "live-overlay-ready",
                purpose: "live",
                scope: "module",
                text: "Live overlay ready"
              })
            ]
          }
        ]
      })
    });
  });

  await page.goto("/overlay/modules/alerts/live/ovl_live");
  await expect(page.getByText("Live overlay ready")).toBeVisible();
  await sendOverlayPlayback(page, textInstruction({
    id: "live-follow",
    purpose: "live",
    scope: "module",
    text: "Live follow from Viewer",
    durationMs: 500,
    textStyle: {
      fontPreset: "serif",
      fontSizePx: 44,
      fontWeight: 700,
      lineHeight: 1.3,
      horizontalAlign: "right",
      verticalAlign: "bottom",
      color: "#FFCC00FF",
      shadow: null
    },
    boxStyle: {
      backgroundColor: "#102030BF",
      paddingPx: 12,
      cornerRadiusPx: 18,
      shadow: { offsetX: 4, offsetY: 6, blur: 12, color: "#00000080" }
    }
  }));

  const styledText = page.getByText("Live follow from Viewer");
  await expect(styledText).toBeVisible();
  await expect(styledText).toHaveCSS("font-family", /Georgia/u);
  await expect(styledText).toHaveCSS("font-size", "44px");
  await expect(styledText).toHaveCSS("justify-content", "flex-end");
  await expect(styledText).toHaveCSS("padding", "12px");
  await expect(styledText).toHaveCSS("border-radius", "18px");
  await expect(page.getByText("Live follow from Viewer")).toHaveCount(0);

  await sendOverlayPlayback(page, textInstruction({
    id: "invalid-style",
    purpose: "live",
    scope: "module",
    text: "This must stay transparent",
    textStyle: {
      fontPreset: "external-font",
      fontSizePx: 44,
      fontWeight: 700,
      lineHeight: 1.3,
      horizontalAlign: "right",
      verticalAlign: "bottom",
      color: "#FFCC00FF",
      shadow: null
    }
  }));

  await expect(page.getByText("This must stay transparent")).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => {
    const messages = (window as Window & { __overlaySocketMessages?: unknown[] }).__overlaySocketMessages ?? [];
    return messages.find((message) => (
      typeof message === "object" &&
      message !== null &&
      (message as { type?: unknown }).type === "overlay.playback.failed" &&
      (message as { instructionId?: unknown }).instructionId === "invalid-style"
    ));
  })).toMatchObject({
    type: "overlay.playback.failed",
    instructionId: "invalid-style",
    message: "Alert text style could not be rendered safely."
  });
});

test("vertical overlay preserves styled text geometry at its native viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await installOverlayWebSocketMock(page);
  await page.route("**/overlay/modules/alerts/live/ovl_vertical/composition?profile=vertical", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: emptyComposition({
        purpose: "live",
        scope: "module",
        targetProfileId: "vertical"
      })
    });
  });

  await page.goto("/overlay/modules/alerts/live/ovl_vertical?profile=vertical");
  await expect(page.getByTestId("overlay-profile-canvas")).toBeVisible();
  await sendOverlayPlayback(page, textInstruction({
    id: "vertical-styled",
    purpose: "live",
    scope: "module",
    targetProfileId: "vertical",
    text: "Vertical styled alert",
    durationMs: 750,
    layout: { x: 140, y: 820, width: 800, height: 180, zIndex: 10 },
    textStyle: {
      fontPreset: "rounded-sans",
      fontSizePx: 72,
      fontWeight: 800,
      lineHeight: 1.2,
      horizontalAlign: "left",
      verticalAlign: "bottom",
      color: "#FFCC00BF",
      shadow: { offsetX: -4, offsetY: 6, blur: 12, color: "#11223366" }
    },
    boxStyle: {
      backgroundColor: "#102030BF",
      paddingPx: 32,
      cornerRadiusPx: 32,
      shadow: { offsetX: 4, offsetY: 8, blur: 20, color: "#ABCDEF66" }
    }
  }));

  const outer = page.getByTestId("overlay-text-vertical-styled");
  const inner = outer.locator(".alert-text-layer");
  await expect(inner).toHaveCSS("box-sizing", "border-box");
  await expect(inner).toHaveCSS("font-size", "72px");
  await expect(inner).toHaveCSS("padding", "32px");
  await expect(inner).toHaveCSS("border-radius", "32px");
  await expect(inner).toHaveCSS("overflow-wrap", "anywhere");
  await expect(inner).toHaveCSS("text-shadow", /-4px 6px 12px/u);
  await expect(inner).toHaveCSS("box-shadow", /4px 8px 20px/u);
  expect(await outer.boundingBox()).toEqual({ x: 140, y: 820, width: 800, height: 180 });
  expect(await inner.boundingBox()).toEqual({ x: 140, y: 820, width: 800, height: 180 });
  await expect(outer).toHaveCount(0);
});

test("unified overlay renders enabled modules and excludes disabled modules", async ({ page }) => {
  await installOverlayWebSocketMock(page);
  await page.route("**/overlay/unified/live/ovl_unified/composition", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: emptyComposition({
        purpose: "live",
        scope: "unified",
        modules: [
          {
            moduleId: "alerts",
            enabled: true,
            instructions: [
              textInstruction({
                id: "initial-unified-alert",
                purpose: "live",
                scope: "unified",
                text: "Unified alert ready"
              })
            ]
          },
          {
            moduleId: "goals",
            enabled: false,
            instructions: [
              textInstruction({
                id: "disabled-goal-alert",
                moduleId: "goals",
                purpose: "live",
                scope: "unified",
                text: "Disabled goal should not render"
              })
            ]
          }
        ]
      })
    });
  });

  await page.goto("/overlay/unified/live/ovl_unified");

  await expect(page.getByText("Unified alert ready")).toBeVisible();
  await expect(page.getByText("Disabled goal should not render")).toHaveCount(0);

  await sendOverlayPlayback(page, textInstruction({
    id: "unified-live-event",
    purpose: "live",
    scope: "unified",
    text: "Unified synthetic event"
  }));

  await expect(page.getByText("Unified synthetic event")).toBeVisible();
});

test("module overlay renders image assets through overlay-safe media URLs", async ({ page }) => {
  await installOverlayWebSocketMock(page);
  let assetRequested = false;
  await page.route("**/overlay/modules/alerts/live/ovl_live/assets/asset-image", async (route) => {
    assetRequested = true;
    await route.fulfill({
      body: Buffer.from("iVBORw0KGgo=", "base64"),
      contentType: "image/png"
    });
  });
  await page.route("**/overlay/modules/alerts/live/ovl_live/composition", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: emptyComposition({
        purpose: "live",
        scope: "module",
        modules: [
          {
            moduleId: "alerts",
            enabled: true,
            instructions: [
              visualInstruction({
                id: "image-asset",
                assetId: "asset-image",
                purpose: "live",
                scope: "module"
              })
            ]
          }
        ]
      })
    });
  });

  await page.goto("/overlay/modules/alerts/live/ovl_live");

  await expect(page.getByTestId("overlay-visual-image-asset")).toHaveAttribute(
    "src",
    "/overlay/modules/alerts/live/ovl_live/assets/asset-image"
  );
  await expect.poll(() => assetRequested).toBe(true);
});
