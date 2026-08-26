interface FieldErrorsProps {
  errors: readonly unknown[];
  id: string;
}

function getErrorMessage(error: unknown): string | null {
  if (typeof error === 'string') return error;
  if (typeof error !== 'object' || error === null || !('message' in error)) return null;
  return typeof error.message === 'string' ? error.message : null;
}

export function FieldErrors({ errors, id }: FieldErrorsProps) {
  const messages = errors
    .map(getErrorMessage)
    .filter((message): message is string => message !== null);

  if (messages.length === 0) return null;

  return (
    <div id={id} role="alert" className="space-y-1 text-sm text-destructive">
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  );
}
