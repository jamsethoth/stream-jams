import type { OverlayInstruction } from "@stream-jams/core";

export interface OverlayPlaybackInstructionSink {
  preparePlaybackInstruction?(instruction: OverlayInstruction): Promise<{ readonly deliveredClientIds: readonly string[]; start(startsAtEpochMs: number): void }>;
  deliverPlaybackInstruction(instruction: OverlayInstruction): { readonly deliveredClientIds: readonly string[] } | void;
  setPlaybackMuted(muted: boolean): void;
  setModuleMutes(state: import("@stream-jams/core").ModuleMuteState): void;
  stopPlaybackInstructions?(instructionIds: readonly string[]): void;
}

export interface DesktopVisualPlaybackSink {
  prepare?(occurrenceId: string, instructions: readonly OverlayInstruction[]): Promise<{ start(startsAtEpochMs: number): Promise<void> }>;
  play(occurrenceId: string, instructions: readonly OverlayInstruction[], startsAtEpochMs: number): Promise<void>;
  stop(occurrenceId: string): Promise<void>;
  close(): Promise<void>;
}
