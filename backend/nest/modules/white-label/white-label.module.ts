import { Module } from '@nestjs/common';
import { PublicConfigController } from './public-config.controller.ts';
import {
  loadActiveWhiteLabelConfig,
  WhiteLabelConfigService,
  WHITE_LABEL_CONFIG,
} from './white-label-config.service.ts';

@Module({
  imports: [],
  controllers: [PublicConfigController],
  providers: [
    WhiteLabelConfigService,
    {
      provide: WHITE_LABEL_CONFIG,
      useFactory: loadActiveWhiteLabelConfig,
    },
  ],
  exports: [WhiteLabelConfigService, WHITE_LABEL_CONFIG],
})
export class WhiteLabelModule {}
