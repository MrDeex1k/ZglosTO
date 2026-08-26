import { useForm } from '@tanstack/react-form';
import { isUserRole, type UserRole } from '@zglosto/contracts';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { createRegisterFormSchema, type RegisterFormValues } from '../forms/schemas';
import { submitClientForm } from '../forms/submit';
import { signUp } from '../lib/auth-client';
import { FieldErrors } from './forms/field-errors';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface RegisterFormProps {
  onLoginClick: () => void;
  onRegisterSuccess: (userRole: UserRole, email: string) => void | Promise<void>;
}

const registerDefaultValues: RegisterFormValues = {
  name: '',
  email: '',
  password: '',
  acceptPrivacy: false,
  acceptTerms: false,
};

export function RegisterForm({ onLoginClick, onRegisterSuccess }: RegisterFormProps) {
  const { t } = useTranslation();
  const registerSchema = createRegisterFormSchema({
    requiredName: t(($) => $.auth.requiredName),
    invalidEmail: t(($) => $.auth.invalidEmail),
    shortPassword: t(($) => $.auth.shortPassword, { count: 8 }),
    privacyRequired: t(($) => $.auth.privacyRequired),
    termsRequired: t(($) => $.auth.termsRequired),
  });
  const form = useForm({
    defaultValues: registerDefaultValues,
    validators: {
      onSubmit: registerSchema,
    },
    onSubmit: async ({ value }) => {
      const registration = registerSchema.parse(value);

      await signUp.email(
        {
          email: registration.email,
          password: registration.password,
          name: registration.name,
        },
        {
          onSuccess: (context) => {
            toast.success(
              t(($) => $.auth.registerSuccess),
              {
                description: t(($) => $.auth.redirecting),
                duration: 3000,
              },
            );

            const user = context.data?.user;
            const userRole: UserRole = isUserRole(user?.uprawnienia)
              ? user.uprawnienia
              : 'mieszkaniec';
            const userEmail = user?.email ?? registration.email;

            setTimeout(() => {
              void onRegisterSuccess(userRole, userEmail);
            }, 2000);
          },
          onError: (context) => {
            let errorMessage = t(($) => $.auth.genericError);

            if (
              context.error?.message?.includes('already exists') ||
              context.error?.message?.includes('User already exists')
            ) {
              errorMessage = t(($) => $.auth.userExists);
            } else if (context.error?.code === 'INVALID_EMAIL') {
              errorMessage = t(($) => $.auth.invalidEmail);
            } else if (context.error?.code === 'WEAK_PASSWORD') {
              errorMessage = t(($) => $.auth.weakPassword);
            } else if (context.error?.message) {
              errorMessage = context.error.message;
            }

            toast.error(
              t(($) => $.auth.errorTitle),
              {
                description: errorMessage,
                duration: 5000,
              },
            );
            console.error('Register error:', context.error);
          },
        },
      );
    },
  });

  return (
    <main className="flex flex-1 items-start justify-center bg-gray-50 px-4 py-8 sm:py-10 lg:items-center lg:py-12">
      <div className="w-full max-w-md">
        <div className="rounded-lg border bg-white p-6 shadow-lg sm:p-8">
          <h2 className="mb-6 text-center text-gray-900 sm:mb-8">
            {t(($) => $.auth.registerTitle)}
          </h2>

          <form
            className="space-y-5 sm:space-y-6"
            noValidate
            onSubmit={(event) => submitClientForm(event, form.handleSubmit)}
          >
            <form.Field name="name">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>
                    {t(($) => $.auth.name)} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    autoComplete="name"
                    type="text"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t(($) => $.auth.namePlaceholder)}
                    aria-invalid={field.state.meta.errors.length > 0}
                    aria-describedby={`${field.name}-errors`}
                  />
                  <FieldErrors id={`${field.name}-errors`} errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

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
                    autoComplete="new-password"
                    type="password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t(($) => $.auth.passwordMinimum)}
                    aria-invalid={field.state.meta.errors.length > 0}
                    aria-describedby={`${field.name}-errors`}
                  />
                  <FieldErrors id={`${field.name}-errors`} errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            <form.Field name="acceptPrivacy">
              {(field) => (
                <div className="space-y-2">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={field.name}
                      checked={field.state.value}
                      onCheckedChange={(checked) => field.handleChange(checked === true)}
                      onBlur={field.handleBlur}
                      aria-invalid={field.state.meta.errors.length > 0}
                      aria-describedby={`${field.name}-errors`}
                    />
                    <Label htmlFor={field.name} className="cursor-pointer leading-tight">
                      {t(($) => $.auth.acceptPrivacy)} <span className="text-destructive">*</span>
                    </Label>
                  </div>
                  <FieldErrors id={`${field.name}-errors`} errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            <form.Field name="acceptTerms">
              {(field) => (
                <div className="space-y-2">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={field.name}
                      checked={field.state.value}
                      onCheckedChange={(checked) => field.handleChange(checked === true)}
                      onBlur={field.handleBlur}
                      aria-invalid={field.state.meta.errors.length > 0}
                      aria-describedby={`${field.name}-errors`}
                    />
                    <Label htmlFor={field.name} className="cursor-pointer leading-tight">
                      {t(($) => $.auth.acceptTerms)} <span className="text-destructive">*</span>
                    </Label>
                  </div>
                  <FieldErrors id={`${field.name}-errors`} errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

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
                      {t(($) => $.auth.registering)}
                    </>
                  ) : (
                    t(($) => $.auth.registerAction)
                  )}
                </Button>
              )}
            </form.Subscribe>

            <div className="text-center">
              <p className="text-gray-600 text-sm">
                {t(($) => $.auth.alreadyRegistered)}{' '}
                <button
                  type="button"
                  onClick={onLoginClick}
                  className="text-brand-primary hover:text-brand-primary/80 hover:underline"
                >
                  {t(($) => $.auth.loginTitle)}
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
