import { useForm } from '@tanstack/react-form';
import { isUserRole, type UserRole } from '@zglosto/contracts';
import { Loader2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createLoginFormSchema, type LoginFormValues } from '../forms/schemas';
import { submitClientForm } from '../forms/submit';
import { signIn } from '../lib/auth-client';
import { FieldErrors } from './forms/field-errors';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface LoginFormProps {
  onRegisterClick: () => void;
  onLoginSuccess: (userRole: UserRole, email: string) => void | Promise<void>;
}

const loginDefaultValues: LoginFormValues = {
  email: '',
  password: '',
};

export function LoginForm({ onRegisterClick, onLoginSuccess }: LoginFormProps) {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const loginSchema = createLoginFormSchema({
    invalidEmail: t(($) => $.auth.invalidEmail),
    shortPassword: t(($) => $.auth.shortPassword, { count: 6 }),
  });
  const form = useForm({
    defaultValues: loginDefaultValues,
    validators: {
      onSubmit: loginSchema,
    },
    onSubmit: async ({ value }) => {
      const credentials = loginSchema.parse(value);
      setServerError(null);

      await signIn.email(credentials, {
        onSuccess: async (context) => {
          const user = context.data?.user;
          const userRole: UserRole = isUserRole(user?.uprawnienia)
            ? user.uprawnienia
            : 'mieszkaniec';
          await onLoginSuccess(userRole, user?.email ?? credentials.email);
        },
        onError: (context) => {
          const errorMessage = context.error?.message ?? t(($) => $.auth.invalidCredentials);
          setServerError(errorMessage);
          console.error('Login error:', context.error);
        },
      });
    },
  });

  return (
    <main className="flex flex-1 items-start justify-center bg-gray-50 px-4 py-8 sm:py-10 lg:items-center lg:py-12">
      <div className="w-full max-w-md">
        <div className="rounded-lg border bg-white p-6 shadow-lg sm:p-8">
          <h2 className="mb-6 text-center text-gray-900 sm:mb-8">{t(($) => $.auth.loginTitle)}</h2>

          <form
            className="space-y-5 sm:space-y-6"
            noValidate
            onSubmit={(event) => submitClientForm(event, form.handleSubmit)}
          >
            <form.Field name="email">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>
                    {t(($) => $.auth.email)} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    autoComplete="email"
                    type="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t(($) => $.auth.emailPlaceholder)}
                    aria-invalid={field.state.meta.errors.length > 0}
                    aria-describedby={`${field.name}-errors`}
                  />
                  <FieldErrors id={`${field.name}-errors`} errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            <form.Field name="password">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>
                    {t(($) => $.auth.password)} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    autoComplete="current-password"
                    type="password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t(($) => $.auth.passwordPlaceholder)}
                    aria-invalid={field.state.meta.errors.length > 0}
                    aria-describedby={`${field.name}-errors`}
                  />
                  <FieldErrors id={`${field.name}-errors`} errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            {serverError !== null && (
              <Alert variant="destructive" className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                <AlertDescription className="text-sm font-medium">{serverError}</AlertDescription>
              </Alert>
            )}

            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
              {([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  className="w-full bg-brand-primary hover:bg-brand-primary/90"
                  disabled={!canSubmit || isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t(($) => $.auth.loggingIn)}
                    </>
                  ) : (
                    t(($) => $.auth.loginAction)
                  )}
                </Button>
              )}
            </form.Subscribe>

            <Button type="button" variant="outline" className="w-full" onClick={onRegisterClick}>
              {t(($) => $.auth.registerAction)}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
