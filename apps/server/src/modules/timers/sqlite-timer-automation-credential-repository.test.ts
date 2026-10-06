import { expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteTimerAutomationCredentialRepository } from "./sqlite-timer-automation-credential-repository.js";

it("rolls back rejected rotation and retains the previous verifier", () => {
  using database = createInMemoryStreamJamsDatabase();
  const repository = new SqliteTimerAutomationCredentialRepository(database.connection);
  const original = repository.issueOrRotate(`sha256:${"a".repeat(64)}`, "first");
  database.connection.exec("CREATE TRIGGER reject_rotation BEFORE UPDATE ON timer_automation_credential BEGIN SELECT RAISE(ABORT, 'write failed'); END");
  expect(() => repository.issueOrRotate(`sha256:${"b".repeat(64)}`, "second")).toThrow("write failed");
  expect(repository.read()).toEqual(original);
});

it("preserves first revocation and starts fresh metadata on reissue", () => {
  using database = createInMemoryStreamJamsDatabase();
  const repository = new SqliteTimerAutomationCredentialRepository(database.connection);
  repository.issueOrRotate(`sha256:${"a".repeat(64)}`, "first");
  expect(repository.issueOrRotate(`sha256:${"b".repeat(64)}`, "second")).toMatchObject({ createdAt: "first", rotatedAt: "second" });
  repository.revoke("third"); repository.revoke("fourth");
  expect(repository.read()?.revokedAt).toBe("third");
  expect(repository.issueOrRotate(`sha256:${"c".repeat(64)}`, "fifth")).toEqual({ verifier: `sha256:${"c".repeat(64)}`, createdAt: "fifth", rotatedAt: null, revokedAt: null });
});
