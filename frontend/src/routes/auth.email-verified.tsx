import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/auth/email-verified')({
  component: EmailVerificationFallback,
});

function EmailVerificationFallback() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto max-w-xl space-y-4 px-6 py-12">
      <h1 className="text-2xl font-semibold">{t(($) => $.mobile.emailVerification.routeTitle)}</h1>
      <p>{t(($) => $.mobile.emailVerification.webDescription)}</p>
      <Link className="underline" to="/login">
        {t(($) => $.mobile.emailVerification.signIn)}
      </Link>
    </main>
  );
}
