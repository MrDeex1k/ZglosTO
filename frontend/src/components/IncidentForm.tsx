import { useForm } from '@tanstack/react-form';
import { Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';

import { enabledServices, normalizeServiceKey } from '../config/services';
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
  const incidentSchema = createIncidentFormSchema(enabledServiceKeys);
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

        if (result.classification.classification === 'emergency') {
          setAlertState({
            isOpen: true,
            type: 'emergency',
            title: 'Pomoc ratunkowa',
            message:
              'Zgłoszenie zostało zarejestrowane. Na podstawie analizy Twojego zgłoszenia, sprawą powinny się zająć służby ratunkowe. Zadzwoń pod numer alarmowy 112!',
          });
        } else if (result.classification.classification === 'unknown') {
          setAlertState({
            isOpen: true,
            type: 'review',
            title: 'Zgłoszenie przyjęte',
            message:
              'Zgłoszenie zostało zapisane. Automatyczna klasyfikacja jest obecnie niedostępna, dlatego zgłoszenie zostanie zweryfikowane ręcznie.',
          });
        } else {
          setAlertState({
            isOpen: true,
            type: 'success',
            title: 'Sukces',
            message: 'Zgłoszenie zostało pomyślnie wysłane i zarejestrowane w systemie!',
          });
        }

        pendingSubmit.current = {
          service: normalizeServiceKey(result.classification.serviceKey),
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
          title: 'Błąd wysyłania',
          message: 'Nie udało się wysłać zgłoszenia. Spróbuj ponownie później.',
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
                  Wybierz służbę <span className="text-destructive">*</span>
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
                    <SelectValue placeholder="Wybierz właściwą służbę" />
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
                  Adres <span className="text-destructive">*</span>
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
                  Opis zgłoszenia <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Opisz szczegółowo problem..."
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
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="np. jan.kowalski@example.com"
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
                  Wysyłanie...
                </>
              ) : (
                'Wyślij zgłoszenie'
              )}
            </Button>
          )}
        </form.Subscribe>
      </div>

      <SubmissionAlert {...alertState} onContinue={completeSubmission} />
    </form>
  );
}
