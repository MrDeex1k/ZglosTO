import { USER_ROLES, type UserRole } from './auth.js';
import { z } from 'zod';

export const UpdateUserPermissionsRequestSchema = z
  .object({
    email: z
      .string()
      .trim()
      .pipe(z.email())
      .transform((email) => email.toLowerCase()),
    uprawnienia: z.enum(USER_ROLES),
    serviceKey: z.string().trim().min(1).nullable().default(null),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.uprawnienia === 'sluzby' && request.serviceKey === null) {
      context.addIssue({
        code: 'custom',
        message: 'serviceKey is required for sluzby role',
        path: ['serviceKey'],
      });
    }
    if (request.uprawnienia !== 'sluzby' && request.serviceKey !== null) {
      context.addIssue({
        code: 'custom',
        message: 'serviceKey must be null outside sluzby role',
        path: ['serviceKey'],
      });
    }
  });

export type UpdateUserPermissionsRequest = z.infer<typeof UpdateUserPermissionsRequestSchema>;

export interface UpdatedUserPermissions {
  id_uzytkownika: string;
  uprawnienia: UserRole;
  serviceKey: string | null;
}

export interface UpdateUserPermissionsResponse {
  success: true;
  updated: UpdatedUserPermissions;
}

export const UpdatedUserPermissionsSchema = z
  .object({
    id_uzytkownika: z.string(),
    uprawnienia: z.enum(USER_ROLES),
    serviceKey: z.string().nullable(),
  })
  .strict();

export const UpdateUserPermissionsResponseSchema = z
  .object({ success: z.literal(true), updated: UpdatedUserPermissionsSchema })
  .strict();
