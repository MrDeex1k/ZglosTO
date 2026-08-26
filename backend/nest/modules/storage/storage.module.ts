import { Module } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service.ts';
import { ObjectStorageReadinessProbe } from './storage-readiness.probe.ts';

@Module({
  imports: [],
  providers: [
    ObjectStorageService,
    { provide: ObjectStorageReadinessProbe, useExisting: ObjectStorageService },
  ],
  exports: [ObjectStorageReadinessProbe, ObjectStorageService],
})
export class StorageModule {}
