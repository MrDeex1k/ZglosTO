// oxlint-disable-next-line import/no-unassigned-import -- Module metadata requires reflect-metadata.
import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module.ts';
import { HealthModule } from './health/health.module.ts';
import { AdminModule } from './modules/admin/admin.module.ts';
import { AuthBridgeModule } from './modules/auth-bridge/auth-bridge.module.ts';
import { DatabaseModule } from './modules/database/database.module.ts';
import { IncidentsModule } from './modules/incidents/incidents.module.ts';
import { IncidentDomainPort } from './modules/incidents/incident-domain.port.ts';
import { PostgresIncidentAdapter } from './modules/incidents/postgres-incident.adapter.ts';
import { JobsModule } from './modules/jobs/jobs.module.ts';
import { LlmGatewayModule } from './modules/llm-gateway/llm-gateway.module.ts';
import { MediaModule } from './modules/media/media.module.ts';
import { ResidentsModule } from './modules/residents/residents.module.ts';
import { ServicesModule } from './modules/services/services.module.ts';
import { StorageModule } from './modules/storage/storage.module.ts';
import { WhiteLabelModule } from './modules/white-label/white-label.module.ts';
import { PlatformModule } from './platform/platform.module.ts';
import { TransientStoreModule } from './platform/transient-store.module.ts';

const productModules = [
  AdminModule,
  AuthBridgeModule,
  DatabaseModule,
  IncidentsModule,
  JobsModule,
  LlmGatewayModule,
  MediaModule,
  ResidentsModule,
  ServicesModule,
  StorageModule,
  WhiteLabelModule,
] as const;

type ProductModule = (typeof productModules)[number];
type RootModule =
  | ProductModule
  | typeof AppModule
  | typeof HealthModule
  | typeof PlatformModule
  | typeof TransientStoreModule;

const knownModules: readonly RootModule[] = [
  AppModule,
  HealthModule,
  PlatformModule,
  TransientStoreModule,
  ...productModules,
];

const expectedDependencies: ReadonlyMap<ProductModule, readonly ProductModule[]> = new Map([
  [AdminModule, [AuthBridgeModule, IncidentsModule, WhiteLabelModule]],
  [AuthBridgeModule, []],
  [DatabaseModule, []],
  [IncidentsModule, [DatabaseModule, JobsModule, LlmGatewayModule, MediaModule, WhiteLabelModule]],
  [JobsModule, [DatabaseModule]],
  [LlmGatewayModule, []],
  [MediaModule, [AuthBridgeModule, DatabaseModule, JobsModule, StorageModule]],
  [ResidentsModule, [AuthBridgeModule, IncidentsModule, MediaModule]],
  [ServicesModule, [AuthBridgeModule, IncidentsModule, MediaModule]],
  [StorageModule, []],
  [WhiteLabelModule, []],
]);

function isKnownModule(candidate: unknown): candidate is RootModule {
  return knownModules.some((knownModule) => knownModule === candidate);
}

function readModuleImports(moduleClass: RootModule): readonly RootModule[] {
  const metadata: unknown = Reflect.getMetadata(MODULE_METADATA.IMPORTS, moduleClass);
  if (!Array.isArray(metadata)) {
    throw new Error(`${moduleClass.name} must declare an imports array`);
  }

  return (metadata as readonly unknown[]).map((candidate) => {
    if (!isKnownModule(candidate)) {
      throw new Error(`${moduleClass.name} imports an unknown module`);
    }
    return candidate;
  });
}

function moduleNames(modules: readonly RootModule[]): string[] {
  return modules.map((moduleClass) => moduleClass.name).sort();
}

function assertAcyclic(
  moduleClass: ProductModule,
  visiting: Set<ProductModule>,
  visited: Set<ProductModule>,
): void {
  if (visiting.has(moduleClass)) {
    throw new Error(`Circular NestJS module dependency detected at ${moduleClass.name}`);
  }
  if (visited.has(moduleClass)) {
    return;
  }

  visiting.add(moduleClass);
  for (const importedModule of readModuleImports(moduleClass)) {
    if (productModules.some((productModule) => productModule === importedModule)) {
      assertAcyclic(importedModule as ProductModule, visiting, visited);
    }
  }
  visiting.delete(moduleClass);
  visited.add(moduleClass);
}

describe('NestJS module topology', () => {
  it('contains all planned product modules exactly once in AppModule', () => {
    expect(moduleNames(productModules)).toEqual([
      'AdminModule',
      'AuthBridgeModule',
      'DatabaseModule',
      'IncidentsModule',
      'JobsModule',
      'LlmGatewayModule',
      'MediaModule',
      'ResidentsModule',
      'ServicesModule',
      'StorageModule',
      'WhiteLabelModule',
    ]);

    expect(moduleNames(readModuleImports(AppModule))).toEqual(
      moduleNames([HealthModule, PlatformModule, TransientStoreModule, ...productModules]),
    );
  });

  it('keeps health as a technical composition module over leaf infrastructure modules', () => {
    expect(moduleNames(readModuleImports(HealthModule))).toEqual(
      moduleNames([
        DatabaseModule,
        PlatformModule,
        StorageModule,
        TransientStoreModule,
        WhiteLabelModule,
      ]),
    );
  });

  it('keeps the declared dependencies aligned with the architecture', () => {
    for (const moduleClass of productModules) {
      const expectedImports = expectedDependencies.get(moduleClass);
      if (!expectedImports) {
        throw new Error(`Missing expected dependencies for ${moduleClass.name}`);
      }
      expect(moduleNames(readModuleImports(moduleClass))).toEqual(moduleNames(expectedImports));
    }
  });

  it('has no circular module dependencies or forwardRef escape hatches', () => {
    const visited = new Set<ProductModule>();
    for (const moduleClass of productModules) {
      assertAcyclic(moduleClass, new Set(), visited);
    }
    expect(visited.size).toBe(productModules.length);
  });

  it('compiles the complete AppModule graph through Nest dependency injection', async () => {
    const moduleReference = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleReference.get(IncidentDomainPort)).toBeInstanceOf(PostgresIncidentAdapter);
    await moduleReference.close();
  });
});
