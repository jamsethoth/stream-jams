import type { DatabaseSync } from "node:sqlite";
import {
  actionableManagementErrorSchema,
  metadataSchema,
  registeredProviderViewSchema,
  secretRefSchema,
  ttsProviderSafetySettingsSchema,
  ttsVoiceSchema,
  type ProviderCapability,
  type RegisteredProviderView,
  type SecretRef,
  type TtsProviderSafetySettings,
  type TtsVoice
} from "@stream-jams/core";
import { runInTransaction } from "../db/database.js";

export interface ProviderRegistrationRecord {
  readonly provider: RegisteredProviderView;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly availableVoices: readonly TtsVoice[];
  readonly secretRef: SecretRef | null;
  readonly ttsSafety: TtsProviderSafetySettings | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProviderActivationRecordResult {
  readonly provider: ProviderRegistrationRecord;
  readonly replacedProviderId: string | null;
}

interface ProviderRegistrationRow {
  readonly id: unknown;
  readonly name: unknown;
  readonly kind: unknown;
  readonly capability: unknown;
  readonly non_secret_config_json: unknown;
  readonly secret_ref_json: unknown;
  readonly active: unknown;
  readonly connection_state: unknown;
  readonly intake_state: unknown;
  readonly validated_at: unknown;
  readonly error_json: unknown;
  readonly available_voices_json: unknown;
  readonly tts_safety_json: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

const providerColumns = `
  id, name, kind, capability, non_secret_config_json, secret_ref_json, active,
  connection_state, intake_state, validated_at, error_json, available_voices_json,
  tts_safety_json, created_at, updated_at
`;

export class SqliteProviderRegistrationRepository {
  readonly #connection: DatabaseSync;
  readonly #now: () => Date;

  constructor(connection: DatabaseSync, options: { readonly now?: () => Date } = {}) {
    this.#connection = connection;
    this.#now = options.now ?? (() => new Date());
  }

  async save(record: ProviderRegistrationRecord): Promise<ProviderRegistrationRecord> {
    const parsed = parseProviderRegistrationRecord(record);
    this.#connection
      .prepare(
        `INSERT INTO provider_registrations (
          id, name, kind, capability, non_secret_config_json, secret_ref_json, active,
          connection_state, intake_state, validated_at, error_json, available_voices_json,
          tts_safety_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          kind = excluded.kind,
          capability = excluded.capability,
          non_secret_config_json = excluded.non_secret_config_json,
          secret_ref_json = excluded.secret_ref_json,
          active = excluded.active,
          connection_state = excluded.connection_state,
          intake_state = excluded.intake_state,
          validated_at = excluded.validated_at,
          error_json = excluded.error_json,
          available_voices_json = excluded.available_voices_json,
          tts_safety_json = excluded.tts_safety_json,
          updated_at = excluded.updated_at`
      )
      .run(
        parsed.provider.id,
        parsed.provider.name,
        parsed.provider.kind,
        parsed.provider.capability,
        JSON.stringify(parsed.configuration),
        parsed.secretRef === null ? null : JSON.stringify(parsed.secretRef),
        parsed.provider.active ? 1 : 0,
        parsed.provider.connectionState,
        parsed.provider.intakeState,
        parsed.provider.validatedAt,
        parsed.provider.error === null ? null : JSON.stringify(parsed.provider.error),
        JSON.stringify(parsed.availableVoices),
        parsed.ttsSafety === null ? null : JSON.stringify(parsed.ttsSafety),
        parsed.createdAt,
        parsed.updatedAt
      );
    return parsed;
  }

  async findById(providerId: string): Promise<ProviderRegistrationRecord | null> {
    const row = this.#connection
      .prepare(`SELECT ${providerColumns} FROM provider_registrations WHERE id = ?`)
      .get(providerId);
    return row === undefined ? null : mapProviderRegistrationRow(row as unknown as ProviderRegistrationRow);
  }

  async list(capability: ProviderCapability): Promise<readonly ProviderRegistrationRecord[]> {
    return this.#connection
      .prepare(`SELECT ${providerColumns} FROM provider_registrations WHERE capability = ? ORDER BY name, id`)
      .all(capability)
      .map((row) => mapProviderRegistrationRow(row as unknown as ProviderRegistrationRow));
  }

  async findActive(capability: ProviderCapability): Promise<ProviderRegistrationRecord | null> {
    const row = this.#connection
      .prepare(`SELECT ${providerColumns} FROM provider_registrations WHERE capability = ? AND active = 1`)
      .get(capability);
    return row === undefined ? null : mapProviderRegistrationRow(row as unknown as ProviderRegistrationRow);
  }

  async activate(providerId: string): Promise<ProviderActivationRecordResult> {
    return runInTransaction(this.#connection, () => {
      const target = this.#findByIdSync(providerId);
      if (target === null) {
        throw new Error(`Provider registration "${providerId}" was not found`);
      }

      const currentRow = this.#connection
        .prepare("SELECT id FROM provider_registrations WHERE capability = ? AND active = 1")
        .get(target.provider.capability);
      const currentId = currentRow === undefined ? null : String(currentRow.id);
      const updatedAt = this.#now().toISOString();
      this.#connection
        .prepare("UPDATE provider_registrations SET active = 0, updated_at = ? WHERE capability = ? AND active = 1")
        .run(updatedAt, target.provider.capability);
      this.#connection
        .prepare("UPDATE provider_registrations SET active = 1, updated_at = ? WHERE id = ?")
        .run(updatedAt, providerId);

      const activated = this.#findByIdSync(providerId);
      if (activated === null) {
        throw new Error(`Provider registration "${providerId}" disappeared during activation`);
      }

      return {
        provider: activated,
        replacedProviderId: currentId === providerId ? null : currentId
      };
    });
  }

  async updateTtsSafety(
    providerId: string,
    settings: TtsProviderSafetySettings
  ): Promise<ProviderRegistrationRecord | null> {
    const parsed = ttsProviderSafetySettingsSchema.parse(settings);
    this.#connection
      .prepare("UPDATE provider_registrations SET tts_safety_json = ?, updated_at = ? WHERE id = ? AND capability = 'tts'")
      .run(JSON.stringify(parsed), this.#now().toISOString(), providerId);
    return this.findById(providerId);
  }

  #findByIdSync(providerId: string): ProviderRegistrationRecord | null {
    const row = this.#connection
      .prepare(`SELECT ${providerColumns} FROM provider_registrations WHERE id = ?`)
      .get(providerId);
    return row === undefined ? null : mapProviderRegistrationRow(row as unknown as ProviderRegistrationRow);
  }
}

function parseProviderRegistrationRecord(record: ProviderRegistrationRecord): ProviderRegistrationRecord {
  return {
    provider: registeredProviderViewSchema.parse({ ...record.provider, usedByAlertCount: 0 }),
    configuration: metadataSchema.parse(record.configuration),
    availableVoices: ttsVoiceSchema.array().parse(record.availableVoices),
    secretRef: record.secretRef === null ? null : secretRefSchema.parse(record.secretRef),
    ttsSafety: record.ttsSafety === null ? null : ttsProviderSafetySettingsSchema.parse(record.ttsSafety),
    createdAt: String(record.createdAt),
    updatedAt: String(record.updatedAt)
  };
}

function mapProviderRegistrationRow(row: ProviderRegistrationRow): ProviderRegistrationRecord {
  const provider = registeredProviderViewSchema.parse({
    id: String(row.id),
    name: String(row.name),
    kind: row.kind,
    capability: row.capability,
    active: Number(row.active) === 1,
    connectionState: row.connection_state,
    intakeState: row.intake_state,
    validatedAt: row.validated_at === null ? null : String(row.validated_at),
    error: row.error_json === null ? null : actionableManagementErrorSchema.parse(parseJson(row.error_json)),
    usedByAlertCount: 0
  });
  return parseProviderRegistrationRecord({
    provider,
    configuration: metadataSchema.parse(parseJson(row.non_secret_config_json)),
    availableVoices: ttsVoiceSchema.array().parse(parseJson(row.available_voices_json)),
    secretRef: row.secret_ref_json === null ? null : secretRefSchema.parse(parseJson(row.secret_ref_json)),
    ttsSafety:
      row.tts_safety_json === null ? null : ttsProviderSafetySettingsSchema.parse(parseJson(row.tts_safety_json)),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  });
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    throw new TypeError("Provider registration JSON column must contain text");
  }
  return JSON.parse(value) as unknown;
}
