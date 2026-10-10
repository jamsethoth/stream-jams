import { videosPlacementGeometry, type VideosLayout } from "@stream-jams/core";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import "../overlay.css";

/*
 * Placement shared by every Videos output and the management preview: the saved box on the
 * 1920 x 1080 canvas, holding the largest 16:9 picture that leaves room for the caption,
 * anchored to the box's bottom center.
 */

type BoxAttributes = Omit<HTMLAttributes<HTMLDivElement>, "style" | "className" | "children"> & Record<`data-${string}`, string | undefined>;

export function VideoBox({ layout, children, ...attributes }: { readonly layout: VideosLayout; readonly children: ReactNode } & BoxAttributes) {
  const { scale, gap } = videosPlacementGeometry(layout);
  const style = { left: layout.x, top: layout.y, width: layout.width, height: layout.height, gap, "--video-scale": scale } as CSSProperties;
  return <div className="video-overlay" style={style} {...attributes}>{children}</div>;
}

/** The picture's size in canvas pixels; it stays the same with or without a caption. */
export function videoFrameStyle(layout: VideosLayout): CSSProperties {
  // A fresh object of exactly width and height on every call.
  return videosPlacementGeometry(layout).frame;
}

/** Title and requester under the picture, matching its width. Renders nothing without either. */
export function VideoCaption({ layout, title, requester }: { readonly layout: VideosLayout; readonly title: string | null; readonly requester: string | null }) {
  if (title === null && requester === null) return null;
  return (
    <div className="video-overlay__context" style={{ width: videosPlacementGeometry(layout).frame.width }}>
      {title === null ? null : <span className="video-overlay__title">{title}</span>}
      {requester === null ? null : <span className="video-overlay__requester">Requested by {requester}</span>}
    </div>
  );
}
