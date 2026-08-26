import type { FormEvent } from 'react';

export function submitClientForm(
  event: FormEvent<HTMLFormElement>,
  submit: () => Promise<void>,
): void {
  event.preventDefault();
  event.stopPropagation();
  void submit();
}
