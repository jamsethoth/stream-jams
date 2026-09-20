import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MediaVolumeControl } from "./MediaVolumeControl.js";

afterEach(cleanup);

it("presents normalized gain as a percentage and accepts zero through 200 percent", () => {
  const onChange = vi.fn();
  render(<MediaVolumeControl label="Sound volume" value={0.6} onChange={onChange} />);
  const input = screen.getByRole("spinbutton", { name: "Sound volume" });
  expect(input).toHaveValue(60);
  expect(input).toHaveAttribute("min", "0");
  expect(input).toHaveAttribute("max", "200");
  fireEvent.change(input, { target: { value: "0" } });
  fireEvent.change(input, { target: { value: "200" } });
  expect(onChange.mock.calls).toEqual([[0], [2]]);
});

it("does not commit empty or out-of-range percentages", () => {
  const onChange = vi.fn();
  render(<MediaVolumeControl label="Sound volume" value={1} onChange={onChange} />);
  const input = screen.getByRole("spinbutton", { name: "Sound volume" });
  for (const value of ["", "-1", "201"]) fireEvent.change(input, { target: { value } });
  expect(onChange).not.toHaveBeenCalled();
});
