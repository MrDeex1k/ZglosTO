import { useForm } from '@tanstack/react-form';
import { isIncidentStatus, type IncidentStatusCode } from '@zglosto/contracts';
import { Calendar, CheckCircle2, Image as ImageIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  assignableServices,
  getServiceBadgeStyle,
  getServiceShortLabel,
  isFallbackService,
} from '../config/services';
import {
  createAdminServiceFormSchema,
  incidentStatusFormSchema,
  type AdminServiceFormValues,
  type IncidentStatusFormValues,
} from '../forms/schemas';
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

interface AdminIncidentDialogProps {
  incident: Incident | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateService: (incidentId: string, newService: string) => Promise<void>;
  onUpdate: (
    incidentId: string,
    checked: boolean,
    adminStatus: IncidentStatusCode,
    resolvedImageFile: File | null,
  ) => Promise<void>;
}

function AdminIncidentInformation({ incident }: Readonly<{ incident: Incident }>) {
  return (
    <section className="min-w-0 space-y-6 xl:pr-6" aria-labelledby="admin-incident-info">
      <h3 id="admin-incident-info" className="font-semibold text-gray-900">
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
        <p className="break-all text-gray-900">{incident.email}</p>
      </div>
    </section>
  );
}

interface AdminIncidentAlertProps {
  type: 'success' | 'error';
  message: string;
  onClose: () => void;
}

function AdminIncidentAlert({ type, message, onClose }: Readonly<AdminIncidentAlertProps>) {
  const isSuccess = type === 'success';

  return (
    <div
      className={`mb-6 flex items-start justify-between rounded-lg border-2 p-4 xl:col-span-3 ${
        isSuccess ? 'border-success bg-success/10' : 'border-destructive bg-destructive/10'
      }`}
    >
      <p className={isSuccess ? 'text-success' : 'text-destructive'}>{message}</p>
      <button
        type="button"
        aria-label="Zamknij komunikat"
        onClick={onClose}
        className={`ml-4 ${
          isSuccess
            ? 'text-success hover:text-success/80'
            : 'text-destructive hover:text-destructive/80'
        }`}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function AdminIncidentImages({ incident }: Readonly<{ incident: Incident }>) {
  return (
    <section
      className={`${INCIDENT_DIALOG_DIVIDED_SECTION_CLASS_NAME} xl:pr-6`}
      aria-labelledby="admin-incident-images"
    >
      <h3 id="admin-incident-images" className="font-semibold text-gray-900">
        Zdjęcia
      </h3>

      {incident.imageUrl === null && incident.resolvedImageUrl === null ? (
        <p className="text-muted-foreground">Brak zdjęć dla tego zgłoszenia.</p>
      ) : (
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
        </div>
      )}
    </section>
  );
}

export function AdminIncidentDialog({
  incident,
  open,
  onOpenChange,
  onUpdateService,
  onUpdate,
}: AdminIncidentDialogProps) {
  if (!incident) return null;

  return (
    <AdminIncidentDialogContent
      key={incident.id}
      incident={incident}
      open={open}
      onOpenChange={onOpenChange}
      onUpdateService={onUpdateService}
      onUpdate={onUpdate}
    />
  );
}

function AdminIncidentDialogContent({
  incident,
  open,
  onOpenChange,
  onUpdateService,
  onUpdate,
}: Omit<AdminIncidentDialogProps, 'incident'> & { incident: Incident }) {
  const assignableServiceKeys = assignableServices.map((service) => service.key);
  const adminServiceSchema = createAdminServiceFormSchema(assignableServiceKeys);
  const serviceItems = assignableServices.map((service) => ({
    value: service.key,
    label: service.label[getCurrentLocale()],
  }));
  const statusItems = (['reported', 'in_progress', 'resolved'] as const).map((status) => ({
    value: status,
    label: getIncidentStatusLabel(status),
  }));
  const [alert, setAlert] = useState<{
    type: 'success' | 'error';
    message: string;
    visible: boolean;
  }>({
    type: 'success',
    message: '',
    visible: false,
  });
  const serviceDefaultValues: AdminServiceFormValues = {
    service: isFallbackService(incident.service) ? '' : incident.service,
  };
  const serviceForm = useForm({
    defaultValues: serviceDefaultValues,
    validators: {
      onSubmit: adminServiceSchema,
    },
    onSubmit: async ({ value }) => {
      const assignment = adminServiceSchema.parse(value);
      try {
        await onUpdateService(incident.id, assignment.service);
        onOpenChange(false);
      } catch {
        setAlert({
          type: 'error',
          message: 'Nie udało się przypisać zgłoszenia do służby.',
          visible: true,
        });
      }
    },
  });
  const statusDefaultValues: IncidentStatusFormValues = {
    checked: incident.checked,
    adminStatus: incident.adminStatus,
  };
  const statusForm = useForm({
    defaultValues: statusDefaultValues,
    validators: {
      onSubmit: incidentStatusFormSchema,
    },
    onSubmit: async ({ value }) => {
      const status = incidentStatusFormSchema.parse(value);
      try {
        await onUpdate(incident.id, status.checked, status.adminStatus, null);
        onOpenChange(false);
      } catch {
        setAlert({
          type: 'error',
          message: 'Nie udało się zaktualizować statusu zgłoszenia.',
          visible: true,
        });
      }
    },
  });

  // Auto-hide alert po 10 sekundach
  useEffect(() => {
    if (alert.visible) {
      const timer = setTimeout(() => {
        setAlert((prev) => ({ ...prev, visible: false }));
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [alert.visible]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={INCIDENT_MANAGEMENT_DIALOG_CONTENT_CLASS_NAME}>
        <DialogHeader className="pr-10">
          <DialogTitle>Szczegóły zgłoszenia (Admin)</DialogTitle>
          <DialogDescription>
            Oto szczegółowe informacje dotyczące zgłoszenia. Możesz przypisać je do odpowiedniej
            służby.
          </DialogDescription>
        </DialogHeader>

        <div className={INCIDENT_DIALOG_THREE_SECTION_CLASS_NAME}>
          {alert.visible && (
            <AdminIncidentAlert
              type={alert.type}
              message={alert.message}
              onClose={() => setAlert((previous) => ({ ...previous, visible: false }))}
            />
          )}

          <AdminIncidentInformation incident={incident} />

          <AdminIncidentImages incident={incident} />

          <section
            className={INCIDENT_DIALOG_DIVIDED_SECTION_CLASS_NAME}
            aria-labelledby="admin-incident-management"
          >
            <h3 id="admin-incident-management" className="font-semibold text-gray-900">
              Zarządzanie
            </h3>

            {isFallbackService(incident.service) && (
              <form
                className="space-y-4"
                noValidate
                onSubmit={(event) => submitClientForm(event, serviceForm.handleSubmit)}
              >
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                  <p className="text-orange-800">
                    <strong>Uwaga!</strong> To zgłoszenie wymaga przypisania do odpowiedniej służby
                    miejskiej.
                  </p>
                </div>

                <serviceForm.Field name="service">
                  {(field) => (
                    <div>
                      <label htmlFor="admin-incident-service" className="mb-2 block text-gray-700">
                        Przypisz zgłoszenie do służby
                      </label>
                      <Select
                        items={serviceItems}
                        value={field.state.value}
                        onValueChange={(value) => {
                          if (value !== null) field.handleChange(value);
                        }}
                      >
                        <SelectTrigger
                          id="admin-incident-service"
                          className="w-full"
                          aria-invalid={field.state.meta.errors.length > 0}
                          aria-describedby="admin-incident-service-errors"
                        >
                          <SelectValue placeholder="-- Wybierz służbę --" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableServices.map((configuredService) => (
                            <SelectItem key={configuredService.key} value={configuredService.key}>
                              {configuredService.label[getCurrentLocale()]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldErrors
                        id="admin-incident-service-errors"
                        errors={field.state.meta.errors}
                      />
                    </div>
                  )}
                </serviceForm.Field>

                <serviceForm.Subscribe
                  selector={(state) => [state.canSubmit, state.isSubmitting] as const}
                >
                  {([canSubmit, isSubmitting]) => (
                    <Button
                      type="submit"
                      className="w-full bg-brand-primary hover:bg-brand-primary/90"
                      disabled={!canSubmit || isSubmitting}
                    >
                      Zapisz przypisanie
                    </Button>
                  )}
                </serviceForm.Subscribe>
              </form>
            )}

            <form
              className={`space-y-4 ${
                isFallbackService(incident.service) ? 'border-t border-border/70 pt-6' : ''
              }`}
              noValidate
              onSubmit={(event) => submitClientForm(event, statusForm.handleSubmit)}
            >
              <h4 className="text-gray-900">Status zgłoszenia</h4>

              <statusForm.Field name="checked">
                {(field) => (
                  <div>
                    <div className="mb-2 text-gray-700">Czy zweryfikowane?</div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={field.state.value ? 'default' : 'outline'}
                        className={field.state.value ? 'bg-success hover:bg-success/90' : ''}
                        onClick={() => field.handleChange(true)}
                      >
                        TAK
                      </Button>
                      <Button
                        type="button"
                        variant={!field.state.value ? 'default' : 'outline'}
                        className={!field.state.value ? 'bg-gray-600 hover:bg-gray-700' : ''}
                        onClick={() => field.handleChange(false)}
                      >
                        NIE
                      </Button>
                    </div>
                  </div>
                )}
              </statusForm.Field>

              <statusForm.Field name="adminStatus">
                {(field) => (
                  <div>
                    <label htmlFor="admin-incident-status" className="mb-2 block text-gray-700">
                      Status zgłoszenia
                    </label>
                    <Select
                      items={statusItems}
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (isIncidentStatus(value)) field.handleChange(value);
                      }}
                    >
                      <SelectTrigger id="admin-incident-status" className="w-full">
                        <SelectValue placeholder="Wybierz status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reported">
                          {getIncidentStatusLabel('reported')}
                        </SelectItem>
                        <SelectItem value="in_progress">
                          {getIncidentStatusLabel('in_progress')}
                        </SelectItem>
                        <SelectItem value="resolved">
                          {getIncidentStatusLabel('resolved')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </statusForm.Field>

              <statusForm.Subscribe
                selector={(state) => [state.canSubmit, state.isSubmitting] as const}
              >
                {([canSubmit, isSubmitting]) => (
                  <Button
                    type="submit"
                    className="w-full bg-brand-primary hover:bg-brand-primary/90"
                    disabled={!canSubmit || isSubmitting}
                  >
                    Zapisz status
                  </Button>
                )}
              </statusForm.Subscribe>
            </form>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
