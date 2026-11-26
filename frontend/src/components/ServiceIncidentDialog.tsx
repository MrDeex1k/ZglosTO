import { useForm } from '@tanstack/react-form';
import { isIncidentStatus } from '@zglosto/contracts';
import { Calendar, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getServiceBadgeStyle, getServiceLabel, getServiceShortLabel } from '../config/services';
import { serviceIncidentFormSchema, type ServiceIncidentFormValues } from '../forms/schemas';
import { submitClientForm } from '../forms/submit';
import { useServiceIncidentMutation } from '../hooks/use-incident-mutations';
import { getCurrentLocale } from '../i18n';
import { getIncidentStatusLabel } from '../lib/incident-status';
import { ApiResponseError, fetchServiceIncident } from '../services/api';
import { mapServiceIncident } from '../queries/incidents';
import type { ServiceIncident } from '../types/incident';
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
  incident: ServiceIncident;
  onClose: () => void;
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

function ServiceIncidentInformation({ incident }: Readonly<{ incident: ServiceIncident }>) {
  return (
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
        <div className="text-gray-900">{getServiceLabel(incident.service, getCurrentLocale())}</div>
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
  );
}

function ServiceIncidentImages({
  incident,
  file,
}: Readonly<{ incident: ServiceIncident; file: File | null }>) {
  return (
    <section
      className={INCIDENT_DIALOG_DIVIDED_SECTION_CLASS_NAME + ' xl:pr-6'}
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
        {incident.resolvedImageUrl !== null && (
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
        )}
        {file !== null && <SelectedResolutionImagePreview file={file} />}
        {file === null && incident.imageUrl === null && incident.resolvedImageUrl === null && (
          <p className="text-muted-foreground">Brak zdjęć dla tego zgłoszenia.</p>
        )}
      </div>
    </section>
  );
}

type SubmitError = 'conflict' | 'unconfirmed' | null;
type RefreshState = 'idle' | 'loading' | 'failed' | 'review';

function ServiceIncidentSaveFeedback({
  incident,
  submitError,
  refreshState,
  onRefresh,
}: Readonly<{
  incident: ServiceIncident;
  submitError: SubmitError;
  refreshState: RefreshState;
  onRefresh: () => void;
}>) {
  const { t } = useTranslation();
  if (submitError !== null) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-destructive">
          {submitError === 'conflict'
            ? t(($) => $.incidents.management.conflict)
            : t(($) => $.incidents.management.serviceSaveUnconfirmed)}
        </p>
        {refreshState === 'failed' && (
          <p role="alert" className="text-sm text-destructive">
            {t(($) => $.incidents.management.loadFailed)}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={refreshState === 'loading'}
          onClick={onRefresh}
        >
          {t(($) => $.incidents.management.reloadReport)}
        </Button>
      </div>
    );
  }

  if (refreshState !== 'review') return null;

  return (
    <output className="block text-sm text-muted-foreground">
      {t(($) => $.incidents.management.reviewDraft, {
        status: getIncidentStatusLabel(incident.adminStatus),
        verified: incident.checked
          ? t(($) => $.incidents.management.verified)
          : t(($) => $.incidents.management.unverified),
      })}
    </output>
  );
}

export function ServiceIncidentDialog({
  incident: initialIncident,
  onClose,
}: Readonly<ServiceIncidentDialogProps>) {
  const { t } = useTranslation();
  const mutation = useServiceIncidentMutation();
  const uploadInput = useRef<HTMLInputElement>(null);
  // Keep the revision paired with the values on which the operator based the draft.
  const [incident, setIncident] = useState(initialIncident);
  const [submitError, setSubmitError] = useState<SubmitError>(null);
  const [refreshState, setRefreshState] = useState<RefreshState>('idle');
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
      if (submitError !== null) return;
      try {
        await mutation.mutateAsync({ incident, values: update });
        onClose();
      } catch (error) {
        setRefreshState('idle');
        setSubmitError(
          error instanceof ApiResponseError && error.status === 409 ? 'conflict' : 'unconfirmed',
        );
      }
    },
  });

  const refreshDraft = async () => {
    setRefreshState('loading');
    let latest: ServiceIncident;
    try {
      const row = await fetchServiceIncident(incident.id);
      if (row === null) {
        onClose();
        return;
      }
      latest = mapServiceIncident(row);
    } catch {
      setRefreshState('failed');
      return;
    }
    const draft = form.state.values;
    const locked = latest.adminStatus === 'resolved';
    // Adopt server values for fields the operator left unchanged or can no longer edit.
    if (locked || draft.checked === incident.checked) {
      form.setFieldValue('checked', latest.checked);
    }
    if (locked || draft.adminStatus === incident.adminStatus) {
      form.setFieldValue('adminStatus', latest.adminStatus);
    }
    setIncident(latest);
    setSubmitError(null);
    setRefreshState('review');
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !form.state.isSubmitting && refreshState !== 'loading') onClose();
      }}
    >
      <DialogContent className={INCIDENT_MANAGEMENT_DIALOG_CONTENT_CLASS_NAME}>
        <DialogHeader className="pr-10">
          <DialogTitle>Szczegóły zgłoszenia - Panel Służby</DialogTitle>
          <DialogDescription>
            Przeglądaj szczegóły i zarządzaj statusem zgłoszenia
          </DialogDescription>
        </DialogHeader>

        <div className={INCIDENT_DIALOG_THREE_SECTION_CLASS_NAME}>
          <ServiceIncidentInformation incident={incident} />

          <form.Subscribe selector={(state) => state.values.resolvedImageFile}>
            {(file) => <ServiceIncidentImages incident={incident} file={file} />}
          </form.Subscribe>

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
                      className="peer sr-only"
                      id="resolved-image-upload"
                      ref={uploadInput}
                      aria-invalid={field.state.meta.errors.length > 0}
                      aria-describedby={
                        field.state.value === null
                          ? 'resolved-image-upload-errors'
                          : 'resolved-image-selection resolved-image-upload-errors'
                      }
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        field.handleChange(file);
                      }}
                    />
                    <label
                      htmlFor="resolved-image-upload"
                      className="cursor-pointer rounded-lg bg-gray-100 px-3 py-2 text-gray-800 hover:bg-gray-200 peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                    >
                      Wybierz zdjęcie
                    </label>
                  </div>
                  {field.state.value !== null && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span id="resolved-image-selection" className="text-sm text-muted-foreground">
                        Wybrano: {field.state.value.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          field.handleChange(null);
                          if (uploadInput.current !== null) uploadInput.current.value = '';
                        }}
                      >
                        {t(($) => $.incidents.management.removeDraftPhoto)}
                      </Button>
                    </div>
                  )}
                  <FieldErrors id="resolved-image-upload-errors" errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            <ServiceIncidentSaveFeedback
              incident={incident}
              submitError={submitError}
              refreshState={refreshState}
              onRefresh={() => void refreshDraft()}
            />

            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
              {([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  className="w-full bg-brand-primary hover:bg-brand-primary/90"
                  disabled={!canSubmit || isSubmitting || submitError !== null}
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
