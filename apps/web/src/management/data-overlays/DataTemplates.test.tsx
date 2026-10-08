import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderManagement } from "../../test-support/render-management.js";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";
import { DataTemplatePicker } from "./DataTemplatePicker.js";
import { SaveDataTemplateDialog } from "./SaveDataTemplateDialog.js";
import { DataCanvasEditor } from "./DataCanvasEditor.js";
import { createTwitchDataFixture } from "./twitch-data-source-fixtures.js";
import { createDataTemplateFixture, dataTemplateFixture } from "./data-template-fixtures.js";
import { dataPreviewFixture } from "./data-preview-fixtures.js";
import { createDataManagementFixture } from "./data-management-fixtures.js";
afterEach(cleanup);
const empty = { revision: 0, values: [], goals: [], resetGroups: [], pinnedValueIds: [], canvases: [] };
describe("Data templates", () => {
  it("creates a goal and integer atomically from an empty catalog, retaining configuration after failure", async () => {
    const api = createDataTemplateFixture(); api.instantiate = vi.fn().mockRejectedValueOnce(new Error("Name exists. Choose another name.")).mockResolvedValueOnce(dataPreviewFixture()); const onApplied = vi.fn(); const user = userEvent.setup();
    renderManagement(<DataTemplatePicker api={api} state={empty} onApplied={onApplied} onCancel={() => undefined} />);
    await user.selectOptions(await screen.findByLabelText("Template"), "sample-template");
    await user.clear(screen.getByRole("spinbutton", { name: "Session initial value" })); await user.type(screen.getByRole("spinbutton", { name: "Session initial value" }), "17");
    await user.selectOptions(screen.getByLabelText("Session goal mode"), "saved-baseline");
    await user.click(screen.getByRole("button", { name: "Create disabled canvas" }));
    await screen.findByRole("alert"); expect(screen.getByRole("spinbutton", { name: "Session initial value" })).toHaveValue(17); expect(onApplied).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Create disabled canvas" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
    expect(api.instantiate).toHaveBeenLastCalledWith("sample-template", expect.objectContaining({ enabled: false, outputs: { browser: true, desktop: false }, mappings: [{ slotId: "slot", mapping: { kind: "new-goal", value: { kind: "new", definition: { name: "Session", kind: "integer", resetDefault: 17, resetGroupId: null } }, goal: { name: "Session goal", mode: "saved-baseline", additionalAmount: 100 } } }] }));
  });
  it("filters incompatible types and maps an existing value without changing it", async () => {
    const state = dataPreviewFixture(); const template = dataTemplateFixture("value"); const api = createDataTemplateFixture([template]); api.instantiate = vi.fn(api.instantiate); const user = userEvent.setup();
    renderManagement(<DataTemplatePicker api={api} state={state} onApplied={() => undefined} onCancel={() => undefined} />);
    await user.selectOptions(await screen.findByLabelText("Template"), template.id);
    const select = screen.getByLabelText("Map Count"); expect(within(select).queryByRole("option", { name: state.values.find(value => value.kind === "text")!.name })).not.toBeInTheDocument();
    const value = state.values.find(value => value.kind === "integer")!; await user.selectOptions(select, `value:${value.id}`); await user.click(screen.getByRole("button", { name: "Create disabled canvas" }));
    expect(api.instantiate).toHaveBeenCalledWith(template.id, expect.objectContaining({ mappings: [{ slotId: "slot", mapping: { kind: "value", valueId: value.id } }] })); expect(value.content).toBe(40);
  });
  it("requires provider mappings and offers configure guidance without making a manual substitute", async () => {
    const template = dataTemplateFixture("value"); template.slots[0]!.requiredSource = { provider: "twitch", kind: "follower-total" }; const api = createDataTemplateFixture([template]); const user = userEvent.setup();
    renderManagement(<DataTemplatePicker api={api} twitchSourcesApi={createTwitchDataFixture()} state={dataPreviewFixture()} onApplied={() => undefined} onCancel={() => undefined} />);
    await user.selectOptions(await screen.findByLabelText("Template"), template.id);
    expect(screen.getByRole("button", { name: "Create disabled canvas" })).toBeDisabled(); expect(screen.getByRole("link", { name: "Data" })).toHaveAttribute("href", "/manage/data"); expect(screen.queryByLabelText("Count initial value")).not.toBeInTheDocument();
  });
  it("saves a selection and replaces a user template only through an explicit submit", async () => {
    const template = { ...dataTemplateFixture(), id: "user-template", origin: "user" as const }; const api = createDataTemplateFixture([template]); api.save = vi.fn(api.save); const canvas = dataPreviewFixture().canvases[0]!; const user = userEvent.setup();
    renderManagement(<SaveDataTemplateDialog api={api} canvas={canvas} elementIds={[canvas.elements[0]!.id]} onSaved={() => undefined} onCancel={() => undefined} />);
    await waitFor(() => expect(within(screen.getByLabelText("Template destination")).getByRole("option", { name: "Replace Sample goal" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Template destination"), template.id); expect(api.save).not.toHaveBeenCalled(); await user.click(screen.getByRole("button", { name: "Replace saved template" }));
    expect(api.save).toHaveBeenCalledWith(template.id, { name: template.name, canvasId: canvas.id, elementIds: [canvas.elements[0]!.id] });
  });
  it("protects dirty canvas before insertion and does not save when review is canceled", async () => {
    const state = dataPreviewFixture(); const api = createDataManagementFixture(state); api.saveCanvas = vi.fn(api.saveCanvas); const templates = createDataTemplateFixture(); templates.insert = vi.fn(templates.insert); const assetApi = createStoryAssetApi(); assetApi.listAssets = async () => []; const user = userEvent.setup();
    renderManagement(<DataCanvasEditor canvas={state.canvases[0]!} state={state} api={api} templateApi={templates} assetApi={assetApi} managementApi={createStoryManagementApi()} onBack={() => undefined} onSaved={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Add rectangle" })); await user.click(screen.getByRole("button", { name: "Insert template" })); await screen.findByText("Save canvas before using templates"); await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.saveCanvas).not.toHaveBeenCalled(); expect(templates.insert).not.toHaveBeenCalled(); expect(screen.getByText("5 / 100 elements")).toBeInTheDocument();
  });
  it("reports an unavailable template image with its original identity and cause without writing live state", async () => {
    const template = dataTemplateFixture("value"); template.elements.push({ id: "image", kind: "image", assetId: "retired-image", fit: "contain", order: 1, x: 0, y: 100, width: 80, height: 80, visible: true, stalePolicy: "retain-last" });
    const api = createDataTemplateFixture([template]); api.instantiate = vi.fn(api.instantiate); const assets = createStoryAssetApi(); assets.getAssetFile = async () => { throw new Error("Image metadata removed. Choose a registered image."); }; const user = userEvent.setup();
    renderManagement(<DataTemplatePicker api={api} assetApi={assets} state={empty} onApplied={() => undefined} onCancel={() => undefined} />);
    await user.selectOptions(await screen.findByLabelText("Template"), template.id);
    expect(await screen.findByRole("status")).toHaveTextContent("retired-image: Image metadata removed"); expect(api.instantiate).not.toHaveBeenCalled();
  });
  it("fits an offset template sample to its content while preserving original element geometry", async () => {
    const template = dataTemplateFixture("value"); template.elements[0]!.x = 1000; template.elements[0]!.y = 600; const api = createDataTemplateFixture([template]); const user = userEvent.setup();
    renderManagement(<DataTemplatePicker api={api} state={empty} onApplied={() => undefined} onCancel={() => undefined} />);
    await user.selectOptions(await screen.findByLabelText("Template"), template.id);
    const region = screen.getByRole("region", { name: "Template sample preview" }); const sample = within(region).getByText("42");
    expect(sample).toHaveStyle({ left: "1000px", top: "600px" });
    const viewport = region.querySelector("div"); expect(viewport).toHaveStyle({ aspectRatio: "400 / 80" }); expect(viewport?.firstElementChild).toHaveStyle({ transform: "scale(0.8) translate(-1000px, -600px)" });
    expect(template.elements[0]).toMatchObject({ x: 1000, y: 600, width: 400, height: 80 });
  });
  it("saves the explicitly checked layer selection without changing canvas layout", async () => {
    const state = dataPreviewFixture(); const api = createDataManagementFixture(state); api.saveCanvas = vi.fn(api.saveCanvas); const templates = createDataTemplateFixture(); templates.save = vi.fn(templates.save); const assets = createStoryAssetApi(); assets.listAssets = async () => []; const user = userEvent.setup();
    renderManagement(<DataCanvasEditor canvas={state.canvases[0]!} state={state} api={api} templateApi={templates} assetApi={assets} managementApi={createStoryManagementApi()} onBack={() => undefined} onSaved={() => undefined} />);
    const choices = screen.getAllByRole("checkbox", { name: /^Include/u }); await user.click(choices[0]!); await user.click(choices[1]!); await user.click(screen.getByRole("button", { name: "Save selection as template" }));
    await user.click(await screen.findByRole("button", { name: "Save template" }));
    expect(templates.save).toHaveBeenCalledWith(null, expect.objectContaining({ canvasId: state.canvases[0]!.id, elementIds: state.canvases[0]!.elements.slice(0, 2).map(element => element.id) })); expect(api.saveCanvas).not.toHaveBeenCalled();
  });
});
