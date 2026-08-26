import { readFileSync } from 'node:fs';
import { Pool, type QueryResultRow } from 'pg';
import { validateDatabaseConnectionEnvironment } from './config/env.ts';
import type {
  DatabaseClient,
  DatabaseParameter,
  DatabaseQueryResult,
  TransactionalDatabaseClient,
} from './types.ts';

const databaseEnvironment = validateDatabaseConnectionEnvironment();

const pool = new Pool({
  connectionTimeoutMillis: databaseEnvironment.connectionTimeoutMs,
  connectionString: databaseEnvironment.url,
  idleTimeoutMillis: databaseEnvironment.idleTimeoutMs,
  max: databaseEnvironment.poolMax,
  ssl: {
    ca: readFileSync(databaseEnvironment.tlsCaPath, 'utf8'),
    minVersion: 'TLSv1.3',
    rejectUnauthorized: true,
  },
});

async function query(
  text: string,
  parameters: readonly DatabaseParameter[] = [],
): Promise<DatabaseQueryResult> {
  const result = await pool.query<QueryResultRow>(text, [...parameters]);
  return {
    rows: result.rows,
    rowCount: result.rowCount ?? result.rows.length,
  };
}

async function transaction<Result>(
  operation: (client: DatabaseClient) => Promise<Result>,
): Promise<Result> {
  const poolClient = await pool.connect();
  const transactionClient: DatabaseClient = {
    query: async (
      text: string,
      parameters: readonly DatabaseParameter[] = [],
    ): Promise<DatabaseQueryResult> => {
      const result = await poolClient.query<QueryResultRow>(text, [...parameters]);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? result.rows.length,
      };
    },
  };
  try {
    await poolClient.query('BEGIN');
    const result = await operation(transactionClient);
    await poolClient.query('COMMIT');
    return result;
  } catch (error) {
    await poolClient.query('ROLLBACK');
    throw error;
  } finally {
    poolClient.release();
  }
}

export const database: TransactionalDatabaseClient = { query, transaction };

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
