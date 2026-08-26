import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { addCounter, recordHistogram } from '@zglosto/observability';
import { Pool, type QueryResultRow } from 'pg';
import { validateDatabaseConnectionEnvironment } from '../../../config/env.ts';
import type {
  DatabaseClient,
  DatabaseParameter,
  DatabaseQueryResult,
  TransactionalDatabaseClient,
} from '../../../types.ts';
import { GracefulShutdownRegistry } from '../../platform/graceful-shutdown.registry.ts';
import { DatabaseReadinessProbe } from './database-readiness.probe.ts';

@Injectable()
export class DatabaseService extends DatabaseReadinessProbe implements TransactionalDatabaseClient {
  private poolInstance: Pool | null = null;
  private closed = false;

  constructor(shutdown: GracefulShutdownRegistry) {
    super();
    shutdown.register({ name: 'postgresql-pool', close: () => this.close() });
  }

  async check(): Promise<void> {
    await this.query('SELECT 1');
  }

  async query(
    text: string,
    parameters: readonly DatabaseParameter[] = [],
  ): Promise<DatabaseQueryResult> {
    const operation = this.operation(text);
    const startedAt = performance.now();
    try {
      const result = await this.pool().query<QueryResultRow>(text, [...parameters]);
      addCounter('zglosto_database_operations', 1, { operation, result: 'success' });
      return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
    } catch (error: unknown) {
      addCounter('zglosto_database_operations', 1, { operation, result: 'error' });
      throw error;
    } finally {
      recordHistogram(
        'zglosto_database_operation_duration_seconds',
        (performance.now() - startedAt) / 1_000,
        { operation },
      );
    }
  }

  async transaction<Result>(
    operation: (client: DatabaseClient) => Promise<Result>,
  ): Promise<Result> {
    const poolClient = await this.pool().connect();
    const transactionClient: DatabaseClient = {
      query: async (
        text: string,
        parameters: readonly DatabaseParameter[] = [],
      ): Promise<DatabaseQueryResult> => {
        const result = await poolClient.query<QueryResultRow>(text, [...parameters]);
        return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
      },
    };

    try {
      await poolClient.query('BEGIN');
      const result = await operation(transactionClient);
      await poolClient.query('COMMIT');
      return result;
    } catch (error: unknown) {
      await poolClient.query('ROLLBACK');
      throw error;
    } finally {
      poolClient.release();
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const pool = this.poolInstance;
    this.poolInstance = null;
    if (pool !== null) await pool.end();
  }

  private pool(): Pool {
    if (this.closed) throw new Error('PostgreSQL pool is closed');
    if (this.poolInstance === null) {
      const environment = validateDatabaseConnectionEnvironment();
      this.poolInstance = new Pool({
        connectionString: environment.url,
        connectionTimeoutMillis: environment.connectionTimeoutMs,
        idleTimeoutMillis: environment.idleTimeoutMs,
        max: environment.poolMax,
        ssl: {
          ca: readFileSync(environment.tlsCaPath, 'utf8'),
          minVersion: 'TLSv1.3',
          rejectUnauthorized: true,
        },
      });
    }
    return this.poolInstance;
  }

  private operation(text: string): string {
    return /^[A-Za-z]+/u.exec(text.trim())?.[0]?.toUpperCase() ?? 'UNKNOWN';
  }
}
