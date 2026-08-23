import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DirtyNavigationProvider } from "../../navigation/dirty-navigation.js";
import type {
  ManagementApi,
  ModerationPreviewInputView,
  ModerationPreviewResultView,
  ModerationSettingsView
} from "../../management-api.js";
import { AlertSafetyPage } from "./AlertSafetyPage.js";

afterEach(cleanup);

const savedSettings = {
  renderedText: { maxLength: 240, blockedTerms: ["spoiler"], stripUrls: false },
  ttsText: { maxLength: 180, blockedTerms: ["loud noise"], stripUrls: true }
} satisfies ModerationSettingsView;

describe("AlertSafetyPage", () => {
  it("loads both saved target policies and explains provider-owned safety", async () => {
    renderPage();

    expect(await screen.findByRole("group", { name: "Rendered text" })).toBeInTheDocument();
    expect(screen.getByLabelText("Rendered text maximum length")).toHaveValue(240);
    expect(screen.getByLabelText("Rendered text maximum length")).toHaveAttribute("min", "1");
    expect(screen.getByLabelText("Rendered text maximum length")).toHaveAttribute("max", "10000");
    expect(screen.getByLabelText("Rendered text maximum length")).toHaveAttribute("step", "1");
    expect(screen.getByLabelText("Rendered text blocked terms")).toHaveValue("spoiler");
    expect(screen.getByLabelText("Rendered text strip web links")).not.toBeChecked();
    expect(screen.getByLabelText("TTS text maximum length")).toHaveValue(180);
    expect(screen.getByLabelText("TTS text blocked terms")).toHaveValue("loud noise");
    expect(screen.getByLabelText("TTS text strip web links")).toBeChecked();
    expect(screen.getByRole("link", { name: "Review TTS provider settings" })).toHaveAttribute("href", "/manage/tts-providers");
    expect(screen.getByText(/connection, voice, rate, volume, and provider registration safety/i)).toBeInTheDocument();
  });

  it("previews normalized candidate policies without saving or mutating the draft", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.previewModeration).mockImplementation(async (input) => ({
      target: input.target,
      settings: {
        ...input.settings!,
        blockedTerms: input.target === "rendered" ? ["Alpha", "Beta term"] : ["TTS duplicate"]
      },
      text: input.target === "rendered" ? "[blocked] [link removed]" : "[blocked] sample",
      actions: input.target === "rendered"
        ? [{ type: "blocked-term-replaced", count: 2 }, { type: "url-stripped", count: 1 }]
        : [{ type: "max-length-truncated", maxLength: 180 }]
    }));
    renderPage(api);
    await screen.findByRole("group", { name: "Rendered text" });

    await user.clear(screen.getByLabelText("Rendered text blocked terms"));
    await user.type(screen.getByLabelText("Rendered text blocked terms"), "  Alpha  {enter}alpha{enter}{enter}Beta term  ");
    await user.clear(screen.getByLabelText("TTS text blocked terms"));
    await user.type(screen.getByLabelText("TTS text blocked terms"), "TTS duplicate{enter}tts duplicate");
    await user.clear(screen.getByLabelText("Moderation example"));
    await user.type(screen.getByLabelText("Moderation example"), "Alpha https://example.com long sample");
    await user.click(screen.getByRole("button", { name: "Preview example" }));

    expect(api.previewModeration).toHaveBeenCalledTimes(2);
    expect(api.previewModeration).toHaveBeenNthCalledWith(1, {
      target: "rendered",
      text: "Alpha https://example.com long sample",
      settings: { maxLength: 240, blockedTerms: ["Alpha", "alpha", "Beta term"], stripUrls: false }
    });
    expect(api.previewModeration).toHaveBeenNthCalledWith(2, {
      target: "tts",
      text: "Alpha https://example.com long sample",
      settings: { maxLength: 180, blockedTerms: ["TTS duplicate", "tts duplicate"], stripUrls: true }
    });
    expect(api.updateModerationSettings).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Rendered text blocked terms")).toHaveValue("  Alpha  \nalpha\n\nBeta term  ");
    expect(within(screen.getByRole("region", { name: "Rendered text preview" })).getByText("Alpha, Beta term")).toBeInTheDocument();
    expect(screen.getByText("[blocked] [link removed]")).toBeInTheDocument();
    expect(screen.getByText("Blocked terms replaced: 2")).toBeInTheDocument();
    expect(screen.getByText("Web links stripped: 1")).toBeInTheDocument();
    expect(screen.getByText("Truncated to 180 characters")).toBeInTheDocument();
  });

  it("keeps length and URL controls independent and saves the complete normalized response", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.updateModerationSettings).mockResolvedValue({
      renderedText: { maxLength: 320, blockedTerms: ["Alpha"], stripUrls: true },
      ttsText: { maxLength: 90, blockedTerms: ["Beta"], stripUrls: false }
    });
    renderPage(api);
    await screen.findByRole("group", { name: "Rendered text" });

    await replaceNumber(user, "Rendered text maximum length", "320");
    await replaceNumber(user, "TTS text maximum length", "90");
    await user.clear(screen.getByLabelText("Rendered text blocked terms"));
    await user.type(screen.getByLabelText("Rendered text blocked terms"), " Alpha {enter}alpha");
    await user.clear(screen.getByLabelText("TTS text blocked terms"));
    await user.type(screen.getByLabelText("TTS text blocked terms"), "Beta");
    await user.click(screen.getByLabelText("Rendered text strip web links"));
    await user.click(screen.getByLabelText("TTS text strip web links"));
    await user.click(screen.getByRole("button", { name: "Save safety settings" }));

    expect(api.updateModerationSettings).toHaveBeenCalledWith({
      renderedText: { maxLength: 320, blockedTerms: ["Alpha", "alpha"], stripUrls: true },
      ttsText: { maxLength: 90, blockedTerms: ["Beta"], stripUrls: false }
    });
    expect(screen.getByLabelText("Rendered text blocked terms")).toHaveValue("Alpha");
    expect(screen.getByRole("status")).toHaveTextContent("Safety settings saved");
    expect(screen.getByRole("button", { name: "Save safety settings" })).toBeDisabled();
  });

  it("reverts the full policy but leaves the session example unchanged", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("group", { name: "Rendered text" });
    await replaceNumber(user, "Rendered text maximum length", "50");
    await user.clear(screen.getByLabelText("Moderation example"));
    await user.type(screen.getByLabelText("Moderation example"), "Session example");
    await user.click(screen.getByRole("button", { name: "Revert changes" }));
    expect(screen.getByLabelText("Rendered text maximum length")).toHaveValue(240);
    expect(screen.getByLabelText("Moderation example")).toHaveValue("Session example");
  });

  it.each(["0", "10001", "1.5"])("blocks save and preview for invalid maximum length %s", async (value) => {
    const user = userEvent.setup();
    const api = createApi();
    renderPage(api);
    await screen.findByRole("group", { name: "Rendered text" });
    await replaceNumber(user, "Rendered text maximum length", value);
    await user.click(screen.getByRole("button", { name: "Preview example" }));
    await user.click(screen.getByRole("button", { name: "Save safety settings" }));
    expect(screen.getByText("Enter a whole number from 1 to 10000.")).toBeInTheDocument();
    expect(api.previewModeration).not.toHaveBeenCalled();
    expect(api.updateModerationSettings).not.toHaveBeenCalled();
  });

  it("preserves the draft and shows an actionable reference when save fails", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.updateModerationSettings).mockRejectedValue(new Error("Storage failed (err_moderation_42)"));
    renderPage(api);
    await screen.findByRole("group", { name: "Rendered text" });
    await replaceNumber(user, "Rendered text maximum length", "300");
    await user.click(screen.getByRole("button", { name: "Save safety settings" }));
    expect(screen.getByLabelText("Rendered text maximum length")).toHaveValue(300);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Safety settings were not saved");
    expect(alert).toHaveTextContent("err_moderation_42");
    expect(alert).toHaveTextContent("Try saving again");
  });

  it("prevents policy edits while a save response is pending", async () => {
    const user = userEvent.setup();
    const api = createApi();
    let resolveSave!: (value: ModerationSettingsView) => void;
    vi.mocked(api.updateModerationSettings).mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    renderPage(api);
    await screen.findByRole("group", { name: "Rendered text" });
    await replaceNumber(user, "Rendered text maximum length", "300");
    await user.click(screen.getByRole("button", { name: "Save safety settings" }));

    const maximum = screen.getByLabelText("Rendered text maximum length");
    expect(maximum).toBeDisabled();
    expect(screen.getByLabelText("Rendered text blocked terms")).toBeDisabled();
    expect(screen.getByLabelText("Rendered text strip web links")).toBeDisabled();
    await user.type(maximum, "1");
    expect(maximum).toHaveValue(300);

    resolveSave({ ...savedSettings, renderedText: { ...savedSettings.renderedText, maxLength: 300 } });
    expect(await screen.findByRole("status")).toHaveTextContent("Safety settings saved");
    expect(maximum).toBeEnabled();
    expect(maximum).toHaveValue(300);
  });

  it("shows a safe actionable preview failure without changing the draft", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.previewModeration).mockRejectedValue(new Error("Preview unavailable (ref_preview_8)"));
    renderPage(api);
    await screen.findByRole("group", { name: "Rendered text" });
    await replaceNumber(user, "Rendered text maximum length", "300");
    await user.click(screen.getByRole("button", { name: "Preview example" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The moderation example could not be previewed");
    expect(alert).toHaveTextContent("ref_preview_8");
    expect(screen.getByLabelText("Rendered text maximum length")).toHaveValue(300);
  });

  it("does not land an in-flight preview after the sample and candidate change", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const resolvers: Array<(result: ModerationPreviewResultView) => void> = [];
    vi.mocked(api.previewModeration).mockImplementation(() => new Promise((resolve) => {
      resolvers.push((result) => resolve(result));
    }));
    renderPage(api);
    await screen.findByRole("group", { name: "Rendered text" });
    const originalExample = (screen.getByLabelText("Moderation example") as HTMLTextAreaElement).value;
    await user.click(screen.getByRole("button", { name: "Preview example" }));
    await waitFor(() => expect(api.previewModeration).toHaveBeenCalledTimes(2));

    await replaceNumber(user, "Rendered text maximum length", "300");
    await user.clear(screen.getByLabelText("Moderation example"));
    await user.type(screen.getByLabelText("Moderation example"), "Changed while previewing");
    resolvers[0]!(previewResult("rendered", originalExample, savedSettings.renderedText));
    resolvers[1]!(previewResult("tts", originalExample, savedSettings.ttsText));

    await waitFor(() => expect(screen.getByRole("button", { name: "Preview example" })).toBeEnabled());
    expect(screen.queryByRole("region", { name: "Rendered text preview" })).not.toBeInTheDocument();
    expect(screen.queryByText(originalExample)).not.toBeInTheDocument();
  });

  it("clears successful results after candidate edits and keeps them cleared when the next preview fails", async () => {
    const user = userEvent.setup();
    const api = createApi();
    renderPage(api);
    await screen.findByRole("group", { name: "Rendered text" });
    await user.click(screen.getByRole("button", { name: "Preview example" }));
    expect(await screen.findByRole("region", { name: "Rendered text preview" })).toBeInTheDocument();

    await replaceNumber(user, "Rendered text maximum length", "300");
    expect(screen.queryByRole("region", { name: "Rendered text preview" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview example" }));
    expect(await screen.findByRole("region", { name: "Rendered text preview" })).toBeInTheDocument();

    vi.mocked(api.previewModeration).mockRejectedValue(new Error("Preview unavailable (ref_preview_after_success)"));
    await user.click(screen.getByRole("button", { name: "Preview example" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ref_preview_after_success");
    expect(screen.queryByRole("region", { name: "Rendered text preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "TTS text preview" })).not.toBeInTheDocument();
  });

  it("shows a blocking actionable initial-load failure", async () => {
    const api = createApi();
    vi.mocked(api.getModerationSettings).mockRejectedValue(new Error("Unavailable (ref_moderation_load)"));
    renderPage(api);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Alert safety settings could not be loaded");
    expect(alert).toHaveTextContent("ref_moderation_load");
    expect(screen.getByRole("button", { name: "Retry loading safety settings" })).toBeInTheDocument();
  });
});

function createApi(): Pick<ManagementApi, "getModerationSettings" | "updateModerationSettings" | "previewModeration"> {
  return {
    getModerationSettings: vi.fn(async () => savedSettings),
    updateModerationSettings: vi.fn(async (input) => input),
    previewModeration: vi.fn(async (input: ModerationPreviewInputView) => ({
      target: input.target,
      settings: input.settings!,
      text: input.text,
      actions: []
    }))
  };
}

function renderPage(api = createApi()) {
  return render(<DirtyNavigationProvider><AlertSafetyPage managementApi={api} /></DirtyNavigationProvider>);
}

async function replaceNumber(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
}

function previewResult(
  target: "rendered" | "tts",
  text: string,
  settings: ModerationSettingsView["renderedText"]
): ModerationPreviewResultView {
  return { target, text, settings, actions: [] };
}
