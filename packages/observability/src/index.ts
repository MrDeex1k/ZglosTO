import {
  context,
  metrics,
  propagation,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type TextMapGetter,
  type TextMapSetter,
} from '@opentelemetry/api';
import { logs, SeverityNumber, type AnyValueMap } from '@opentelemetry/api-logs';

export type ObservabilityMode = 'disabled' | 'external' | 'local';

const metricInstruments = new Map<
  string,
  ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>
>();
const histogramInstruments = new Map<
  string,
  ReturnType<ReturnType<typeof metrics.getMeter>['createHistogram']>
>();
interface GaugeMeasurement {
  attributes: Attributes;
  value: number;
}
interface GaugeInstrument {
  measurements: Map<string, GaugeMeasurement>;
}
const gaugeInstruments = new Map<string, GaugeInstrument>();

const carrierSetter: TextMapSetter<Record<string, string>> = {
  set(carrier, key, value): void {
    carrier[key] = value;
  },
};

const carrierGetter: TextMapGetter<Readonly<Record<string, string>>> = {
  get(carrier, key): string | undefined {
    return carrier[key] ?? carrier[key.toLowerCase()];
  },
  keys(carrier): string[] {
    return Object.keys(carrier);
  },
};

export function observabilityMode(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ObservabilityMode {
  const value = environment.OBSERVABILITY_MODE?.trim() || 'disabled';
  return value === 'local' || value === 'external' ? value : 'disabled';
}

export function activeTraceIdentifiers(): { spanId: string | null; traceId: string | null } {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return {
    spanId: spanContext?.spanId ?? null,
    traceId: spanContext?.traceId ?? null,
  };
}

export function injectTraceContext(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier, carrierSetter);
  return carrier;
}

export function extractedTraceContext(carrier: Readonly<Record<string, string>>): Context {
  return propagation.extract(context.active(), carrier, carrierGetter);
}

export async function withSpan<Result>(
  name: string,
  attributes: Attributes,
  operation: () => Promise<Result>,
  parentContext: Context = context.active(),
): Promise<Result> {
  return trace
    .getTracer('zglosto')
    .startActiveSpan(name, { attributes }, parentContext, async (span) => {
      try {
        const result = await operation();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error: unknown) {
        span.recordException(
          error instanceof Error ? error : new Error('Unknown operation failure'),
        );
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
}

export function addCounter(name: string, value = 1, attributes: Attributes = {}): void {
  let counter = metricInstruments.get(name);
  if (counter === undefined) {
    counter = metrics.getMeter('zglosto').createCounter(name);
    metricInstruments.set(name, counter);
  }
  counter.add(value, attributes);
}

export function recordHistogram(name: string, value: number, attributes: Attributes = {}): void {
  let histogram = histogramInstruments.get(name);
  if (histogram === undefined) {
    histogram = metrics.getMeter('zglosto').createHistogram(name);
    histogramInstruments.set(name, histogram);
  }
  histogram.record(value, attributes);
}

function attributesKey(attributes: Attributes): string {
  return JSON.stringify(
    Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function setGauge(name: string, value: number, attributes: Attributes = {}): void {
  if (!Number.isFinite(value)) {
    throw new Error('Gauge value must be finite');
  }
  let registered = gaugeInstruments.get(name);
  if (registered === undefined) {
    const measurements = new Map<string, GaugeMeasurement>();
    const gauge = metrics.getMeter('zglosto').createObservableGauge(name);
    gauge.addCallback((result) => {
      for (const measurement of measurements.values()) {
        result.observe(measurement.value, measurement.attributes);
      }
    });
    registered = { measurements };
    gaugeInstruments.set(name, registered);
  }
  registered.measurements.set(attributesKey(attributes), { attributes, value });
}

export interface TelemetryLogRecord {
  attributes?: AnyValueMap;
  body: string;
  severity: 'debug' | 'error' | 'fatal' | 'info' | 'warn';
}

const severityNumbers = {
  debug: SeverityNumber.DEBUG,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
} as const;

export function emitTelemetryLog(record: TelemetryLogRecord): void {
  if (observabilityMode() === 'disabled') return;
  logs.getLogger('zglosto').emit({
    ...(record.attributes === undefined ? {} : { attributes: record.attributes }),
    body: record.body,
    severityNumber: severityNumbers[record.severity],
    severityText: record.severity.toUpperCase(),
    timestamp: new Date(),
  });
}
