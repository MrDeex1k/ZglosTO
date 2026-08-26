export type DatabaseParameter = string | number | boolean | Buffer | null;

export interface DatabaseQueryResult {
  rows: unknown[];
  rowCount: number;
}

export interface DatabaseClient {
  query(text: string): Promise<DatabaseQueryResult>;
  query(text: string, parameters: readonly DatabaseParameter[]): Promise<DatabaseQueryResult>;
}

export interface TransactionalDatabaseClient extends DatabaseClient {
  transaction<Result>(operation: (client: DatabaseClient) => Promise<Result>): Promise<Result>;
}
