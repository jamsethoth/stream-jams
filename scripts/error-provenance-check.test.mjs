import assert from "node:assert/strict";
import test from "node:test";
import { scanErrorProvenance } from "./error-provenance-check.mjs";

function rules(source, fileName = "apps/server/src/example.ts") {
  return scanErrorProvenance(source, fileName).map((diagnostic) => diagnostic.rule);
}

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
