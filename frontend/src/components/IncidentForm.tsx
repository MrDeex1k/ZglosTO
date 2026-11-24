import { incidentSubmissionNotice } from '@zglosto/i18n';
import { useForm } from '@tanstack/react-form';
import { Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { enabledServices, getServiceLabel, normalizeServiceKey } from '../config/services';
import { getLocalizedText, whiteLabelConfig } from '../config/white-label';
import { createIncidentFormSchema, type IncidentFormValues } from '../forms/schemas';
import { submitClientForm } from '../forms/submit';
import { useCreateIncidentMutation } from '../hooks/use-incident-mutations';
import { getCurrentLocale } from '../i18n';
import { uploadReportImage } from '../services/api';
import type { NewIncidentDraft } from '../types/incident';
import { EmergencyDisclaimer } from './forms/EmergencyDisclaimer';
import { FieldErrors } from './forms/field-errors';
import { IncidentImageField } from './forms/IncidentImageField';
import { SubmissionAlert, type SubmissionAlertType } from './forms/SubmissionAlert';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';

interface IncidentFormProps {
  onSubmit: (incident: NewIncidentDraft) => void;
  reporterEmail: string | null;
}

export function IncidentForm({ onSubmit, reporterEmail }: IncidentFormProps) {
  const { t } = useTranslation();
  const createIncidentMutation = useCreateIncidentMutation();
  const pendingSubmit = useRef<NewIncidentDraft | null>(null);
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    type: SubmissionAlertType;
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'success',
    title: '',
    message: '',
  });
  const enabledServiceKeys = enabledServices.map((service) => service.key);
  const incidentSchema = createIncidentFormSchema(
    enabledServiceKeys,
    t(($) => $.incidents.reportForm.validation, { returnObjects: true }),
  );
  const defaultValues: IncidentFormValues = {
    service: '',
    description: '',
    address: '',
    email: reporterEmail ?? '',
    imageFile: null,
  };
  const serviceItems = enabledServices.map((service) => ({
    value: service.key,
    label: service.label[getCurrentLocale()],
  }));
  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: incidentSchema,
    },
    onSubmit: async ({ value }) => {
      const incident = incidentSchema.parse(value);
      try {
        const imageUploadId =
          incident.imageFile === null ? null : await uploadReportImage(incident.imageFile);
        const result = await createIncidentMutation.mutateAsync({
          opis_zgloszenia: incident.description,
          mail_zglaszajacego: incident.email,
          adres_zgloszenia: incident.address,
          latitude: null,
          longitude: null,
          typ_sluzby: incident.service,
          zdjecie_incydentu_zglaszanego_upload_id: imageUploadId,
        });

        setAlertState({
          isOpen: true,
          ...incidentSubmissionNotice(
            result.classification.classification,
            getServiceLabel(result.incydent.typ_sluzby, getCurrentLocale()),
            getCurrentLocale(),
          ),
        });

        pendingSubmit.current = {
          service: normalizeServiceKey(result.incydent.typ_sluzby),
          description: incident.description,
          address: incident.address,
          latitude: null,
          longitude: null,
          email: incident.email,
          imageUrl: result.incydent.zdjecie_incydentu_zglaszanego?.url ?? null,
          resolvedImageUrl: null,
          checked: false,
          adminStatus: 'reported',
        };
        form.reset();
      } catch (error) {
        console.error('Error submitting incident:', error);
        setAlertState({
          isOpen: true,
          type: 'error',
          title: t(($) => $.incidents.reportForm.errorTitle),
          message: t(($) => $.incidents.reportForm.errorMessage),
        });
      }
    },
  });

  const completeSubmission = () => {
    const submittedIncident = pendingSubmit.current;
    pendingSubmit.current = null;
    setAlertState((current) => ({ ...current, isOpen: false }));
    if (submittedIncident !== null) onSubmit(submittedIncident);
  };

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(event) => submitClientForm(event, form.handleSubmit)}
    >
      <EmergencyDisclaimer />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-8">
        <div className="min-w-0 space-y-6">
          <form.Field name="service">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>
                  {t(($) => $.incidents.reportForm.service)}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Select
                  items={serviceItems}
                  value={field.state.value}
                  onValueChange={(value) => {
                    if (value !== null) field.handleChange(value);
                  }}
                >
                  <SelectTrigger
                    id={field.name}
                    aria-invalid={field.state.meta.errors.length > 0}
                    aria-describedby={`${field.name}-errors`}
                  >
                    <SelectValue
                      placeholder={t(($) => $.incidents.reportForm.servicePlaceholder)}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledServices.map((configuredService) => (
                      <SelectItem key={configuredService.key} value={configuredService.key}>
                        {configuredService.label[getCurrentLocale()]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldErrors id={`${field.name}-errors`} errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <form.Field name="address">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>
                  {t(($) => $.incidents.reportForm.address)}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={getLocalizedText(
                    whiteLabelConfig.localContent.reportAddressPlaceholder,
                    getCurrentLocale(),
                  )}
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={`${field.name}-errors`}
                />
                <FieldErrors id={`${field.name}-errors`} errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>
                  {t(($) => $.incidents.reportForm.description)}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={t(($) => $.incidents.reportForm.descriptionPlaceholder)}
                  rows={8}
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
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={t(($) => $.auth.emailPlaceholder)}
                  type="email"
                  readOnly={reporterEmail !== null}
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={`${field.name}-errors`}
                />
                <FieldErrors id={`${field.name}-errors`} errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>
        </div>

        <div className="min-w-0 space-y-6 lg:border-l lg:border-border/70 lg:pl-8">
          <form.Field name="imageFile">
            {(field) => (
              <IncidentImageField
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        </div>
      </div>

      <div className="flex justify-end border-t border-border/70 pt-5">
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <Button
              type="submit"
              className="w-full bg-brand-primary hover:bg-brand-primary/90 sm:w-auto"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t(($) => $.incidents.reportForm.submitting)}
                </>
              ) : (
                t(($) => $.incidents.reportForm.submit)
              )}
            </Button>
          )}
        </form.Subscribe>
      </div>

      <SubmissionAlert {...alertState} onContinue={completeSubmission} />
    </form>
  );
}
