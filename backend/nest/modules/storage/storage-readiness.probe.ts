export abstract class ObjectStorageReadinessProbe {
  abstract check(): Promise<void>;
}
