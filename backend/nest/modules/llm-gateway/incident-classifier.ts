import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { CurrentLlmClassificationResult } from '@zglosto/contracts';
import { addCounter, recordHistogram } from '@zglosto/observability';
import { validateLlmEnvironment } from '../../../config/env.ts';
import { classifyIncident } from '../../../lib/llm-classification.ts';
import { createLlmGatewayClient, type LlmGatewayClient } from '../../../lib/llm-gateway-client.ts';

export abstract class IncidentClassifier {
  abstract classify(
    description: string,
    requestedServiceKey: string,
    fallbackServiceKey: string,
  ): Promise<CurrentLlmClassificationResult>;
}

@Injectable()
export class LlmGatewayIncidentClassifier extends IncidentClassifier implements OnModuleDestroy {
  #client: LlmGatewayClient | null = null;

  onModuleDestroy(): void {
    this.#client?.close();
    this.#client = null;
  }

  async classify(
    description: string,
    requestedServiceKey: string,
    fallbackServiceKey: string,
  ): Promise<CurrentLlmClassificationResult> {
    const environment = validateLlmEnvironment();
    this.#client ??= createLlmGatewayClient(environment);
    const startedAt = performance.now();
    try {
      const result = await classifyIncident(description, requestedServiceKey, {
        fallbackServiceKey,
        fetchImpl: this.#client.fetch,
        gatewayUrl: environment.gatewayUrl,
        timeoutMs: environment.timeoutMs,
      });
      addCounter('zglosto_llm_backend_requests', 1, {
        result: result.source,
      });
      return result;
    } catch (error: unknown) {
      addCounter('zglosto_llm_backend_requests', 1, { result: 'error' });
      throw error;
    } finally {
      recordHistogram(
        'zglosto_llm_backend_duration_seconds',
        (performance.now() - startedAt) / 1_000,
      );
    }
  }
}
