import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { TwitchDataSources } from "./TwitchDataSources.js";
import { createTwitchDataFixture, twitchDataStatus } from "./twitch-data-source-fixtures.js";
import { ManagementHttpError } from "../management-http-client.js";
const meta = { title: "Management/Data/Twitch Sources", component: TwitchDataSources, tags: ["twitch-data-sources"], args: { api: createTwitchDataFixture(), onCreated: () => undefined } } satisfies Meta<typeof TwitchDataSources>;
export default meta;
type Story = StoryObj<typeof meta>;
let expectedFailureLogged = false;
export const ExplicitFollowerCreation: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.type(await canvas.findByRole("textbox", { name: "Follower value name" }), "Community followers");
  await userEvent.click(canvas.getByRole("button", { name: "Create follower value" }));
  await expect(await canvas.findByText(/Follower value created/u)).toBeVisible();
  await expect(canvas.getByRole("textbox", { name: "Follower value name" })).toHaveValue("");
} };
export const Current: Story = { args: { api: createTwitchDataFixture(twitchDataStatus("current")) } };
export const Stale: Story = { args: { api: createTwitchDataFixture(twitchDataStatus("stale")) } };
export const AccountChanged: Story = { args: { api: createTwitchDataFixture(twitchDataStatus("invalid")) } };
export const Disconnected: Story = { args: { api: createTwitchDataFixture(twitchDataStatus("disconnected", "disconnected")) }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await canvas.findByRole("textbox", { name: "Follower value name" });
  await userEvent.type(canvas.getByRole("textbox", { name: "Follower value name" }), "Followers");
  await expect(canvas.getByRole("button", { name: "Create follower value" })).toBeDisabled();
  await expect(canvas.getByRole("link", { name: "Connect Twitch in Event sources" })).toHaveAttribute("href", "/manage/event-sources");
} };
export const OptionalGoalScopeMissing: Story = { args: { api: createTwitchDataFixture(twitchDataStatus("current", "reauthorization-required")) } };
export const CreationFailure: Story = { beforeEach: () => {
  expectedFailureLogged = false;
  const original = console.error;
  // Consume only the diagnostic deliberately produced by this failure fixture.
  // Unexpected browser errors continue to fail the console gate.
  console.error = (...args: unknown[]) => {
    if (args[0] === "[source-story-reference] Follower value was not created" && args[1] instanceof ManagementHttpError) { expectedFailureLogged = true; return; }
    original(...args);
  };
  return () => { console.error = original; };
}, args: { api: { ...createTwitchDataFixture(), createFollowers: async () => { throw new ManagementHttpError("Twitch connection unavailable. Reconnect and retry.", "INVALID_DATA_REQUEST", "source-story-reference", null, [], [], 400); } } }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.type(await canvas.findByRole("textbox", { name: "Follower value name" }), "Followers");
  await userEvent.click(canvas.getByRole("button", { name: "Create follower value" }));
  await expect(await canvas.findByRole("alert")).toHaveTextContent("not created");
  await expect(canvas.getByRole("textbox", { name: "Follower value name" })).toHaveValue("Followers");
  await expect(expectedFailureLogged).toBe(true);
} };
export const Loading: Story = { args: { api: { ...createTwitchDataFixture(), getStatus: () => new Promise(() => {}) } } };
export const Unavailable: Story = { args: { api: { ...createTwitchDataFixture(), getStatus: async () => { throw new Error("Local service unavailable."); } } } };
