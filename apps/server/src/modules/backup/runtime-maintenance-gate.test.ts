import { describe, expect, it } from "vitest";
import { RuntimeMaintenanceGate, RuntimeMaintenanceUnavailableError } from "./runtime-maintenance-gate.js";

describe("RuntimeMaintenanceGate", () => {
  it("blocks new intake while maintenance is active", async () => {
    const gate = new RuntimeMaintenanceGate();
    let release!: () => void;
    const pending = gate.runMaintenance(() => new Promise<void>((resolve) => { release = resolve; }));

    await expect(gate.runIntake(async () => undefined)).rejects.toBeInstanceOf(RuntimeMaintenanceUnavailableError);
    release();
    await pending;
    await expect(gate.runIntake(async () => "accepted")).resolves.toBe("accepted");
  });

  it("refuses maintenance while intake is already being processed", async () => {
    const gate = new RuntimeMaintenanceGate();
    let release!: () => void;
    const intake = gate.runIntake(() => new Promise<void>((resolve) => { release = resolve; }));

    expect(gate.activeIntakeCount).toBe(1);
    await expect(gate.runMaintenance(async () => undefined)).rejects.toBeInstanceOf(RuntimeMaintenanceUnavailableError);
    release();
    await intake;
  });
});
