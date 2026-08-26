import type { VerificationMessage } from '@zglosto/contracts';

const messages = new Map<string, VerificationMessage>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function storeVerificationMessage(email: string, url: string): void {
  messages.set(normalizeEmail(email), {
    email: normalizeEmail(email),
    url,
    createdAt: new Date().toISOString(),
  });
}

export function getVerificationMessage(email: string): VerificationMessage | null {
  return messages.get(normalizeEmail(email)) ?? null;
}
