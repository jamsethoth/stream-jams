export function moduleOccurrenceKey(moduleId: string, occurrenceId: string): string {
  return JSON.stringify([moduleId, occurrenceId]);
}
