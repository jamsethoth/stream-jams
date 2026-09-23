import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { AssetApi } from "../../assets/asset-api.js";
import {
  createAlertPreviewController,
  type AlertPreviewFailure,
  type AlertPreviewStartInput,
  type AlertPreviewState
} from "./alert-preview-controller.js";

export interface UseAlertPreviewOptions {
  readonly assetApi: Pick<AssetApi, "getAssetFile">;
  readonly visualAssetMediaTypes: Readonly<Record<string, "image" | "gif" | "video">>;
  readonly assetDurations: Readonly<Record<string, number | null>>;
  readonly onError: (failure: AlertPreviewFailure) => void;
}

export interface AlertPreviewView extends AlertPreviewState {
  start(input: AlertPreviewStartInput): Promise<void>;
  play(): void;
  pause(): void;
  seek(elapsedMs: number): void;
  stop(): void;
}

export function useAlertPreview(options: UseAlertPreviewOptions): AlertPreviewView {
  const mediaTypesRef = useRef(options.visualAssetMediaTypes);
  const durationsRef = useRef(options.assetDurations);
  const onErrorRef = useRef(options.onError);
  const lifecycleRef = useRef(new Map<object, symbol>());
  mediaTypesRef.current = options.visualAssetMediaTypes;
  durationsRef.current = options.assetDurations;
  onErrorRef.current = options.onError;

  const controller = useMemo(() => createAlertPreviewController({
    getAssetFile: (assetId) => options.assetApi.getAssetFile(assetId),
    getVisualAssetMediaTypes: () => mediaTypesRef.current,
    getAssetDurations: () => durationsRef.current,
    onError: (failure) => onErrorRef.current(failure)
  }), [options.assetApi]);

  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    const lease = Symbol("alert-preview-controller");
    lifecycle.set(controller, lease);
    return () => {
      queueMicrotask(() => {
        if (lifecycle.get(controller) !== lease) return;
        lifecycle.delete(controller);
        controller.dispose();
      });
    };
  }, [controller]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  return useMemo(() => ({
    ...state,
    start: controller.start,
    play: controller.play,
    pause: controller.pause,
    seek: controller.seek,
    stop: controller.stop
  }), [controller, state]);
}
