export type IsoDateTimeString = string;

export class ContractValidationError extends Error {
  constructor(path: string, expectation: string) {
    super(`Invalid contract at ${path}: expected ${expectation}`);
    this.name = 'ContractValidationError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ContractValidationError(path, 'object');
  }
  return value as Record<string, unknown>;
}

export function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ContractValidationError(path, 'array');
  }
  return value;
}

export function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new ContractValidationError(path, 'string');
  }
  return value;
}

export function expectNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return expectString(value, path);
}

export function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ContractValidationError(path, 'boolean');
  }
  return value;
}

export function expectNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ContractValidationError(path, 'finite number');
  }
  return value;
}

export function expectNullableNumber(value: unknown, path: string): number | null {
  if (value === null) return null;
  return expectNumber(value, path);
}

export function expectInteger(value: unknown, path: string): number {
  const parsed = expectNumber(value, path);
  if (!Number.isInteger(parsed)) {
    throw new ContractValidationError(path, 'integer');
  }
  return parsed;
}

export interface ApiErrorResponse {
  error: string;
  allowed: string[] | null;
}

export interface OperationSuccessResponse {
  success: true;
}
