import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.ts';
import { IdempotentMessageExecutor } from './idempotent-message.executor.ts';
import { OutboxPublisherService } from './outbox-publisher.service.ts';
import { OutboxRepository } from './outbox.repository.ts';
import { MessageBrokerPublisher, RabbitMqService } from './rabbitmq.service.ts';
import { RabbitMqConsumerService } from './rabbitmq-consumer.service.ts';

@Module({
  imports: [DatabaseModule],
  providers: [
    RabbitMqService,
    { provide: MessageBrokerPublisher, useExisting: RabbitMqService },
    RabbitMqConsumerService,
    IdempotentMessageExecutor,
    OutboxRepository,
    OutboxPublisherService,
  ],
  exports: [
    IdempotentMessageExecutor,
    MessageBrokerPublisher,
    OutboxRepository,
    RabbitMqConsumerService,
    RabbitMqService,
  ],
})
export class JobsModule {}
