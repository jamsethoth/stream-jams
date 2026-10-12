import { alertFontPresets, boxShadowCss, videosPlacementGeometry, type VideosLayout } from "@stream-jams/core";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import "../overlay.css";

/*
 * Shared saved content box, positioned/scaled inside the desktop scene or projected at browser-local
 * 0/0/1, holding the largest 16:9 picture that leaves room for the caption,
 * anchored to the box's bottom center.
 */

type BoxAttributes = Omit<HTMLAttributes<HTMLDivElement>, "style" | "className" | "children"> & Record<`data-${string}`, string | undefined>;

export function VideoBox({ layout, children, ...attributes }: { readonly layout: VideosLayout; readonly children: ReactNode } & BoxAttributes) {
  const { scale, gap } = videosPlacementGeometry(layout);
  const style = { left: layout.desktopPlacement.x, top: layout.desktopPlacement.y, width: layout.content.width, height: layout.content.height,
    transform: `scale(${layout.desktopPlacement.scale})`, transformOrigin: "top left", gap, "--video-scale": scale } as CSSProperties;
  return <div className="video-overlay" style={style} {...attributes}>{children}</div>;
}

/** The picture's size in canvas pixels (the same with or without a caption) and any saved shadow. */
export function videoFrameStyle(layout: VideosLayout): CSSProperties {
  const { frame } = videosPlacementGeometry(layout);
  return layout.shadow === undefined ? frame : { ...frame, boxShadow: boxShadowCss(layout.shadow) };
}

/** Title, then channel and requester, under the picture, matching its width. Renders nothing without any. */
export function VideoCaption({ layout, title, channel = null, requester }: {
  readonly layout: VideosLayout; readonly title: string | null; readonly channel?: string | null | undefined; readonly requester: string | null;
}) {
  const byline = [channel, requester === null ? null : `Requested by ${requester}`].filter(part => part !== null).join(" · ");
  if (title === null && byline === "") return null;
  const fontFamily = alertFontPresets.find(preset => preset.id === layout.captionFont)?.fontFamily;
  return (
    <div className="video-overlay__context" style={{ width: videosPlacementGeometry(layout).frame.width, ...(fontFamily === undefined ? {} : { fontFamily }) }}>
      {title === null ? null : <span className="video-overlay__title">{title}</span>}
      {byline === "" ? null : <span className="video-overlay__requester">{byline}</span>}
    </div>
  );
}
