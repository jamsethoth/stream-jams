import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BrowserSourceRow } from "./BrowserSourceRow.js";
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
