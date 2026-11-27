import type {
  IncidentStatusCode,
  ServiceIncidentStatisticsItem,
  UserRole,
} from '@zglosto/contracts';
import { useForm } from '@tanstack/react-form';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, FileText, UserCog, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { assignableServices, getFallbackServiceLabel, isFallbackService } from '../config/services';
import { whiteLabelConfig } from '../config/white-label';
import { getCurrentLocale } from '../i18n';
import {
  useAdminIncidentServiceMutation,
  useAdminIncidentStatusMutation,
} from '../hooks/use-incident-mutations';
import { getIncidentStatusLabel } from '../lib/incident-status';
import {
  createRolePermissionFormSchema,
  type IncidentStatusFormValues,
  type RolePermissionFormValues,
} from '../forms/schemas';
import { submitClientForm } from '../forms/submit';
import {
  adminIncidentsQueryOptions,
  adminIncidentStatisticsQueryOptions,
  incidentCount,
  incidentQueryKeys,
} from '../queries/incidents';
import { updateUserPermissions } from '../services/api';
import type { Incident } from '../types/incident';
import { AdminIncidentDialog } from './AdminIncidentDialog';
import { FieldErrors } from './forms/field-errors';
import { IncidentPageControls, type IncidentPagination } from './IncidentPageControls';
import { IncidentCard } from './IncidentCard';
import { getIncidentStatusFilterClassName } from './incident-status-styles';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

type AdminView = 'menu' | 'all' | 'unassigned' | 'permissions';

const INCIDENT_STATUS_FILTERS: ReadonlyArray<'ALL' | IncidentStatusCode> = [
  'ALL',
  'reported',
  'in_progress',
  'resolved',
];
const ROLE_DEFAULT_VALUES: RolePermissionFormValues = {
  email: '',
  role: 'mieszkaniec',
  serviceKey: '',
};

interface AdminMenuProps {
  totalCount: number | undefined;
  unassignedCount: number | undefined;
  onViewChange: (view: AdminView) => void;
}

function AdminMenu({ totalCount, unassignedCount, onViewChange }: AdminMenuProps) {
  const entries = [
    {
      view: 'all' as const,
      title: 'Zobacz wszystkie zgłoszenia',
      description: 'Przeglądaj i zarządzaj wszystkimi zgłoszeniami w systemie',
      count: totalCount === undefined ? null : `${totalCount} zgłoszeń`,
      icon: FileText,
    },
    {
      view: 'unassigned' as const,
      title: 'Sprawdź nieprzypisane zgłoszenia',
      description: `Zgłoszenia „${getFallbackServiceLabel(getCurrentLocale())}” wymagają przypisania`,
      count: unassignedCount === undefined ? null : `${unassignedCount} nieprzypisanych`,
      icon: AlertCircle,
    },
    {
      view: 'permissions' as const,
      title: 'Nadaj uprawnienia służb',
      description: 'Zarządzaj uprawnieniami i dostępem dla służb miejskich',
      count: null,
      icon: UserCog,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <h2 className="text-gray-900 mb-8 text-center">Panel Administratorski</h2>
      <div className="grid md:grid-cols-3 gap-6">
        {entries.map(({ view, title, description, count, icon: Icon }) => (
          <button
            key={view}
            type="button"
            aria-label={title}
            className="text-left"
            onClick={() => onViewChange(view)}
          >
            <Card className="h-full p-6 hover:shadow-lg transition-shadow border-2">
              <div className="flex flex-col items-center text-center gap-4">
                <Icon className="w-10 h-10 text-brand-primary" />
                <h3 className="text-gray-900">{title}</h3>
                <p className="text-gray-600">{description}</p>
                {count !== null && <Badge variant="secondary">{count}</Badge>}
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

interface IncidentListViewProps {
  title: string;
  incidents: Incident[];
  selectedIncident: Incident | null;
  showStatusFilters: boolean;
  statusFilter: 'ALL' | IncidentStatusCode;
  statistics: readonly ServiceIncidentStatisticsItem[] | undefined;
  pagination: IncidentPagination;
  onBack: () => void;
  onSelect: (incident: Incident | null) => void;
  onFilterChange: (filter: 'ALL' | IncidentStatusCode) => void;
  onUpdateService: (incidentId: string, service: string) => Promise<void>;
  onUpdate: (incident: Incident, values: IncidentStatusFormValues) => Promise<void>;
}

function IncidentListView({
  title,
  incidents,
  selectedIncident,
  showStatusFilters,
  statusFilter,
  statistics,
  pagination,
  onBack,
  onSelect,
  onFilterChange,
  onUpdateService,
  onUpdate,
}: IncidentListViewProps) {
  const total = incidentCount(statistics, statusFilter === 'ALL' ? undefined : statusFilter);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-4 lg:py-12">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-gray-900">
          {title}
          {total === undefined ? '' : ` (${total})`}
        </h2>
        <Button variant="outline" onClick={onBack}>
          Powrót do menu
        </Button>
      </div>
      {showStatusFilters && (
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <span className="text-gray-700">Filtruj po statusie:</span>
          {INCIDENT_STATUS_FILTERS.map((filter) => {
            const count = incidentCount(statistics, filter === 'ALL' ? undefined : filter);
            return (
              <Button
                key={filter}
                variant="outline"
                size="sm"
                aria-pressed={statusFilter === filter}
                className={getIncidentStatusFilterClassName(filter, statusFilter === filter)}
                onClick={() => onFilterChange(filter)}
              >
                {filter === 'ALL' ? 'Wszystkie' : getIncidentStatusLabel(filter)}
                {count === undefined ? '' : ` (${count})`}
              </Button>
            );
          })}
        </div>
      )}
      {incidents.length === 0 && !pagination.isPending && !pagination.isLoadingError ? (
        <Card className="p-12 text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-gray-900 mb-2">Brak zgłoszeń</h3>
          <p className="text-gray-600">Nie znaleziono zgłoszeń spełniających wybrane kryteria.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {incidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              onClick={() => onSelect(incident)}
            />
          ))}
        </div>
      )}
      <IncidentPageControls pagination={pagination} />
      <AdminIncidentDialog
        incident={selectedIncident}
        open={selectedIncident !== null}
        onOpenChange={(open) => {
          if (!open) onSelect(null);
        }}
        onUpdateService={onUpdateService}
        onUpdate={onUpdate}
      />
    </div>
  );
}

interface PermissionsAlert {
  type: 'success' | 'error';
  message: string;
}

function PermissionsView({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const [alert, setAlert] = useState<PermissionsAlert | null>(null);
  const assignableServiceKeys = assignableServices.map((service) => service.key);
  const rolePermissionSchema = createRolePermissionFormSchema(assignableServiceKeys);
  const permissionsMutation = useMutation({
    mutationFn: ({
      userEmail,
      userRole,
      serviceKey,
    }: {
      userEmail: string;
      userRole: Exclude<UserRole, 'admin'>;
      serviceKey: string | null;
    }) => updateUserPermissions(userEmail, userRole, serviceKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: incidentQueryKeys.private }),
  });
  const roleForm = useForm({
    defaultValues: ROLE_DEFAULT_VALUES,
    validators: {
      onSubmit: rolePermissionSchema,
    },
    onSubmit: async ({ value }) => {
      const permission = rolePermissionSchema.parse(value);
      try {
        await permissionsMutation.mutateAsync({
          userEmail: permission.email,
          userRole: permission.role,
          serviceKey: permission.role === 'sluzby' ? permission.serviceKey : null,
        });
        setAlert({ type: 'success', message: 'Rola użytkownika została zaktualizowana.' });
        roleForm.reset();
      } catch {
        setAlert({ type: 'error', message: 'Nie udało się zaktualizować roli użytkownika.' });
      }
    },
  });
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 10000);
    return () => clearTimeout(timer);
  }, [alert]);

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-gray-900">Zarządzanie uprawnieniami służb</h2>
        <Button variant="outline" onClick={onBack}>
          Powrót do menu
        </Button>
      </div>
      {alert && (
        <output
          className={`mb-6 p-4 rounded-lg border-2 flex items-start justify-between ${
            alert.type === 'success'
              ? 'bg-success/10 border-success'
              : 'bg-destructive/10 border-destructive'
          }`}
        >
          <p>{alert.message}</p>
          <button type="button" aria-label="Zamknij komunikat" onClick={() => setAlert(null)}>
            <X className="w-5 h-5" />
          </button>
        </output>
      )}
      <div className="space-y-6">
        <form noValidate onSubmit={(event) => submitClientForm(event, roleForm.handleSubmit)}>
          <Card className="p-6 space-y-4">
            <roleForm.Field name="email">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="role-permissions-email">Adres e-mail użytkownika</Label>
                  <Input
                    id="role-permissions-email"
                    name={field.name}
                    type="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                    aria-describedby="role-permissions-email-errors"
                    disabled={permissionsMutation.isPending}
                  />
                  <FieldErrors
                    id="role-permissions-email-errors"
                    errors={field.state.meta.errors}
                  />
                </div>
              )}
            </roleForm.Field>
            <roleForm.Field name="role">
              {(field) => (
                <fieldset>
                  <legend className="text-gray-700 mb-2">Wybierz rolę</legend>
                  <div className="flex gap-3">
                    {(['mieszkaniec', 'sluzby'] as const).map((candidate) => (
                      <Button
                        key={candidate}
                        type="button"
                        variant="outline"
                        aria-pressed={field.state.value === candidate}
                        onClick={() => field.handleChange(candidate)}
                        disabled={permissionsMutation.isPending}
                      >
                        {candidate === 'mieszkaniec' ? 'Mieszkaniec' : 'Służby'}
                      </Button>
                    ))}
                  </div>
                </fieldset>
              )}
            </roleForm.Field>
            <roleForm.Subscribe selector={(state) => state.values.role === 'sluzby'}>
              {(isServiceRole) =>
                isServiceRole ? (
                  <roleForm.Field name="serviceKey">
                    {(field) => (
                      <div className="space-y-2">
                        <Label htmlFor="permissions-service">Wybierz rodzaj służby</Label>
                        <select
                          id="permissions-service"
                          required
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          aria-invalid={field.state.meta.errors.length > 0}
                          aria-describedby="permissions-service-errors"
                          disabled={permissionsMutation.isPending}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                        >
                          <option value="">-- Wybierz służbę --</option>
                          {assignableServices.map((configuredService) => (
                            <option key={configuredService.key} value={configuredService.key}>
                              {configuredService.label[getCurrentLocale()]}
                            </option>
                          ))}
                        </select>
                        <FieldErrors
                          id="permissions-service-errors"
                          errors={field.state.meta.errors}
                        />
                      </div>
                    )}
                  </roleForm.Field>
                ) : null
              }
            </roleForm.Subscribe>
            <roleForm.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting] as const}
            >
              {([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  disabled={!canSubmit || isSubmitting || permissionsMutation.isPending}
                >
                  Zapisz rolę
                </Button>
              )}
            </roleForm.Subscribe>
          </Card>
        </form>
      </div>
    </div>
  );
}

export function AdminPanel({ owner }: { owner: string }) {
  const [view, setView] = useState<AdminView>('menu');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | IncidentStatusCode>('ALL');
  const statusMutation = useAdminIncidentStatusMutation();
  const serviceMutation = useAdminIncidentServiceMutation(owner);
  const { data: statistics } = useQuery(adminIncidentStatisticsQueryOptions(owner));
  const unassignedStatistics = statistics?.filter((row) => isFallbackService(row.typ_sluzby));
  const filters =
    view === 'unassigned'
      ? { serviceKey: whiteLabelConfig.routing.fallbackServiceKey }
      : statusFilter === 'ALL'
        ? {}
        : { status: statusFilter };
  const incidentsQuery = useInfiniteQuery({
    ...adminIncidentsQueryOptions(owner, filters),
    enabled: view === 'all' || view === 'unassigned',
  });
  const backToMenu = () => {
    setView('menu');
    setStatusFilter('ALL');
  };
  const updateIncident = async (incident: Incident, values: IncidentStatusFormValues) => {
    await statusMutation.mutateAsync({ incident, values });
  };
  const updateService = async (incidentId: string, service: string) => {
    await serviceMutation.mutateAsync({ incidentId, service });
  };

  if (view === 'menu') {
    return (
      <AdminMenu
        totalCount={incidentCount(statistics)}
        unassignedCount={incidentCount(unassignedStatistics)}
        onViewChange={setView}
      />
    );
  }
  if (view === 'permissions') {
    return <PermissionsView onBack={backToMenu} />;
  }
  return (
    <IncidentListView
      title={view === 'all' ? 'Wszystkie zgłoszenia' : 'Nieprzypisane zgłoszenia'}
      incidents={incidentsQuery.data?.pages.flatMap((page) => page.items) ?? []}
      selectedIncident={selectedIncident}
      showStatusFilters={view === 'all'}
      statusFilter={statusFilter}
      pagination={incidentsQuery}
      statistics={view === 'all' ? statistics : unassignedStatistics}
      onBack={backToMenu}
      onSelect={setSelectedIncident}
      onFilterChange={setStatusFilter}
      onUpdateService={updateService}
      onUpdate={updateIncident}
    />
  );
}
