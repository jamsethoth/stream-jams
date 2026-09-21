import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MediaAudioControls } from "./MediaAudioControls.js";

afterEach(cleanup);

it("accepts a host-specific checkbox layout class", () => {
  render(<MediaAudioControls checkboxClassName="screen-effects-check" value={{ playEmbeddedAudio: true, audioVolume: 1 }} hasSeparateAudio={false} onChange={vi.fn()} />);

  expect(screen.getByRole("checkbox", { name: "Play embedded audio" }).closest("label")).toHaveClass("screen-effects-check");
});

it("does not change the switch when a separate sound appears", () => {
  const onChange = vi.fn();
  const value = { playEmbeddedAudio: true, audioVolume: 0.5 };
  const view = render(<MediaAudioControls value={value} hasSeparateAudio={false} onChange={onChange} />);
  view.rerender(<MediaAudioControls value={value} hasSeparateAudio onChange={onChange} />);
  expect(screen.getByRole("checkbox", { name: "Play embedded audio" })).toBeChecked();
  expect(onChange).not.toHaveBeenCalled();
});

it("supports disabling all controls during a pending operation", () => {
  render(<MediaAudioControls value={{ playEmbeddedAudio: true, audioVolume: 1 }} hasSeparateAudio={false} disabled onChange={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "Play embedded audio" })).toBeDisabled();
  expect(screen.getByRole("spinbutton", { name: "Embedded audio volume" })).toBeDisabled();
});

it("changes the soundtrack toggle without changing its saved volume", async () => {
  const onChange = vi.fn();
  render(<MediaAudioControls value={{ playEmbeddedAudio: true, audioVolume: 0.4 }} hasSeparateAudio onChange={onChange} />);
  expect(screen.getByRole("checkbox", { name: "Play embedded audio" })).toBeChecked();
  expect(screen.getByText(/Both the video soundtrack and separate audio/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("checkbox", { name: "Play embedded audio" }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ playEmbeddedAudio: false, audioVolume: 0.4 });
});

it("hides volume unless embedded audio is enabled", () => {
  render(<MediaAudioControls value={{ playEmbeddedAudio: false, audioVolume: 0.7 }} hasSeparateAudio onChange={vi.fn()} />);
  expect(screen.queryByRole("spinbutton", { name: "Embedded audio volume" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Both the video soundtrack and separate audio/)).not.toBeInTheDocument();
});

it("accepts zero and 200 percent volume without changing the soundtrack toggle", () => {
  const onChange = vi.fn();
  render(<MediaAudioControls value={{ playEmbeddedAudio: true, audioVolume: 0.4 }} hasSeparateAudio={false} onChange={onChange} />);
  const input = screen.getByRole("spinbutton", { name: "Embedded audio volume" });
  fireEvent.change(input, { target: { value: "0" } });
  fireEvent.change(input, { target: { value: "200" } });
  expect(onChange.mock.calls).toEqual([[{ playEmbeddedAudio: true, audioVolume: 0 }], [{ playEmbeddedAudio: true, audioVolume: 2 }]]);
});

it("never commits empty or out-of-range volume values", () => {
  const onChange = vi.fn();
  render(<MediaAudioControls value={{ playEmbeddedAudio: true, audioVolume: 0.4 }} hasSeparateAudio={false} onChange={onChange} />);
  const input = screen.getByRole("spinbutton", { name: "Embedded audio volume" });
  for (const value of ["", "-1", "201"]) fireEvent.change(input, { target: { value } });
  expect(onChange).not.toHaveBeenCalled();
});
