import { Module } from '@nestjs/common';
import { DatabaseReadinessProbe } from './database-readiness.probe.ts';
import { DatabaseService } from './database.service.ts';

@Module({
  imports: [],
  providers: [DatabaseService, { provide: DatabaseReadinessProbe, useExisting: DatabaseService }],
  exports: [DatabaseReadinessProbe, DatabaseService],
})
export class DatabaseModule {}
