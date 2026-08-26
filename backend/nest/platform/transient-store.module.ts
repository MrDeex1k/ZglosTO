import { Global, Module } from '@nestjs/common';
import { TransientStoreService } from './transient-store.service.ts';

@Global()
@Module({
  providers: [TransientStoreService],
  exports: [TransientStoreService],
})
export class TransientStoreModule {}
