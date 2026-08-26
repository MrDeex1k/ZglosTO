import { Module } from '@nestjs/common';
import { IncidentClassifier, LlmGatewayIncidentClassifier } from './incident-classifier.ts';

@Module({
  imports: [],
  providers: [{ provide: IncidentClassifier, useClass: LlmGatewayIncidentClassifier }],
  exports: [IncidentClassifier],
})
export class LlmGatewayModule {}
