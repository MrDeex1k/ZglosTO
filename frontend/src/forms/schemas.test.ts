import { enTranslation, plPLTranslation } from '@zglosto/i18n';
import { INCIDENT_IMAGE_MAX_BYTES } from '@zglosto/contracts';
import { describe, expect, it } from 'vitest';

import {
  createAdminServiceFormSchema,
  createIncidentFormSchema,
  createLoginFormSchema,
  createRegisterFormSchema,
  createRolePermissionFormSchema,
  incidentStatusFormSchema,
  serviceIncidentFormSchema,
} from './schemas';

const loginSchema = createLoginFormSchema({
  invalidEmail: 'invalid email',
  shortPassword: 'short password',
});

const registerSchema = createRegisterFormSchema({
  invalidEmail: 'invalid email',
  shortPassword: 'short password',
  requiredName: 'required name',
  privacyRequired: 'privacy required',
  termsRequired: 'terms required',
});

describe('authentication form schemas', () => {
  it('normalizes a valid login email', () => {
    expect(
      loginSchema.parse({
        email: '  resident@example.com ',
        password: 'secret',
      }),
    ).toEqual({
      email: 'resident@example.com',
      password: 'secret',
    });
  });

  it('rejects invalid login credentials before submission', () => {
    expect(
      loginSchema.safeParse({
        email: 'resident',
        password: '123',
      }).success,
    ).toBe(false);
  });

  it('requires registration identity, password and both consents', () => {
    expect(
      registerSchema.safeParse({
        name: '',
        email: 'resident@example.com',
        password: '1234567',
        acceptPrivacy: false,
        acceptTerms: false,
      }).success,
    ).toBe(false);
  });

  it('accepts complete registration data', () => {
    expect(
      registerSchema.safeParse({
        name: 'Jan',
        email: 'jan@example.com',
        password: '12345678',
        acceptPrivacy: true,
        acceptTerms: true,
      }).success,
    ).toBe(true);
  });
});

describe('incident form schemas', () => {
  const incidentSchema = createIncidentFormSchema(
    ['roads'],
    plPLTranslation.incidents.reportForm.validation,
  );

  it('accepts a report assigned to an enabled service', () => {
    expect(
      incidentSchema.safeParse({
        service: 'roads',
        address: 'Rynek 1',
        description: 'Uszkodzona nawierzchnia',
        email: 'resident@example.com',
        imageFile: null,
      }).success,
    ).toBe(true);
  });

  it('rejects a disabled service and invalid reporter email', () => {
    expect(
      incidentSchema.safeParse({
        service: 'disabled',
        address: 'Rynek 1',
        description: 'Uszkodzona nawierzchnia',
        email: 'resident',
        imageFile: null,
      }).success,
    ).toBe(false);
  });

  it('accepts PNG and JPEG files', () => {
    const baseReport = {
      service: 'roads',
      address: 'Rynek 1',
      description: 'Uszkodzona nawierzchnia',
      email: 'resident@example.com',
    };

    expect(
      incidentSchema.safeParse({
        ...baseReport,
        imageFile: new File(['png'], 'image.png', { type: 'image/png' }),
      }).success,
    ).toBe(true);
    expect(
      incidentSchema.safeParse({
        ...baseReport,
        imageFile: new File(['jpeg'], 'image.jpg', { type: 'image/jpeg' }),
      }).success,
    ).toBe(true);
  });

  it('rejects an image larger than the shared 5 MiB limit', () => {
    const result = incidentSchema.safeParse({
      service: 'roads',
      address: 'Rynek 1',
      description: 'Uszkodzona nawierzchnia',
      email: 'resident@example.com',
      imageFile: new File([new Uint8Array(INCIDENT_IMAGE_MAX_BYTES + 1)], 'image.jpg', {
        type: 'image/jpeg',
      }),
    });

    expect(result.success).toBe(false);
  });

  it('reports field errors in English', () => {
    const messages = enTranslation.incidents.reportForm.validation;
    const schema = createIncidentFormSchema(['roads'], messages);
    const result = schema.safeParse({
      service: 'unavailable',
      address: ' ',
      description: '',
      email: 'bad-email',
      imageFile: new File(['text'], 'text.txt', { type: 'text/plain' }),
    });
    expect(result.error?.issues.map(({ message }) => message)).toEqual([
      messages.unavailableService,
      messages.requiredAddress,
      messages.requiredDescription,
      messages.invalidEmail,
      messages.unsupportedImage,
    ]);
  });

  it('accepts an image exactly at the shared 5 MiB limit', () => {
    const result = incidentSchema.safeParse({
      service: 'roads',
      address: 'Rynek 1',
      description: 'Uszkodzona nawierzchnia',
      email: 'resident@example.com',
      imageFile: new File([new Uint8Array(INCIDENT_IMAGE_MAX_BYTES)], 'image.jpg', {
        type: 'image/jpeg',
      }),
    });

    expect(result.success).toBe(true);
  });

  it('rejects executable SVG files', () => {
    expect(
      incidentSchema.safeParse({
        service: 'roads',
        address: 'Rynek 1',
        description: 'Uszkodzona nawierzchnia',
        email: 'resident@example.com',
        imageFile: new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' }),
      }).success,
    ).toBe(false);
  });

  it('rejects removed map coordinates as unknown form fields', () => {
    expect(
      incidentSchema.safeParse({
        service: 'roads',
        address: 'Rynek 1',
        latitude: 52.2297,
        longitude: 21.0122,
        description: 'Uszkodzona nawierzchnia',
        email: 'resident@example.com',
        imageFile: null,
      }).success,
    ).toBe(false);
  });
});

describe('administration form schemas', () => {
  it('requires an available service key for the service role', () => {
    const schema = createRolePermissionFormSchema(['roads']);
    const email = 'user@example.com';

    expect(schema.safeParse({ email, role: 'mieszkaniec', serviceKey: '' }).success).toBe(true);
    expect(schema.safeParse({ email, role: 'sluzby', serviceKey: 'roads' }).success).toBe(true);
    expect(schema.safeParse({ email, role: 'sluzby', serviceKey: '' }).success).toBe(false);
    expect(schema.safeParse({ email, role: 'sluzby', serviceKey: 'water' }).success).toBe(false);
    expect(schema.safeParse({ email, role: 'admin', serviceKey: '' }).success).toBe(false);
  });

  it('rejects incident assignments outside the active assignment list', () => {
    const assignmentSchema = createAdminServiceFormSchema(['roads']);
    expect(assignmentSchema.safeParse({ service: 'water' }).success).toBe(false);
  });

  it('accepts only contract incident statuses', () => {
    expect(
      incidentStatusFormSchema.safeParse({
        checked: true,
        adminStatus: 'in_progress',
      }).success,
    ).toBe(true);
    expect(
      incidentStatusFormSchema.safeParse({
        checked: true,
        adminStatus: 'closed',
      }).success,
    ).toBe(false);
  });

  it('validates the optional resolved image', () => {
    expect(
      serviceIncidentFormSchema.safeParse({
        checked: true,
        adminStatus: 'resolved',
        resolvedImageFile: new File(['jpeg'], 'image.jpg', { type: 'image/jpeg' }),
      }).success,
    ).toBe(true);
    expect(
      serviceIncidentFormSchema.safeParse({
        checked: true,
        adminStatus: 'resolved',
        resolvedImageFile: 'https://example.com/image.jpg',
      }).success,
    ).toBe(false);
  });
});
