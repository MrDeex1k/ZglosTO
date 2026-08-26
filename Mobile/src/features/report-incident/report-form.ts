import {
  CurrentCreateIncidentRequestSchema,
  type CurrentCreateIncidentRequest,
} from '@zglosto/contracts';

export interface ReportIncidentFields {
  address: string;
  description: string;
  email: string;
  serviceKey: string;
}

export type ReportIncidentField = keyof ReportIncidentFields;

export type ReportIncidentValidationResult =
  | { errors: Partial<Record<ReportIncidentField, 'email' | 'required'>>; success: false }
  | { request: CurrentCreateIncidentRequest; success: true };

export function validateReportIncidentForm(
  fields: ReportIncidentFields,
  imageUploadId: string | null = null,
): ReportIncidentValidationResult {
  const errors: Partial<Record<ReportIncidentField, 'email' | 'required'>> = {};
  const email = fields.email.trim().toLowerCase();

  if (fields.description.trim() === '') errors.description = 'required';
  if (fields.address.trim() === '') errors.address = 'required';
  if (fields.serviceKey.trim() === '') errors.serviceKey = 'required';
  if (email === '') errors.email = 'required';

  const parsed = CurrentCreateIncidentRequestSchema.safeParse({
    adres_zgloszenia: fields.address,
    latitude: null,
    longitude: null,
    mail_zglaszajacego: email,
    opis_zgloszenia: fields.description,
    typ_sluzby: fields.serviceKey,
    zdjecie_incydentu_zglaszanego_upload_id: imageUploadId,
  });

  if (!parsed.success) {
    if (errors.email === undefined) {
      const hasEmailError = parsed.error.issues.some(
        (issue) => issue.path[0] === 'mail_zglaszajacego',
      );
      if (hasEmailError) errors.email = 'email';
    }
    return { errors, success: false };
  }

  return { request: parsed.data, success: true };
}
