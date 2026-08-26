export abstract class DatabaseReadinessProbe {
  abstract check(): Promise<void>;
}
