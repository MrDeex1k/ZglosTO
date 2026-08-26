import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { observabilityMode } from './index.ts';

let sdk: NodeSDK | null = null;
let shutdownPromise: Promise<void> | null = null;

function diagnosticWarning(event: string, reason: string): void {
  process.stderr.write(
    `${JSON.stringify({
      event,
      level: 'warn',
      reason,
      service: process.env.OTEL_SERVICE_NAME ?? 'unknown',
      timestamp: new Date().toISOString(),
    })}\n`,
  );
}

function start(): void {
  if (observabilityMode() === 'disabled') return;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) {
    diagnosticWarning('observability.disabled.invalid_configuration', 'missing_otlp_endpoint');
    return;
  }

  if (process.env.OTEL_DIAGNOSTIC_LOG_LEVEL === 'debug') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || 'unknown';
  sdk = new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: 15_000,
        exportTimeoutMillis: 5_000,
      }),
    ],
    resource: resourceFromAttributes({
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]:
        process.env.OTEL_DEPLOYMENT_ENVIRONMENT?.trim() || process.env.NODE_ENV || 'development',
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_NAMESPACE]: 'zglosto',
      [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION?.trim() || 'development',
    }),
    traceExporter: new OTLPTraceExporter(),
  });

  try {
    sdk.start();
  } catch (error: unknown) {
    sdk = null;
    diagnosticWarning(
      'observability.disabled.startup_failure',
      error instanceof Error ? error.name : 'unknown',
    );
  }
}

export function shutdownObservability(): Promise<void> {
  if (sdk === null) return Promise.resolve();
  shutdownPromise ??= sdk.shutdown().catch((error: unknown) => {
    diagnosticWarning(
      'observability.shutdown.failed',
      error instanceof Error ? error.name : 'unknown',
    );
  });
  return shutdownPromise;
}

start();

process.once('beforeExit', () => {
  void shutdownObservability();
});
