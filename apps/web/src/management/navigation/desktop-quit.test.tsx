import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { DirtyNavigationProvider, useDirtyNavigationSource, useManagementNavigation } from "./dirty-navigation.js";
import type { DesktopBridge } from "../desktop/desktop-bridge.js";

afterEach(() => { cleanup(); delete window.streamJamsDesktop; });
function fixture(saveFails = false, dirty = true) {
  const effects: string[] = [];
  let request!: (id: string) => void;
  const bridge: DesktopBridge = {
    onQuitRequested(listener) { request = listener; return () => {}; },
    resolveQuit(_id, allow) { effects.push(allow ? "quit" : "cancel"); }
  };
  window.streamJamsDesktop = bridge;
  const save = async () => { effects.push("save"); if (saveFails) throw new Error("Save failed"); };
  const discard = () => { effects.push("discard"); };
  function Harness() {
    useDirtyNavigationSource({ id: "editor", summary: "Alert edits are unsaved.", dirty, save, discard });
    const navigation = useManagementNavigation();
    return <>{navigation.guard}</>;
  }
  render(<DirtyNavigationProvider><Harness /></DirtyNavigationProvider>);
  return { effects, request: () => act(() => request("38f4dfe8-c157-4b14-bbb3-df8c3144f7c2")) };
}

it.each([["Cancel", ["cancel"]], ["Discard", ["discard", "quit"]], ["Save and leave", ["save", "quit"]]] as const)("guards desktop quit through %s", async (action, expected) => {
  const { request, effects } = fixture();
  request();
  expect(effects).toEqual([]);
  await userEvent.click(await screen.findByRole("button", { name: action }));
  await waitFor(() => expect(effects).toEqual(expected));
});

it("keeps the service running when saving before quit fails", async () => {
  const { request, effects } = fixture(true);
  request();
  await userEvent.click(await screen.findByRole("button", { name: "Save and leave" }));
  expect(await screen.findByText("Save failed")).toBeInTheDocument();
  expect(effects).toEqual(["save"]);
});

it("allows a clean management page to quit without a discard dialog", () => {
  const { request, effects } = fixture(false, false);
  request();
  expect(effects).toEqual(["quit"]);
});
