export interface AppVersion {
  readonly name: "stream-jams";
  readonly version: string;
}

export function createAppVersion(version = "0.0.0"): AppVersion {
  return {
    name: "stream-jams",
    version
  };
}
