import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AlertAudioOutputs } from "./AlertAudioOutputs.js";

afterEach(cleanup);

it("retains missing selections and changes only the explicitly toggled alert-wide output", async () => {
  const onChange = vi.fn();
  render(<AlertAudioOutputs value={{ browserSource: true, deviceRouteIds: ["lost"] }} status={{
    muted: false, capability: { available: true, devices: [], reason: null, nextStep: null },
    routes: [{ route: { id: "private", name: "Headphones", deviceId: null, deviceLabel: null }, state: "unbound" }]
  }} loading={false} error={null} onChange={onChange} />);
  expect(screen.getByRole("checkbox", { name: /lost/ })).toBeChecked();
  await userEvent.click(screen.getByRole("checkbox", { name: /Headphones/ }));
  expect(onChange).toHaveBeenCalledWith({ browserSource: true, deviceRouteIds: ["lost", "private"] });
  expect(screen.getByRole("link", { name: /Configure audio outputs/ })).toHaveAttribute("href", "/manage/settings#audio-outputs");
});

it("allows explicit silence and never plays audio on selection", async () => {
  const onChange = vi.fn();
  render(<AlertAudioOutputs value={{ browserSource: true, deviceRouteIds: [] }} status={null} loading={false} error="Service unavailable" onChange={onChange} />);
  await userEvent.click(screen.getByRole("checkbox", { name: /Browser Source/ }));
  expect(onChange).toHaveBeenCalledWith({ browserSource: false, deviceRouteIds: [] });
  expect(screen.getByText(/Service unavailable/)).toBeInTheDocument();
});
