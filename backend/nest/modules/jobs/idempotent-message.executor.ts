import { Injectable } from '@nestjs/common';
import type { DatabaseClient } from '../../../types.ts';
import { DatabaseService } from '../database/database.service.ts';

export type IdempotentExecutionResult = 'duplicate' | 'executed';

@Injectable()
export class IdempotentMessageExecutor {
  constructor(private readonly database: DatabaseService) {}

  async execute(
    consumerName: string,
    messageId: string,
    messageType: string,
    operation: (client: DatabaseClient) => Promise<void>,
  ): Promise<IdempotentExecutionResult> {
    return this.database.transaction(async (client) => {
      const receipt = await client.query(
        `INSERT INTO consumed_messages (consumer_name, message_id, message_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (consumer_name, message_id) DO NOTHING
         RETURNING message_id`,
        [consumerName, messageId, messageType],
      );
      if (receipt.rowCount === 0) return 'duplicate';

      await operation(client);
      return 'executed';
    });
  }
}
