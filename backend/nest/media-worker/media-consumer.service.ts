import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { MEDIA_PROCESSING_TOPOLOGY_V1 } from '@zglosto/contracts';
import { RabbitMqConsumerService } from '../modules/jobs/rabbitmq-consumer.service.ts';
import { parseMediaWorkerEnvironment } from './media-worker.environment.ts';
import { MediaMessageHandler } from './media-message.handler.ts';

@Injectable()
export class MediaConsumerService implements OnApplicationBootstrap {
  constructor(
    private readonly consumer: RabbitMqConsumerService,
    private readonly handler: MediaMessageHandler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const environment = parseMediaWorkerEnvironment(process.env);
    await this.consumer.subscribe({
      consumerName: 'media-worker-v1',
      handle: (delivery) => this.handler.handle(delivery),
      prefetch: environment.prefetch,
      queue: MEDIA_PROCESSING_TOPOLOGY_V1.processingQueue,
    });
  }
}
