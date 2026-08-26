import { INCIDENT_IMAGE_MAX_BYTES, INCIDENT_STATUSES } from '@zglosto/contracts';
import { z } from 'zod';

interface LoginValidationMessages {
  invalidEmail: string;
  shortPassword: string;
}

interface RegisterValidationMessages extends LoginValidationMessages {
  requiredName: string;
  privacyRequired: string;
  termsRequired: string;
}

function emailSchema(message: string) {
  return z
    .string()
    .trim()
    .pipe(z.email({ error: message }));
}

export function createLoginFormSchema(messages: LoginValidationMessages) {
  return z.object({
    email: emailSchema(messages.invalidEmail),
    password: z.string().min(6, messages.shortPassword),
  });
}

export function createRegisterFormSchema(messages: RegisterValidationMessages) {
  return z.object({
    name: z.string().trim().min(1, messages.requiredName),
    email: emailSchema(messages.invalidEmail),
    password: z.string().min(8, messages.shortPassword),
    acceptPrivacy: z.boolean().refine((accepted) => accepted, messages.privacyRequired),
    acceptTerms: z.boolean().refine((accepted) => accepted, messages.termsRequired),
  });
}

function imageFileSchema() {
  return z
    .custom<File>((value) => typeof File !== 'undefined' && value instanceof File, {
      error: 'Wybierz prawidłowy plik obrazu.',
    })
    .refine(
      (file) => file.type === 'image/png' || file.type === 'image/jpeg',
      'Dozwolone są wyłącznie obrazy PNG, JPG i JPEG.',
    )
    .refine((file) => file.size <= INCIDENT_IMAGE_MAX_BYTES, 'Obraz może mieć maksymalnie 5 MB.');
}

export function createIncidentFormSchema(enabledServiceKeys: readonly string[]) {
  return z.strictObject({
    service: z
      .string()
      .min(1, 'Wybierz właściwą służbę.')
      .refine(
        (service) => service.length === 0 || enabledServiceKeys.includes(service),
        'Wybrana służba jest niedostępna.',
      ),
    address: z.string().trim().min(1, 'Podaj adres zgłoszenia.'),
    description: z.string().trim().min(1, 'Opisz zgłaszany problem.'),
    email: emailSchema('Podaj prawidłowy adres e-mail.'),
    imageFile: imageFileSchema().nullable(),
  });
}

export const rolePermissionFormSchema = z.object({
  email: emailSchema('Podaj prawidłowy adres e-mail.'),
  role: z.enum(['mieszkaniec', 'sluzby']),
});

export function createServicePermissionFormSchema(assignableServiceKeys: readonly string[]) {
  return z.object({
    email: emailSchema('Podaj prawidłowy adres e-mail.'),
    service: z
      .string()
      .min(1, 'Wybierz służbę.')
      .refine(
        (service) => service.length === 0 || assignableServiceKeys.includes(service),
        'Wybrana służba jest niedostępna.',
      ),
  });
}

export function createAdminServiceFormSchema(assignableServiceKeys: readonly string[]) {
  return z.object({
    service: z
      .string()
      .min(1, 'Wybierz służbę.')
      .refine(
        (service) => service.length === 0 || assignableServiceKeys.includes(service),
        'Wybrana służba jest niedostępna.',
      ),
  });
}

export const incidentStatusFormSchema = z.object({
  checked: z.boolean(),
  adminStatus: z.enum(INCIDENT_STATUSES),
});

export const serviceIncidentFormSchema = incidentStatusFormSchema.extend({
  resolvedImageFile: imageFileSchema().nullable(),
});

export type LoginFormValues = z.input<ReturnType<typeof createLoginFormSchema>>;
export type RegisterFormValues = z.input<ReturnType<typeof createRegisterFormSchema>>;
export type IncidentFormValues = z.input<ReturnType<typeof createIncidentFormSchema>>;
export type RolePermissionFormValues = z.input<typeof rolePermissionFormSchema>;
export type ServicePermissionFormValues = z.input<
  ReturnType<typeof createServicePermissionFormSchema>
>;
export type AdminServiceFormValues = z.input<ReturnType<typeof createAdminServiceFormSchema>>;
export type IncidentStatusFormValues = z.input<typeof incidentStatusFormSchema>;
export type ServiceIncidentFormValues = z.input<typeof serviceIncidentFormSchema>;
