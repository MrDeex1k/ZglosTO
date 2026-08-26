import type { IncidentStatusCode, UserRole } from '@zglosto/contracts';
import { useTranslation } from 'react-i18next';
import { getServiceLabel } from '../config/services';
import { getCurrentLocale } from '../i18n';
import { getIncidentStatusLabel } from '../lib/incident-status';
import type { Incident, NewIncidentDraft } from '../types/incident';
import { Footer } from './Footer';
import { Header } from './Header';
import { IncidentCard } from './IncidentCard';
import { getIncidentStatusFilterClassName } from './incident-status-styles';
import { IncidentDetailsDialog } from './IncidentDetailsDialog';
import { IncidentForm } from './IncidentForm';
import { INCIDENT_DIALOG_CONTENT_CLASS_NAME } from './incident-dialog-styles';
import { ServiceIncidentDialog } from './ServiceIncidentDialog';
import { Button } from './ui/button';
import { UserSummaryCard } from './UserSummaryCard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';

export interface NavigationProps {
  isLoggedIn: boolean;
  userRole: UserRole;
  onLoginClick: () => void;
  onHomeClick: () => void;
  onDashboardClick: () => void;
  onLogoutClick: () => Promise<void>;
}

export function AppShell({
  navigation,
  children,
}: {
  navigation: NavigationProps;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <Header {...navigation} />
      {children}
      <Footer />
    </div>
  );
}

interface IncidentDialogProps {
  selectedIncident: Incident | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ResidentDashboardProps extends IncidentDialogProps {
  navigation: NavigationProps;
  userDisplayName: string;
  isEmailVerified: boolean;
  incidents: Incident[];
  onIncidentClick: (incident: Incident) => void;
}

export function ResidentDashboard({
  navigation,
  userDisplayName,
  isEmailVerified,
  incidents,
  onIncidentClick,
  selectedIncident,
  isOpen,
  onOpenChange,
}: ResidentDashboardProps) {
  return (
    <AppShell navigation={navigation}>
      <main className="container mx-auto flex-1 px-4 pt-8 pb-4 lg:py-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="mb-6 text-gray-900">Panel Mieszkańca</h2>
          <UserSummaryCard displayName={userDisplayName} serviceLabel={null} />
          {!isEmailVerified && (
            <p className="mb-8 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-warning-foreground">
              Potwierdź adres e-mail, aby wcześniejsze anonimowe zgłoszenia zostały przypisane do
              Twojego profilu.
            </p>
          )}
          <div className="mb-2 lg:mb-8">
            <h3 className="text-gray-900 mb-6">Twoje zgłoszenia</h3>
            {incidents.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border">
                <p className="text-gray-500">Nie masz jeszcze żadnych zgłoszeń</p>
                <Button
                  className="mt-4 bg-brand-primary hover:bg-brand-primary/90"
                  onClick={navigation.onHomeClick}
                >
                  Zgłoś pierwszy incydent
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {incidents.map((incident) => (
                  <IncidentCard
                    key={incident.id}
                    incident={incident}
                    onClick={() => onIncidentClick(incident)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <IncidentDetailsDialog
        incident={selectedIncident}
        open={isOpen}
        onOpenChange={onOpenChange}
      />
    </AppShell>
  );
}

interface ServiceDashboardProps extends IncidentDialogProps {
  navigation: NavigationProps;
  userDisplayName: string;
  serviceKey: string | null;
  incidents: Incident[];
  statusFilter: 'ALL' | IncidentStatusCode;
  visibleCount: number;
  onStatusFilterChange: (status: 'ALL' | IncidentStatusCode) => void;
  onShowMore: () => void;
  onIncidentClick: (incident: Incident) => void;
  onUpdate: (
    incidentId: string,
    checked: boolean,
    status: IncidentStatusCode,
    resolvedImageFile: File | null,
  ) => Promise<void>;
}

export function ServiceDashboard({
  navigation,
  userDisplayName,
  serviceKey,
  incidents,
  statusFilter,
  visibleCount,
  selectedIncident,
  isOpen,
  onOpenChange,
  onStatusFilterChange,
  onShowMore,
  onIncidentClick,
  onUpdate,
}: ServiceDashboardProps) {
  const filteredIncidents =
    statusFilter === 'ALL'
      ? incidents
      : incidents.filter((incident) => incident.adminStatus === statusFilter);
  const filters: Array<'ALL' | IncidentStatusCode> = ['ALL', 'reported', 'in_progress', 'resolved'];

  return (
    <AppShell navigation={navigation}>
      <main className="container mx-auto flex-1 px-4 pt-8 pb-4 lg:py-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="mb-6 text-gray-900">Panel Służby</h2>
          <UserSummaryCard
            displayName={userDisplayName}
            serviceLabel={
              serviceKey === null
                ? 'Nieprzypisana'
                : getServiceLabel(serviceKey, getCurrentLocale())
            }
          />
          <h3 className="text-gray-900 mb-6">Zgłoszenia dla Twojej służby</h3>
          {incidents.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border">
              <p className="text-gray-500">Brak zgłoszeń dla tej służby</p>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-center gap-3 flex-wrap">
                <span className="text-gray-700">Filtruj po statusie:</span>
                {filters.map((filter) => (
                  <Button
                    key={filter}
                    variant="outline"
                    size="sm"
                    aria-pressed={statusFilter === filter}
                    className={getIncidentStatusFilterClassName(filter, statusFilter === filter)}
                    onClick={() => onStatusFilterChange(filter)}
                  >
                    {filter === 'ALL' ? 'Wszystkie' : getIncidentStatusLabel(filter)} (
                    {filter === 'ALL'
                      ? incidents.length
                      : incidents.filter((incident) => incident.adminStatus === filter).length}
                    )
                  </Button>
                ))}
              </div>
              <div className="mb-2 space-y-4 lg:mb-6">
                {filteredIncidents.slice(0, visibleCount).map((incident) => (
                  <IncidentCard
                    key={incident.id}
                    incident={incident}
                    onClick={() => onIncidentClick(incident)}
                  />
                ))}
              </div>
              {visibleCount < filteredIncidents.length && (
                <div className="text-center">
                  <Button variant="outline" onClick={onShowMore}>
                    Wczytaj więcej
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <ServiceIncidentDialog
        incident={selectedIncident}
        open={isOpen}
        onOpenChange={onOpenChange}
        onUpdate={onUpdate}
      />
    </AppShell>
  );
}

interface HomeViewProps extends IncidentDialogProps {
  navigation: NavigationProps;
  isReportDialogOpen: boolean;
  onReportDialogOpenChange: (open: boolean) => void;
  reporterEmail: string | null;
  onSubmit: (incident: NewIncidentDraft) => Promise<void>;
  incidents: Incident[];
  visibleCount: number;
  isLoading: boolean;
  error: string | null;
  onShowMore: () => void;
  onIncidentClick: (incident: Incident) => void;
}

export function HomeView({
  navigation,
  isReportDialogOpen,
  onReportDialogOpenChange,
  reporterEmail,
  onSubmit,
  incidents,
  visibleCount,
  isLoading,
  error,
  selectedIncident,
  isOpen,
  onOpenChange,
  onShowMore,
  onIncidentClick,
}: HomeViewProps) {
  const { t } = useTranslation();

  return (
    <AppShell navigation={navigation}>
      <main className="container mx-auto flex-1 px-4 pt-8 pb-4 lg:py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-gray-900 mb-4">{t(($) => $.home.title)}</h2>
            <p className="text-gray-600 mb-8">{t(($) => $.home.description)}</p>
            <Dialog open={isReportDialogOpen} onOpenChange={onReportDialogOpenChange}>
              <DialogTrigger
                render={<Button size="lg" className="bg-brand-primary hover:bg-brand-primary/90" />}
              >
                {t(($) => $.home.reportIncident)}
              </DialogTrigger>
              <DialogContent className={INCIDENT_DIALOG_CONTENT_CLASS_NAME}>
                <DialogHeader className="pr-10">
                  <DialogTitle>{t(($) => $.home.dialogTitle)}</DialogTitle>
                  <DialogDescription>{t(($) => $.home.dialogDescription)}</DialogDescription>
                </DialogHeader>
                <IncidentForm onSubmit={onSubmit} reporterEmail={reporterEmail} />
              </DialogContent>
            </Dialog>
          </div>
          <div className="mt-16">
            <h3 className="text-gray-900 mb-6">{t(($) => $.home.recentlyResolved)}</h3>
            {isLoading ? (
              <div className="text-center py-12 bg-white rounded-lg border">
                <p className="text-gray-500">{t(($) => $.home.loading)}</p>
              </div>
            ) : error ? (
              <div className="text-center py-12 bg-white rounded-lg border border-destructive/30">
                <p className="text-destructive mb-4">{error}</p>
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  {t(($) => $.common.refresh)}
                </Button>
              </div>
            ) : incidents.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border">
                <p className="text-gray-500">{t(($) => $.home.empty)}</p>
              </div>
            ) : (
              <>
                <div className="mb-2 space-y-4 lg:mb-6">
                  {incidents.slice(0, visibleCount).map((incident) => (
                    <IncidentCard
                      key={incident.id}
                      incident={incident}
                      onClick={() => onIncidentClick(incident)}
                    />
                  ))}
                </div>
                {visibleCount < incidents.length && visibleCount < 15 && (
                  <div className="text-center">
                    <Button variant="outline" onClick={onShowMore}>
                      {t(($) => $.common.showMore)}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      <IncidentDetailsDialog
        incident={selectedIncident}
        open={isOpen}
        onOpenChange={onOpenChange}
      />
    </AppShell>
  );
}
