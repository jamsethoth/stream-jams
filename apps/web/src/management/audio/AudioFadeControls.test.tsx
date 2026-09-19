import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AudioFadeControls } from "./AudioFadeControls.js";

it("enables each fade independently with a 500 millisecond default", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<AudioFadeControls onChange={onChange} />);
  const toggle = screen.getByRole("checkbox", { name: "Fade in" });
  expect(toggle.closest("label")).toHaveClass("media-control-toggle");
  expect(screen.queryByRole("spinbutton", { name: "Fade in duration (milliseconds)" })).not.toBeInTheDocument();
  await user.click(toggle);
  expect(onChange).toHaveBeenLastCalledWith({ fadeInMs: 500, fadeOutMs: 0 });
});

it("preserves the other fade while editing a duration", async () => {
  const onChange = vi.fn();
  render(<AudioFadeControls fadeInMs={500} fadeOutMs={750} onChange={onChange} />);
  const input = screen.getByRole("spinbutton", { name: "Fade out duration (milliseconds)" });
  fireEvent.change(input, { target: { value: "900" } });
  expect(onChange).toHaveBeenLastCalledWith({ fadeInMs: 500, fadeOutMs: 900 });
});
