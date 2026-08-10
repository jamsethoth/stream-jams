import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RgbaColorControl } from "./RgbaColorControl.js";

afterEach(cleanup);

describe("RgbaColorControl", () => {
  it("emits one canonical RGBA value from native RGB and opacity inputs", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <RgbaColorControl label="Text color" onChange={onChange} value="#102030FF" />
    );

    fireEvent.change(screen.getByLabelText("Text color color"), { target: { value: "#abcdef" } });
    expect(onChange).toHaveBeenLastCalledWith("#ABCDEFFF");

    rerender(<RgbaColorControl label="Text color" onChange={onChange} value="#ABCDEFFF" />);
    fireEvent.change(screen.getByLabelText("Text color opacity"), { target: { value: "75" } });
    expect(onChange).toHaveBeenLastCalledWith("#ABCDEFBF");

    fireEvent.change(screen.getByLabelText("Text color opacity"), { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith("#ABCDEF00");
  });
});
