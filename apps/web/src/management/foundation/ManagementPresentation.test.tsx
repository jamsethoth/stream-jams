import { ActionIcon, Button, TextInput } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { renderManagement } from "../../test-support/render-management.js";
import { ManagementPresentationProvider } from "./ManagementPresentationProvider.js";
import { ThemeSwitcher } from "./ThemeSwitcher.js";
import { ManagementErrorBoundary } from "./ManagementErrorBoundary.js";
import { ManagementModalSurface, ManagementModalTitle } from "./ManagementModalSurface.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); document.documentElement.dir = "ltr"; });
it("restores the single theme key before Settings mounts and synchronizes live system changes", async () => {
  let dark = false;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const dispatchChange = () => listeners.forEach(listener => listener(Object.assign(new Event("change"), { matches: dark, media: "(prefers-color-scheme: dark)" }) as MediaQueryListEvent));
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ get matches() { return dark; }, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener(_event: string, listener: EventListenerOrEventListenerObject) { listeners.add(listener as (event: MediaQueryListEvent) => void); }, removeEventListener(_event: string, listener: EventListenerOrEventListenerObject) { listeners.delete(listener as (event: MediaQueryListEvent) => void); }, dispatchEvent() { return false; } }));
  localStorage.setItem("stream-jams-theme", "dark");
  const getItem = vi.spyOn(Storage.prototype, "getItem");
  const view = renderManagement(<ThemeSwitcher />);
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  await waitFor(() => expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "dark"));
  expect(getItem.mock.calls.every(([key]) => key === "stream-jams-theme")).toBe(true);
  await userEvent.click(screen.getByRole("radio", { name: "System" }));
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "light");
  act(() => { dark = true; dispatchChange(); });
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "dark");
  await userEvent.click(screen.getByRole("radio", { name: "Light" }));
  act(dispatchChange);
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "light");
  view.unmount();
  renderManagement(<ThemeSwitcher />);
  expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
});
it("keeps theme controls effective when storage reads and writes fail", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("unavailable"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("unavailable"); });
  renderManagement(<ThemeSwitcher />);
  expect(screen.getByRole("alert")).toHaveTextContent("Theme preference storage is unavailable");
  await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "dark");
  expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
});
it("preserves explicit submit intent, native anchors, field associations and refs", async () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const command = createRef<HTMLButtonElement>();
  const field = createRef<HTMLInputElement>();
  renderManagement(<form onSubmit={submit}>
    <Button ref={command}>Command</Button><ActionIcon aria-label="Preview">P</ActionIcon>
    <Button type="submit">Save</Button><Button component="a" href="/manage/assets" target="_blank">Assets</Button>
    <TextInput ref={field} label="Name" description="Use a recognizable label." error="Name is required." />
  </form>);
  expect(command.current).toHaveAttribute("type", "button");
  expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute("type", "button");
  await userEvent.click(command.current!);
  expect(submit).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(submit).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "Assets" })).toHaveAttribute("href", "/manage/assets");
  expect(field.current).toBe(screen.getByRole("textbox", { name: "Name" }));
  expect(field.current).toHaveAccessibleDescription("Name is required. Use a recognizable label.");
});
it("retains drafts when document direction changes", async () => {
  renderManagement(<TextInput label="Draft" defaultValue="Retain this" />);
  act(() => { document.documentElement.dir = "rtl"; });
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Draft" })).toHaveValue("Retain this"));
});
it("renders provider-independent recovery when theme initialization fails", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(window, "matchMedia").mockImplementation(() => { throw new Error("theme failed"); });
  const report = vi.fn(async () => {});
  render(<ManagementErrorBoundary reporter={{ report }}><ManagementPresentationProvider><Button>App</Button></ManagementPresentationProvider></ManagementErrorBoundary>);
  expect(await screen.findByRole("button", { name: "Reload management" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Open diagnostics" })).toHaveAttribute("href", expect.stringContaining("reference="));
  consoleError.mockRestore();
});
it("blocks Escape during pending and restores focus to a fallback after the trigger is removed", async () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    const [removed, setRemoved] = useState(false);
    const [pending, setPending] = useState(true);
    const fallback = createRef<HTMLButtonElement>();
    return <><button ref={fallback} type="button">Fallback</button>{removed ? null : <button type="button" onClick={() => setOpen(true)}>Open</button>}
      <ManagementModalSurface labelledBy="focus" open={open} pending={pending} onCancel={() => setOpen(false)} restoreFocusFallbackRef={fallback}>
        <ManagementModalTitle>Pending dialog</ManagementModalTitle>
        <button type="button" onClick={() => { setRemoved(true); setPending(false); }}>Complete</button>
        <button type="button" onClick={() => setOpen(false)}>Close</button>
      </ManagementModalSurface></>;
  }
  renderManagement(<Harness />);
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog", { name: "Pending dialog" });
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(dialog).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Complete" }));
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Fallback" })).toHaveFocus());
});
