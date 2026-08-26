import { useForm } from '@tanstack/react-form';
import { isIncidentStatus, type IncidentStatusCode } from '@zglosto/contracts';
import { Calendar, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';

import { getServiceBadgeStyle, getServiceLabel, getServiceShortLabel } from '../config/services';
import { serviceIncidentFormSchema, type ServiceIncidentFormValues } from '../forms/schemas';
import { submitClientForm } from '../forms/submit';
import { getCurrentLocale } from '../i18n';
import { getIncidentStatusLabel } from '../lib/incident-status';
import type { Incident } from '../types/incident';
import { formatPolishDate } from '../utils/dateUtils';
import { FieldErrors } from './forms/field-errors';
import { IncidentAddressDirectionsLink } from './IncidentAddressDirectionsLink';
import {
  INCIDENT_DIALOG_DIVIDED_SECTION_CLASS_NAME,
  INCIDENT_DIALOG_THREE_SECTION_CLASS_NAME,
  INCIDENT_MANAGEMENT_DIALOG_CONTENT_CLASS_NAME,
} from './incident-dialog-styles';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface ServiceIncidentDialogProps {
  incident: Incident | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (
    incidentId: string,
    checked: boolean,
    adminStatus: IncidentStatusCode,
    resolvedImageFile: File | null,
  ) => Promise<void>;
}

function SelectedResolutionImagePreview({ file }: Readonly<{ file: File }>) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <ImageIcon className="h-4 w-4" />
        Podgląd zdjęcia po naprawie
      </div>
      <img
        ref={(element) => {
          if (element === null) return;
          const previewUrl = URL.createObjectURL(file);
          element.src = previewUrl;
          return () => URL.revokeObjectURL(previewUrl);
        }}
        alt={`Podgląd zdjęcia po naprawie: ${file.name}`}
        className="h-72 w-full rounded-lg border bg-gray-50 object-contain"
      />
    </div>
  );
}

export function ServiceIncidentDialog({
  incident,
  open,
  onOpenChange,
  onUpdate,
}: ServiceIncidentDialogProps) {
  if (!incident) return null;

  return (
    <ServiceIncidentDialogContent
      key={incident.id}
      incident={incident}
      open={open}
      onOpenChange={onOpenChange}
      onUpdate={onUpdate}
    />
  );
}

function ServiceIncidentDialogContent({
  incident,
  open,
  onOpenChange,
  onUpdate,
}: Omit<ServiceIncidentDialogProps, 'incident'> & { incident: Incident }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isFixed = incident.adminStatus === 'resolved';
  const statusItems = (['reported', 'in_progress', 'resolved'] as const).map((status) => ({
    value: status,
    label: getIncidentStatusLabel(status),
  }));
  const defaultValues: ServiceIncidentFormValues = {
    checked: incident.checked,
    adminStatus: incident.adminStatus,
    resolvedImageFile: null,
  };
  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: serviceIncidentFormSchema,
    },
    onSubmit: async ({ value }) => {
      const update = serviceIncidentFormSchema.parse(value);
      setSubmitError(null);
      try {
        await onUpdate(incident.id, update.checked, update.adminStatus, update.resolvedImageFile);
        onOpenChange(false);
      } catch {
        setSubmitError('Nie udało się zapisać zmian. Spróbuj ponownie.');
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={INCIDENT_MANAGEMENT_DIALOG_CONTENT_CLASS_NAME}>
        <DialogHeader className="pr-10">
          <DialogTitle>Szczegóły zgłoszenia - Panel Służby</DialogTitle>
          <DialogDescription>
            Przeglądaj szczegóły i zarządzaj statusem zgłoszenia
          </DialogDescription>
        </DialogHeader>

        <div className={INCIDENT_DIALOG_THREE_SECTION_CLASS_NAME}>
          <section className="min-w-0 space-y-6 xl:pr-6" aria-labelledby="service-incident-info">
            <h3 id="service-incident-info" className="font-semibold text-gray-900">
              Informacje
            </h3>

            <div className="flex flex-wrap items-center gap-2">
              <Badge style={getServiceBadgeStyle(incident.service)}>
                {getServiceShortLabel(incident.service, getCurrentLocale())}
              </Badge>
              <Badge
                variant="outline"
                className={
                  incident.adminStatus === 'resolved'
                    ? 'border-success bg-success/10 text-success'
                    : incident.adminStatus === 'in_progress'
                      ? 'border-orange-500 bg-orange-100 text-orange-700'
                      : 'border-gray-500 bg-gray-100 text-gray-700'
                }
              >
                {getIncidentStatusLabel(incident.adminStatus)}
              </Badge>
            </div>

            <div>
              <div className="mb-1 text-gray-500">Służba odpowiedzialna</div>
              <div className="text-gray-900">
                {getServiceLabel(incident.service, getCurrentLocale())}
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-4 w-4 text-gray-500" />
              <div>
                <div className="text-gray-500">Data zgłoszenia</div>
                <div className="text-gray-900">{formatPolishDate(incident.createdAt)}</div>
              </div>
            </div>

            {incident.resolvedAt !== null && (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
                <div>
                  <div className="text-gray-500">Data rozwiązania</div>
                  <div className="text-gray-900">{formatPolishDate(incident.resolvedAt)}</div>
                </div>
              </div>
            )}

            <div>
              <div className="mb-1 text-gray-500">Opis zgłoszenia</div>
              <p className="text-gray-900">{incident.description}</p>
            </div>

            <div>
              <div className="mb-1 text-gray-500">Adres</div>
              <IncidentAddressDirectionsLink address={incident.address} />
            </div>

            <div>
              <div className="mb-1 text-gray-500">Email zgłaszającego</div>
              <div className="break-all text-gray-900">{incident.email}</div>
            </div>
          </section>

          <section
            className={`${INCIDENT_DIALOG_DIVIDED_SECTION_CLASS_NAME} xl:pr-6`}
            aria-labelledby="service-incident-images"
          >
            <h3 id="service-incident-images" className="font-semibold text-gray-900">
              Zdjęcia
            </h3>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {incident.imageUrl !== null && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-500">
                    <ImageIcon className="h-4 w-4" />
                    Zdjęcie zgłoszenia
                  </div>
                  <img
                    src={incident.imageUrl}
                    alt="Zdjęcie incydentu"
                    className="h-72 w-full rounded-lg border bg-gray-50 object-contain"
                  />
                </div>
              )}

              <form.Subscribe selector={(state) => state.values.resolvedImageFile}>
                {(resolvedImageFile) =>
                  resolvedImageFile !== null ? (
                    <SelectedResolutionImagePreview
                      key={`${resolvedImageFile.name}:${resolvedImageFile.size}:${resolvedImageFile.lastModified}`}
                      file={resolvedImageFile}
                    />
                  ) : incident.resolvedImageUrl !== null ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-gray-500">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        Zdjęcie po naprawie
                      </div>
                      <img
                        src={incident.resolvedImageUrl}
                        alt="Zdjęcie po rozwiązaniu"
                        className="h-72 w-full rounded-lg border bg-gray-50 object-contain"
                      />
                    </div>
                  ) : incident.imageUrl === null ? (
                    <p className="text-muted-foreground">Brak zdjęć dla tego zgłoszenia.</p>
                  ) : null
                }
              </form.Subscribe>
            </div>
          </section>

          <form
            className={INCIDENT_DIALOG_DIVIDED_SECTION_CLASS_NAME}
            noValidate
            onSubmit={(event) => submitClientForm(event, form.handleSubmit)}
            aria-labelledby="service-incident-management"
          >
            <h3 id="service-incident-management" className="font-semibold text-gray-900">
              Zarządzanie
            </h3>

            <form.Field name="checked">
              {(field) => (
                <div>
                  <div className="mb-2 text-gray-700">Czy sprawdzone?</div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={field.state.value ? 'default' : 'outline'}
                      className={field.state.value ? 'bg-success hover:bg-success/90' : ''}
                      onClick={() => field.handleChange(true)}
                      disabled={isFixed}
                    >
                      TAK
                    </Button>
                    <Button
                      type="button"
                      variant={!field.state.value ? 'default' : 'outline'}
                      className={!field.state.value ? 'bg-gray-600 hover:bg-gray-700' : ''}
                      onClick={() => field.handleChange(false)}
                      disabled={isFixed}
                    >
                      NIE
                    </Button>
                  </div>
                </div>
              )}
            </form.Field>

            <form.Field name="adminStatus">
              {(field) => (
                <div>
                  <label htmlFor="service-incident-status" className="mb-2 block text-gray-700">
                    Status
                  </label>
                  {isFixed && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3">
                      <CheckCircle2 className="h-5 w-5 text-success" />
                      <span className="text-success">
                        Zgłoszenie zostało naprawione i nie można zmienić jego statusu
                      </span>
                    </div>
                  )}
                  <Select
                    items={statusItems}
                    value={field.state.value}
                    onValueChange={(value) => {
                      if (isIncidentStatus(value)) field.handleChange(value);
                    }}
                    disabled={isFixed}
                  >
                    <SelectTrigger
                      id="service-incident-status"
                      className={`w-full ${isFixed ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <SelectValue placeholder="Wybierz status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reported">{getIncidentStatusLabel('reported')}</SelectItem>
                      <SelectItem value="in_progress">
                        {getIncidentStatusLabel('in_progress')}
                      </SelectItem>
                      <SelectItem value="resolved">{getIncidentStatusLabel('resolved')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>

            <form.Field name="resolvedImageFile">
              {(field) => (
                <div>
                  <div className="mb-2 text-gray-700">Zdjęcie po naprawie</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      id="resolved-image-upload"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        field.handleChange(file);
                      }}
                    />
                    <label
                      htmlFor="resolved-image-upload"
                      className="cursor-pointer rounded-lg bg-gray-100 px-3 py-2 text-gray-800 hover:bg-gray-200"
                    >
                      Wybierz zdjęcie
                    </label>
                  </div>
                  {field.state.value !== null && (
                    <div className="mt-3">
                      <span className="text-sm text-muted-foreground">
                        Wybrano: {field.state.value.name}
                      </span>
                    </div>
                  )}
                  <FieldErrors id="resolved-image-upload-errors" errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            {submitError !== null && (
              <p role="alert" className="text-sm text-destructive">
                {submitError}
              </p>
            )}

            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
              {([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  className="w-full bg-brand-primary hover:bg-brand-primary/90"
                  disabled={!canSubmit || isSubmitting}
                >
                  Zapisz zmiany
                </Button>
              )}
            </form.Subscribe>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
