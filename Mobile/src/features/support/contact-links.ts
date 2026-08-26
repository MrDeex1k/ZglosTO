export function createEmailLink(email: string): string {
  return `mailto:${email}`;
}

export function createPhoneLink(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`;
}
