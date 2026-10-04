import { expect, test } from "@playwright/test";
import { startMusicTestRuntime } from "./music-test-runtime.js";

test("module Browser Sources share Alerts presentation and keyboard disclosure", async ({ page }) => {
  const fixture = await startMusicTestRuntime();
  try {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      let reference: unknown;
      for (const moduleId of ["alerts", "screen-effects", "timers", "music"]) {
        await page.goto(`${fixture.url}/manage/modules/${moduleId}`);
        const panel = page.locator(".browser-sources-panel");
        await expect(panel).toBeVisible();
        const toggle = panel.getByRole("button", { name: "Expand browser sources" });
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        const presentation = await panel.evaluate(element => {
          const style = getComputedStyle(element);
          const button = getComputedStyle(element.querySelector("button")!);
          const icon = getComputedStyle(element.querySelector("button > span")!);
          const heading = getComputedStyle(element.querySelector("h2")!);
          return { background: style.backgroundColor, padding: style.padding, border: style.borderTop, radius: style.borderRadius, toggleHeight: button.minHeight, iconWidth: icon.width, iconBorder: icon.border, headingSize: heading.fontSize };
        });
        if (moduleId === "alerts") reference = presentation;
        else expect(presentation).toEqual(reference);
        await toggle.focus(); await toggle.press("Enter");
        await expect(panel.getByRole("button", { name: "Collapse browser sources" })).toHaveAttribute("aria-expanded", "true");
        await expect(panel.locator(".browser-sources-panel__details")).toBeVisible();
        await panel.getByRole("button", { name: "Collapse browser sources" }).press("Space");
        await expect(panel.locator(".browser-sources-panel__details")).toHaveCount(0);
        expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
    }
  } finally { await fixture.close(); }
});

