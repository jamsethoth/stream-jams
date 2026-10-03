import type { Meta, StoryObj } from "@storybook/react-vite";
import { compatibilityAlertTextStyle, createDefaultTextWarp } from "@stream-jams/core";
import { AlertTextContent } from "./AlertTextContent.js";
const meta: Meta<typeof AlertTextContent> = { title: "Overlay/AlertTextContent", component: AlertTextContent, args: { text: "Welcome 世界 — مرحبا", width: 640, height: 240, textStyle: { ...compatibilityAlertTextStyle, fontSizePx: 48, italic: true, underline: true, letterSpacingPx: 2, outline: { color: "#008080FF", widthPx: 3 } } }, decorators: [(Story) => <div style={{ background: "#20242c", width: 700, height: 320 }}><Story /></div>] };
export default meta;
type Story = StoryObj<typeof meta>;
export const Styled: Story = {};
const warp = createDefaultTextWarp();
export const Warped: Story = { args: { textStyle: { ...meta.args!.textStyle!, warp: { ...warp, points: warp.points.map((point, index) => ({ ...point, y: point.y + (index % 3 === 1 ? .18 : 0) })) } } } };
