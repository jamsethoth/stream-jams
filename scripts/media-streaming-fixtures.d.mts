export type MediaFixture = string | { readonly kind: "generated-png"; readonly width: number; readonly height: number };
export interface FixtureInput {
  readonly bytes: Buffer;
  readonly name: string;
  readonly mimeType: string;
  readonly fixture: MediaFixture;
}
export const mediaFixtureManifest: Readonly<Record<string, { readonly sizeBytes: number; readonly mimeType: string; readonly sha256: string }>>;
export function validateMediaFixture(input: FixtureInput): void;
export function validateFixtureDestination(ownedBase: string, destination?: string): string;
export function uploadMediaFixture(input: FixtureInput & { readonly ownedBase: string; readonly destination?: string; readonly headers: Readonly<Record<string, string>> }): Promise<Response>;
