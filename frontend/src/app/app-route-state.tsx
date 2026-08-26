/* oxlint-disable react/jsx-no-constructed-context-values -- React Compiler stabilizuje wartość bez ręcznego useMemo. */
import type { IncidentStatusCode, UserRole } from '@zglosto/contracts';
import { isUserRole } from '@zglosto/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import type { NavigationProps } from '../components/AppViews';
import { Toaster } from '../components/ui/sonner';
import { useIncidentData } from '../hooks/use-incident-data';
import { useServiceIncidentMutation } from '../hooks/use-incident-mutations';
import { signOut, useSession } from '../lib/auth-client';
import { isMobileOrTablet } from '../lib/device';
import { incidentQueryKeys } from '../queries/incidents';
import type { Incident } from '../types/incident';
import { getDashboardPath } from './app-route-paths';
import { homePathForUser, parseLocalRedirect } from './route-access';

interface AppRouteState {
  navigation: NavigationProps;
  isLoggedIn: boolean;
  userRole: UserRole;
  userEmail: string;
  isEmailVerified: boolean;
  serviceKey: string | null;
  incidents: Incident[];
  residentIncidents: Incident[];
  allIncidents: Incident[];
  serviceIncidents: Incident[];
  isLoadingIncidents: boolean;
  incidentsError: string | null;
  isReportDialogOpen: boolean;
  setIsReportDialogOpen: Dispatch<SetStateAction<boolean>>;
  visibleIncidents: number;
  showAllVisibleIncidents: () => void;
  visibleServiceIncidents: number;
  showMoreServiceIncidents: () => void;
  serviceStatusFilter: 'ALL' | IncidentStatusCode;
  setServiceStatusFilter: Dispatch<SetStateAction<'ALL' | IncidentStatusCode>>;
  selectedIncident: Incident | null;
  isDetailsDialogOpen: boolean;
  setIsDetailsDialogOpen: Dispatch<SetStateAction<boolean>>;
  openIncident: (incident: Incident) => void;
  submitIncident: () => Promise<void>;
  updateServiceIncident: (
    incidentId: string,
    checked: boolean,
    adminStatus: IncidentStatusCode,
    resolvedImageFile: File | null,
  ) => Promise<void>;
  navigateToLogin: () => void;
  navigateToRegister: () => void;
  navigateToDashboard: (role: UserRole) => void;
  completeAuthentication: (role: UserRole, redirectPath: string | null) => Promise<void>;
}

const AppRouteStateContext = createContext<AppRouteState | null>(null);

export function AppRouteStateProvider({ children }: Readonly<{ children: ReactNode }>) {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [visibleIncidents, setVisibleIncidents] = useState(5);
  const [visibleServiceIncidents, setVisibleServiceIncidents] = useState(10);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [serviceStatusFilter, setServiceStatusFilter] = useState<'ALL' | IncidentStatusCode>('ALL');
  const { data: session, isPending: isSessionLoading } = useSession();
  const sessionUser = session?.user;
  const isLoggedIn = Boolean(sessionUser);
  const userEmail = sessionUser?.email ?? '';
  const userRole: UserRole = isUserRole(sessionUser?.uprawnienia)
    ? sessionUser.uprawnienia
    : 'mieszkaniec';
  const canLoadAdminData = userRole !== 'admin' || !isMobileOrTablet();
  const {
    incidents,
    residentIncidents,
    allIncidents,
    serviceIncidents,
    isLoadingIncidents,
    incidentsError,
  } = useIncidentData({ isLoggedIn, userEmail, userRole, canLoadAdminData });
  const serviceIncidentMutation = useServiceIncidentMutation(userEmail);

  const navigateToLogin = () => {
    void navigate({ to: '/login' });
  };
  const navigateToRegister = () => {
    void navigate({ to: '/register' });
  };
  const navigateToDashboard = (role: UserRole) => {
    void navigate({ to: getDashboardPath(role) });
  };
  const navigateHome = () => {
    void navigate({
      to: homePathForUser(isLoggedIn ? { role: userRole } : null),
    });
  };
  const navigateCurrentUserToDashboard = () => {
    navigateToDashboard(userRole);
  };
  const logout = async () => {
    await signOut();
    queryClient.removeQueries({ queryKey: incidentQueryKeys.private });
    await router.invalidate();
    await navigate({ to: '/' });
  };
  const completeAuthentication = async (role: UserRole, redirectPath: string | null) => {
    await router.invalidate();
    const safeRedirectPath = parseLocalRedirect(redirectPath);
    if (safeRedirectPath !== null) {
      router.history.push(safeRedirectPath);
      return;
    }
    await navigate({ to: getDashboardPath(role) });
  };
  const navigation: NavigationProps = {
    isLoggedIn,
    userRole,
    onLoginClick: navigateToLogin,
    onHomeClick: navigateHome,
    onDashboardClick: navigateCurrentUserToDashboard,
    onLogoutClick: logout,
  };
  const openIncident = (incident: Incident) => {
    setSelectedIncident(incident);
    setIsDetailsDialogOpen(true);
  };
  const submitIncident = async () => {
    setIsReportDialogOpen(false);
  };
  const updateServiceIncident = async (
    incidentId: string,
    checked: boolean,
    adminStatus: IncidentStatusCode,
    resolvedImageFile: File | null,
  ) => {
    await serviceIncidentMutation.mutateAsync({
      incidentId,
      checked,
      adminStatus,
      resolvedImageFile,
    });
  };
  const resolvedIncidents = incidents
    .filter((incident) => incident.status === 'resolved')
    .sort(
      (first, second) =>
        new Date(second.resolvedAt ?? second.createdAt).getTime() -
        new Date(first.resolvedAt ?? first.createdAt).getTime(),
    );
  const showAllVisibleIncidents = () => setVisibleIncidents(15);
  const showMoreServiceIncidents = () => setVisibleServiceIncidents((count) => count + 10);
  const value: AppRouteState = {
    navigation,
    isLoggedIn,
    userRole,
    userEmail,
    isEmailVerified: sessionUser?.emailVerified === true,
    serviceKey: sessionUser?.serviceKey ?? null,
    incidents: resolvedIncidents,
    residentIncidents,
    allIncidents,
    serviceIncidents,
    isLoadingIncidents,
    incidentsError,
    isReportDialogOpen,
    setIsReportDialogOpen,
    visibleIncidents,
    showAllVisibleIncidents,
    visibleServiceIncidents,
    showMoreServiceIncidents,
    serviceStatusFilter,
    setServiceStatusFilter,
    selectedIncident,
    isDetailsDialogOpen,
    setIsDetailsDialogOpen,
    openIncident,
    submitIncident,
    updateServiceIncident,
    navigateToLogin,
    navigateToRegister,
    navigateToDashboard,
    completeAuthentication,
  };

  if (isSessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-primary mx-auto mb-4" />
          <p className="text-gray-600">Ładowanie...</p>
        </div>
      </div>
    );
  }

  return (
    <AppRouteStateContext.Provider value={value}>
      {children}
      <Toaster />
    </AppRouteStateContext.Provider>
  );
}

export function useAppRouteState(): AppRouteState {
  const context = useContext(AppRouteStateContext);
  if (context === null) {
    throw new Error('useAppRouteState must be used inside AppRouteStateProvider');
  }
  return context;
}
