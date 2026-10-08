import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { renderManagement } from "../../test-support/render-management.js";
import { ManagementHttpError } from "../management-http-client.js";
import { TwitchDataSources } from "./TwitchDataSources.js";
import { createTwitchDataFixture, twitchDataStatus } from "./twitch-data-source-fixtures.js";
import type { TwitchDataSourceStatus } from "@stream-jams/core";
afterEach(() => { cleanup(); vi.useRealTimers(); });
it.each(["current", "stale", "invalid", "disconnected", "unconfigured"] as const)("shows actionable follower %s status and blocked goals", async follower => {
  renderManagement(<TwitchDataSources api={createTwitchDataFixture(twitchDataStatus(follower))} onCreated={() => undefined} />);
  expect(await screen.findByText(/Follower total:/u)).toHaveTextContent(follower === "current" ? "Current" : follower === "stale" ? "Stale" : follower === "invalid" ? "Awaiting a valid total" : follower === "disconnected" ? "Disconnected" : "Not configured");
  expect(screen.getByText(/Creator Goals:/u)).toHaveTextContent("central event bus");
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByRole("link")).toHaveAttribute("href", "/manage/event-sources");
});
it("keeps optional missing goal scope separate from alert availability", async () => {
  renderManagement(<TwitchDataSources api={createTwitchDataFixture(twitchDataStatus("current", "reauthorization-required"))} onCreated={() => undefined} />);
  expect(await screen.findByText(/Creator Goals:/u)).toHaveTextContent("channel:read:goals");
  expect(screen.getByText(/Creator Goals:/u)).toHaveTextContent("Existing alert intake remains available");
});
it("creates explicitly, synchronously guards duplicates and returns the committed catalog", async () => {
  const fixture = createTwitchDataFixture(); let complete!: (value: Awaited<ReturnType<typeof fixture.createFollowers>>) => void;
  const createFollowers = vi.fn(() => new Promise<Awaited<ReturnType<typeof fixture.createFollowers>>>(resolve => { complete = resolve; }));
  const onCreated = vi.fn();
  renderManagement(<TwitchDataSources api={{ ...fixture, createFollowers }} onCreated={onCreated} />);
  await screen.findByRole("textbox", { name: "Follower value name" });
  fireEvent.change(screen.getByRole("textbox", { name: "Follower value name" }), { target: { value: "Followers" } });
  const form = screen.getByRole("form", { name: "Create Twitch follower value" });
  fireEvent.submit(form); fireEvent.submit(form); expect(createFollowers).toHaveBeenCalledOnce();
  const state = await fixture.createFollowers({ name: "Followers" });
  await act(async () => { complete(state); });
  expect(onCreated).toHaveBeenCalledWith(state); expect(screen.getByRole("textbox", { name: "Follower value name" })).toHaveValue("");
});
it("retains a failed or unauthorized create draft and reference for explicit retry", async () => {
  const user = userEvent.setup(); const createFollowers = vi.fn().mockRejectedValue(new ManagementHttpError("Connect Twitch and retry.", "UNAUTHORIZED", "source-ref", null, [], [], 401));
  renderManagement(<TwitchDataSources api={{ ...createTwitchDataFixture(), createFollowers }} onCreated={() => undefined} />);
  await user.type(await screen.findByRole("textbox", { name: "Follower value name" }), "My followers");
  await user.click(screen.getByRole("button", { name: "Create follower value" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("source-ref");
  expect(screen.getByRole("textbox", { name: "Follower value name" })).toHaveValue("My followers"); expect(createFollowers).toHaveBeenCalledOnce();
});
it("does not replace post-create status with a delayed pre-create poll, and preserves name drafts", async () => {
  vi.useFakeTimers(); let complete!: (value: TwitchDataSourceStatus) => void;
  const getStatus = vi.fn().mockResolvedValueOnce(twitchDataStatus()).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; })).mockResolvedValue(twitchDataStatus("current"));
  renderManagement(<TwitchDataSources api={{ ...createTwitchDataFixture(), getStatus }} onCreated={() => undefined} />);
  await act(async () => {}); fireEvent.change(screen.getByRole("textbox", { name: "Follower value name" }), { target: { value: "Followers" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByRole("textbox", { name: "Follower value name" })).toHaveValue("Followers");
  fireEvent.submit(screen.getByRole("form", { name: "Create Twitch follower value" })); await act(async () => {});
  await act(async () => { complete(twitchDataStatus("disconnected")); });
  expect(screen.getByText(/Follower total:/u)).toHaveTextContent("Current");
});
it("labels failed status refresh stale and prevents creation until refreshed", async () => {
  const getStatus = vi.fn().mockRejectedValue(new Error("offline"));
  renderManagement(<TwitchDataSources api={{ ...createTwitchDataFixture(), getStatus }} onCreated={() => undefined} />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("may be stale"));
});
