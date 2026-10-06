import assert from "node:assert/strict";
import test from "node:test";
import { scanErrorProvenance, scanErrorNames } from "./error-provenance-check.mjs";

function rules(source, fileName = "apps/server/src/example.ts") {
  return scanErrorProvenance(source, fileName).map((diagnostic) => diagnostic.rule);
}

test("rejects unnamed, generic and constructor-derived custom error names", () => {
  for (const source of [
    'class DomainError extends Error {}',
    'class DomainError extends Error { constructor() { super("detail"); this.name = "Error"; } }',
    'class DomainError extends Error { constructor() { super("detail"); this.name = this.constructor.name; } }'
  ]) {
    const result = scanErrorNames([{ fileName: "apps/server/src/example.ts", sourceText: source }]);
    assert.deepEqual(result.map(d => d.rule), ["stable-error-name"]);
    assert.equal(result[0].fileName, "apps/server/src/example.ts");
    assert.ok(result[0].line > 0);
  }
});

test("accepts explicit names, imported aliases and indirect named inheritance", () => {
  const sources = [
    { fileName: "packages/core/src/shared/named-error.ts", sourceText: 'export class NamedError extends Error { constructor(name: string, message: string) { super(message); this.name = name; } }' },
    { fileName: "apps/server/src/http/safe-http-error.ts", sourceText: 'import { NamedError } from "../../../../packages/core/src/shared/named-error.js"; export class SafeHttpError extends NamedError { constructor(name: string, message: string) { super(name, message); } }' },
    { fileName: "apps/server/src/example.ts", sourceText: 'import { SafeHttpError as Safe } from "./http/safe-http-error.js"; class DomainError extends Safe { constructor() { super("DomainError", "detail"); } } class ChildError extends DomainError {} class DirectError extends Error { name = "DirectError"; }' }
  ];
  assert.deepEqual(scanErrorNames(sources), []);
  sources[2].sourceText += ' class MissingNameError extends Safe { constructor(name: string) { super(name, "detail"); } }';
  assert.deepEqual(scanErrorNames(sources).map(d => d.rule), ["stable-error-name"]);
});

test("accepts a bounded literal diagnostic-name map but rejects arbitrary naming", () => {
  assert.deepEqual(scanErrorNames([
    { fileName: "packages/core/src/shared/named-error.ts", sourceText: 'export class NamedError extends Error { constructor(name: string, message: string) { super(message); this.name = name; } }' },
    { fileName: "apps/server/src/example.ts", sourceText: 'import { NamedError } from "../../../packages/core/src/shared/named-error.js"; const failures = { a: { name: "OldAError" }, b: { name: "OldBError" } } as const; class FamilyError extends NamedError { constructor(code: keyof typeof failures) { const failure = failures[code]; super(failure.name, "detail"); } }' }
  ]), []);
});

test("rejects optional and unused catch bindings", () => {
  assert.deepEqual(rules("try { work(); } catch { recover(); }"), ["catch-binding"]);
  assert.deepEqual(rules("try { work(); } catch (error) { recover(); }"), ["unused-catch-value"]);
});

test("rejects promise handlers that erase rejection values", () => {
  assert.deepEqual(rules("void work().catch(() => undefined);"), ["promise-rejection-value"]);
  assert.deepEqual(rules("void work().catch(() => null);"), ["promise-rejection-value"]);
  assert.deepEqual(rules("void work().catch(() => {});"), ["promise-rejection-value"]);
  assert.deepEqual(rules("void work().catch((error) => { recover(); });"), ["unused-catch-value"]);
});

test("does not mistake property names or shadowed identifiers for caught-value use", () => {
  assert.deepEqual(rules("try { work(); } catch (error) { void ({ error: 1 }); }"), ["unused-catch-value"]);
  assert.deepEqual(rules(`
    try { work(); } catch (error) {
      (() => { const error = "shadow"; console.log(error); })();
    }
  `), ["unused-catch-value"]);
  assert.deepEqual(rules("try { work(); } catch (error) { console.log(error); }"), []);
});

test("rejects cause-free contextual errors and string-only failure envelopes", () => {
  assert.deepEqual(rules(`
    try { work(); } catch (error) {
      throw new Error("Import failed");
    }
  `), ["missing-error-cause"]);
  assert.deepEqual(rules(`
    try { work(); } catch (error) {
      try { cleanup(); } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Import and cleanup failed");
      }
    }
  `), ["missing-error-cause"]);
  assert.deepEqual(rules(`
    try { work(); } catch (error) {
      throw new ImportOperationError("Import failed");
    }
  `), ["missing-error-cause"]);
  assert.deepEqual(rules(`
    work().catch((error) => send({ type: "command-failed", message: "failed" }));
  `), ["failure-envelope"]);
});

test("accepts rethrow, narrowing, cause, owner logging, and structured envelopes", () => {
  assert.deepEqual(rules(`
    try { work(); } catch (error) {
      if (error instanceof ExpectedError) return;
      throw error;
    }
    try { work(); } catch (error) {
      throw new Error("Import failed", { cause: error });
    }
    try { work(); } catch (error) {
      try { cleanup(); } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Import and cleanup failed", { cause: error });
      }
    }
    try { work(); } catch (error) {
      throw new ImportOperationError("Import failed", { cause: error });
    }
    work().catch((error: unknown) => logger.error("failed", context, error));
    work().catch((error: unknown) => send({ type: "command-failed", message: "failed", referenceId, exception: serializeException(error) }));
  `), []);
});

test("supports TSX, multiline handlers, and nested catches", () => {
  assert.deepEqual(rules(`
    const view = <button onClick={() => void work().catch(
      (error: unknown) => logger.error("failed", context, error)
    )}>Retry</button>;
    try { outer(); } catch (outerError) {
      try { inner(); } catch (innerError) { throw new Error("inner", { cause: innerError }); }
      throw outerError;
    }
  `, "apps/web/src/example.tsx"), []);
});

test("requires a narrow, reasoned exemption immediately before the handler", () => {
  assert.deepEqual(rules(`
    try { parse(); }
    // error-provenance: allow expected -- invalid persisted JSON uses defaults
    catch { return defaults; }
    promise.catch(
      // error-provenance: allow cleanup -- teardown must continue after disconnect
      () => undefined
    );
  `), []);
  assert.deepEqual(rules(`
    try { parse(); }
    // error-provenance: allow anything -- vague
    catch { return defaults; }
  `), ["malformed-exemption", "catch-binding"]);
  assert.deepEqual(rules(`
    // error-provenance: allow cleanup --
    promise.catch(() => undefined);
  `), ["malformed-exemption", "promise-rejection-value"]);
});

test("excludes tests, stories, declarations, and generated output", () => {
  for (const file of [
    "apps/server/src/example.test.ts",
    "apps/web/src/example.stories.tsx",
    "packages/core/src/example.d.ts",
    "apps/desktop/dist/example.ts"
  ]) assert.deepEqual(rules("try {} catch {}", file), []);
});
