export class RuntimeMaintenanceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeMaintenanceUnavailableError";
  }
}

export class RuntimeMaintenanceGate {
  #maintenanceActive = false;
  #activeIntakeCount = 0;

  get activeIntakeCount(): number {
    return this.#activeIntakeCount;
  }

  async runIntake<T>(work: () => Promise<T>): Promise<T> {
    if (this.#maintenanceActive) {
      throw new RuntimeMaintenanceUnavailableError("Configuration maintenance is active; event intake is temporarily blocked.");
    }
    this.#activeIntakeCount += 1;
    try {
      return await work();
    } finally {
      this.#activeIntakeCount -= 1;
    }
  }

  async runMaintenance<T>(work: () => Promise<T>): Promise<T> {
    if (this.#maintenanceActive || this.#activeIntakeCount > 0) {
      throw new RuntimeMaintenanceUnavailableError("Configuration maintenance cannot start while event intake is active.");
    }
    this.#maintenanceActive = true;
    try {
      return await work();
    } finally {
      this.#maintenanceActive = false;
    }
  }
}
