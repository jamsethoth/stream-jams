import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ManagementApi } from "../management-api.js";
import { SettingsPanel } from "./SettingsPanel.js";

describe("SettingsPanel", () => {
  it("loads and saves moderation blocked terms and URL stripping controls", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();

    render(<SettingsPanel managementApi={managementApi} />);

    const panel = screen.getByRole("region", { name: "Settings" });
    expect(await within(panel).findByLabelText("Blocked terms")).toHaveValue("spoiler\nhate");
    expect(within(panel).getByLabelText("Strip rendered URLs")).not.toBeChecked();
    expect(within(panel).getByLabelText("Strip TTS URLs")).toBeChecked();

    await user.clear(within(panel).getByLabelText("Blocked terms"));
    await user.type(within(panel).getByLabelText("Blocked terms"), "alpha\nbeta\nALPHA");
    await user.click(within(panel).getByLabelText("Strip rendered URLs"));
    await user.click(within(panel).getByLabelText("Strip TTS URLs"));
    await user.click(within(panel).getByRole("button", { name: "Save moderation settings" }));

    expect(managementApi.updateModerationSettings).toHaveBeenCalledWith({
      renderedText: {
        maxLength: 240,
        blockedTerms: ["alpha", "beta"],
        stripUrls: true
      },
      ttsText: {
        maxLength: 180,
        blockedTerms: ["alpha", "beta"],
        stripUrls: false
      }
    });
  });
});

function createManagementApi(): Pick<
  ManagementApi,
  "getServerConfig" | "updateServerConfig" | "getModerationSettings" | "updateModerationSettings"
> {
  return {
    getServerConfig: vi.fn(async () => ({
      host: "127.0.0.1",
      port: 39187
    })),
    updateServerConfig: vi.fn(async (input) => input),
    getModerationSettings: vi.fn(async () => ({
      renderedText: {
        maxLength: 240,
        blockedTerms: ["spoiler", "hate"],
        stripUrls: false
      },
      ttsText: {
        maxLength: 180,
        blockedTerms: ["spoiler", "hate"],
        stripUrls: true
      }
    })),
    updateModerationSettings: vi.fn(async (input) => input)
  };
}
