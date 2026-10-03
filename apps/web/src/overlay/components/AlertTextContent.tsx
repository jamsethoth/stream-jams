import { useEffect, useRef, useState } from "react";
import { alertFontPresets, compatibilityAlertTextBoxStyle, type AlertTextBoxStyle, type AlertTextStyle } from "@stream-jams/core";
import { alertTextLayerStyle } from "./alert-text-style.js";
import { acquireAlertFont, type FontLoader } from "./alert-font.js";
import { rasterizeAlertText, renderWarpedText } from "./alert-text-renderer.js";
export interface AlertTextContentProps {
  readonly text: string;
  readonly textStyle: AlertTextStyle;
  readonly boxStyle?: AlertTextBoxStyle;
  /** Rendered CSS pixels; scale applies only to authored typography/box properties. */
  readonly width: number;
  readonly height: number;
  readonly scale?: number;
  readonly loadFont?: FontLoader;
  readonly onReady?: () => void;
  readonly onError?: (error: unknown) => void;
}
export function AlertTextContent({ text, textStyle, boxStyle = compatibilityAlertTextBoxStyle, width, height, scale = 1, loadFont, onReady, onError }: AlertTextContentProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  const [font, setFont] = useState<{ id: string; loader: FontLoader; family: string } | null>(null);
  const [renderedIdentity, setRenderedIdentity] = useState<string | null>(null);
  const fontId = textStyle.fontAssetId;
  const identity = JSON.stringify([text, textStyle, boxStyle, width, height, scale]);
  const style = alertTextLayerStyle({ textStyle, boxStyle, scale });
  const fontReady = fontId == null || (font?.id === fontId && font.loader === loadFont);
  const family = fontId == null ? alertFontPresets.find(value => value.id === textStyle.fontPreset)?.fontFamily : fontReady ? font?.family : undefined;
  useEffect(() => {
    if (fontId == null) return;
    let active = true;
    if (loadFont === undefined) { callbacks.current.onError?.(new Error("The selected font is unavailable. Select an available font and retry.")); return; }
    const acquired = acquireAlertFont(fontId, loadFont);
    const timeout = window.setTimeout(() => {
      if (active) { active = false; acquired.release(); callbacks.current.onError?.(new Error("Font preparation timed out. Check the font and retry.")); }
    }, 5000);
    void acquired.ready.then(family => {
      if (active) { clearTimeout(timeout); setFont({ id: fontId, loader: loadFont, family }); }
    }, (error: unknown) => {
      if (active) { active = false; clearTimeout(timeout); acquired.release(); callbacks.current.onError?.(error); }
    });
    return () => { active = false; clearTimeout(timeout); acquired.release(); };
  }, [fontId, loadFont]);
  useEffect(() => {
    if (style === null) { callbacks.current.onError?.(new Error("Alert text style is invalid.")); return; }
    if (family === undefined || !fontReady) return;
    if (textStyle.warp == null) { callbacks.current.onReady?.(); return; }
    let active = true;
    const timeout = window.setTimeout(() => { if (active) { active = false; callbacks.current.onError?.(new Error("Text preparation timed out. Check the warp and retry.")); } }, 5000);
    const prepare = async () => {
      const output = document.createElement("canvas");
      const bounds = await renderWarpedText(output, () => rasterizeAlertText(text, textStyle, boxStyle, family, width, height, scale), textStyle, width, height, () => active);
      if (!active || canvas.current === null || bounds === null) return;
      const target = canvas.current;
      target.width = output.width; target.height = output.height;
      target.style.width = `${bounds.width}px`; target.style.height = `${bounds.height}px`;
      target.style.left = `${bounds.left}px`; target.style.top = `${bounds.top}px`;
      const context = target.getContext("2d");
      if (context === null) throw new Error("Text canvas is unavailable.");
      context.drawImage(output, 0, 0);
      clearTimeout(timeout); setRenderedIdentity(identity); callbacks.current.onReady?.();
    };
    void prepare().catch((error: unknown) => { if (active) { active = false; clearTimeout(timeout); callbacks.current.onError?.(error); } });
    return () => { active = false; clearTimeout(timeout); };
    // All authored drawing inputs are represented by identity.
  }, [identity, family, fontReady]);
  if (style === null) return null;
  const ready = fontReady && (textStyle.warp == null || renderedIdentity === identity);
  return <div className="alert-text-layer" dir="auto" style={{ ...style, position: "relative", width, height, visibility: ready ? "inherit" : "hidden", ...(family === undefined ? {} : { fontFamily: family }), ...(textStyle.warp == null ? {} : { padding: 0 }) }}>
    {textStyle.warp == null ? text : <canvas aria-label={text} role="img" ref={canvas} style={{ display: "block", position: "absolute", left: 0, top: 0 }} />}
  </div>;
}
