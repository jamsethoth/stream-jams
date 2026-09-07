/** Share teardown, including its failure, across concurrent and repeated callers. */
export function onceAsync(work: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => pending ??= Promise.resolve().then(work);
}
