import { createServer } from "node:net";

export interface PortAvailabilityChecker {
  isPortAvailable(host: "127.0.0.1", port: number): Promise<boolean>;
}

export interface SuggestedPortOptions {
  readonly host: "127.0.0.1";
  readonly preferredPort: number;
  readonly count?: number;
  readonly maxPort?: number;
  readonly portAvailability: PortAvailabilityChecker;
}

export async function findSuggestedPorts(options: SuggestedPortOptions): Promise<number[]> {
  const count = options.count ?? 3;
  const maxPort = options.maxPort ?? 65_535;
  const suggestions: number[] = [];

  for (let port = options.preferredPort + 1; port <= maxPort && suggestions.length < count; port += 1) {
    if (await options.portAvailability.isPortAvailable(options.host, port)) {
      suggestions.push(port);
    }
  }

  return suggestions;
}

/** Checks real localhost TCP port availability by briefly attempting to bind a socket. */
export class NodePortAvailabilityChecker implements PortAvailabilityChecker {
  async isPortAvailable(host: "127.0.0.1", port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();

      server.once("error", () => {
        resolve(false);
      });
      server.once("listening", () => {
        server.close(() => {
          resolve(true);
        });
      });
      server.listen({ host, port });
    });
  }
}
