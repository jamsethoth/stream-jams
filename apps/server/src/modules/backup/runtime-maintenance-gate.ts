export class RuntimeMaintenanceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeMaintenanceUnavailableError";
  }
}

export class RuntimeMaintenanceGate {
  #maintenanceActive = false;
  #activeIntakeCount = 0;
  #stopping = false;
  #drained: Array<() => void> = [];

  /** Reject new work immediately, then drain work which already owns runtime resources. */
  async stop(): Promise<void> {
    this.#stopping = true;
    if (this.#activeIntakeCount === 0 && !this.#maintenanceActive) return;
    await new Promise<void>((resolve) => this.#drained.push(resolve));
  }

  #notifyDrained(): void {
    if (this.#activeIntakeCount === 0 && !this.#maintenanceActive) {
      for (const resolve of this.#drained.splice(0)) resolve();
    }
  }

  get activeIntakeCount(): number {
    return this.#activeIntakeCount;
  }

  async runIntake<T>(work: () => Promise<T>): Promise<T> {
    if (this.#maintenanceActive || this.#stopping) {
      throw new RuntimeMaintenanceUnavailableError("Configuration maintenance is active; event intake is temporarily blocked.");
    }
    this.#activeIntakeCount += 1;
    try {
      return await work();
    } finally {
      this.#activeIntakeCount -= 1;
      this.#notifyDrained();
    }
  }

  runConfigurationMutation<T>(work: () => T): T {
    if (this.#maintenanceActive || this.#stopping) {
      throw new RuntimeMaintenanceUnavailableError(
        "Configuration maintenance is active; configuration changes are temporarily blocked."
      );
    }

    return work();
  }

  async runMaintenance<T>(work: () => Promise<T>): Promise<T> {
    if (this.#maintenanceActive || this.#stopping || this.#activeIntakeCount > 0) {
      throw new RuntimeMaintenanceUnavailableError("Configuration maintenance cannot start while event intake is active.");
    }
    this.#maintenanceActive = true;
    try {
      return await work();
    } finally {
      this.#maintenanceActive = false;
      this.#notifyDrained();
    }
  }
}
