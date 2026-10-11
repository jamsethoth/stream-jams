import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BrowserSourceRow } from "./BrowserSourceRow.js";
import { BrowserSourceSetupNotice, browserSourceSizesShown } from "./BrowserSourcesPanel.js";
afterEach(cleanup);
it("shows exact authoritative dimensions independently of readiness or content", () => {
  const props = { label: "Music", ready: false, telemetry: "Not listening", url: <p>Create a URL</p>, actions: null };
  const view = render(<BrowserSourceRow {...props} canvas={{ width: 777, height: 211 }} />);
  expect(screen.getByRole("article")).toHaveTextContent("777 x 211");
  view.rerender(<BrowserSourceRow {...props} ready canvas={{ width: 888, height: 222 }} />);
  expect(screen.getByRole("article")).toHaveTextContent("888 x 222");
  expect(screen.queryByText("777 x 211")).toBeNull();
  view.rerender(<BrowserSourceRow {...props} />);
  expect(screen.queryByText("1920 x 1080")).toBeNull();
});
it("leaves OBS setup guidance to the page-owned panel notice", () => {
  render(<BrowserSourceRow label="Music" ready telemetry="Live output" url={<p>URL</p>} actions={null} canvas={{ width: 10, height: 10 }} />);
  expect(screen.getByRole("article")).not.toHaveTextContent(/test or unified|dimensions shown here/u);
});
it("words the single panel notice for shown and pending sizes", () => {
  const view = render(<BrowserSourceSetupNotice sizesShown />);
  expect(screen.getByRole("note")).toHaveTextContent("set its width and height to the size shown beside it");
  expect(screen.getByRole("note")).toHaveTextContent("Delete any old test or unified sources; they no longer display anything.");
  view.rerender(<BrowserSourceSetupNotice sizesShown={false} />);
  expect(screen.getByRole("note")).toHaveTextContent("Its width and height appear beside the URL once the saved size loads");
  expect(screen.getByRole("note")).not.toHaveTextContent("size shown beside it");
});
it("reports sizes shown only when every source has an authoritative canvas", () => {
  expect(browserSourceSizesShown([])).toBe(false);
  expect(browserSourceSizesShown([{ canvas: { width: 1, height: 1 } }, {}])).toBe(false);
  expect(browserSourceSizesShown([{ canvas: { width: 1, height: 1 } }])).toBe(true);
});
