export type MedicationOperationKind = "create_plan" | "confirm_plan" | "end_plan" | "supersede_plan" | "materialize_schedule" | "record_intake" | "correct_intake";

export type MedicationOperation = Readonly<{
  careSpaceId: string;
  childId: string;
  actorUserId: string;
  operationKind: MedicationOperationKind;
  idempotencyKey: string;
  digest: string;
}>;

type StoredOperation<T> = Readonly<{ digest: string; value: T }>;
export type MedicationIdempotencyStore<T> = Readonly<{ get(key: string): StoredOperation<T> | undefined; set(key: string, value: StoredOperation<T>): void }>;

function scopedKey(operation: MedicationOperation): string {
  return [operation.careSpaceId, operation.childId, operation.actorUserId, operation.operationKind, operation.idempotencyKey].join("|");
}

export async function executeMedicationOperation<T>(
  store: MedicationIdempotencyStore<T>,
  operation: MedicationOperation,
  effect: () => Promise<T>,
): Promise<Readonly<{ outcome: "created" | "replayed"; value: T }>> {
  if (!operation.idempotencyKey || !operation.digest) throw new Error("MEDICATION_IDEMPOTENCY_INPUT_REQUIRED");
  const key = scopedKey(operation);
  const existing = store.get(key);
  if (existing) {
    if (existing.digest !== operation.digest) throw new Error("MEDICATION_IDEMPOTENCY_CONFLICT");
    return { outcome: "replayed", value: existing.value };
  }
  const value = await effect();
  store.set(key, { digest: operation.digest, value });
  return { outcome: "created", value };
}

export function createMedicationOperationExecutor() {
  const store = new Map<string, StoredOperation<unknown>>();
  return <T>(operation: MedicationOperation, effect: () => Promise<T>) =>
    executeMedicationOperation(store as MedicationIdempotencyStore<T>, operation, effect);
}
