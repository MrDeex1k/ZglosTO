/**
 * ZglosTO - Aplikacja do zgłaszania incydentów miejskich
 *
 * Dostępne widoki aplikacji (routing):
 * - 'home': Główny widok aplikacji z formularzem zgłoszeń incydentów
 * - 'login': Widok logowania dla użytkowników
 * - 'register': Widok rejestracji nowych użytkowników
 * - 'dashboard': Panel użytkownika (routing wewnętrzny w zależności od roli):
 *   - 'admin': Panel Administratorski - zarządzanie wszystkimi zgłoszeniami
 *   - 'sluzby': Panel Służby - zarządzanie zgłoszeniami przypisanymi do konkretnej służby
 *   - 'mieszkaniec': Panel Mieszkańca - przegląd własnych zgłoszeń
 */

import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { IncidentForm } from './components/IncidentForm';
import { IncidentCard } from './components/IncidentCard';
import { IncidentDetailsDialog } from './components/IncidentDetailsDialog';
import { LoginForm } from './components/LoginForm';
import { RegisterForm } from './components/RegisterForm';
import { ServiceIncidentDialog } from './components/ServiceIncidentDialog';
import { AdminPanel } from './components/AdminPanel';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog';
import { Toaster } from './components/ui/sonner';
import { fetchResolvedIncidents, fetchAllIncidents, fetchServiceIncidents, updateIncidentStatusService, updateIncidentVerificationService, uploadResolvedImageService } from './services/api';
import { useSession, signOut, type UserRole } from './lib/auth-client';
import { Loader2 } from 'lucide-react';

import './App.css'

export interface Incident {
  id: string;
  service: string;
  description: string;
  address: string;
  email: string;
  imageUrl?: string;
  resolvedImageUrl?: string;
  status: 'resolved' | 'pending' | 'in-progress';
  checked: boolean;
  adminStatus: 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY';
  createdAt: string;
  resolvedAt?: string;
}


export default function App() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [visibleIncidents, setVisibleIncidents] = useState(5);
  const [visibleServiceIncidents, setVisibleServiceIncidents] = useState(10);
  const [currentView, setCurrentView] = useState<'home' | 'login' | 'register' | 'dashboard'>('home');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [serviceStatusFilter, setServiceStatusFilter] = useState<'ALL' | 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY'>('ALL');
  const [isLoadingIncidents, setIsLoadingIncidents] = useState(true);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);

  // Stan dla wszystkich zgłoszeń administratora
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);

  // Stan dla zgłoszeń służb
  const [serviceIncidents, setServiceIncidents] = useState<Incident[]>([]);

  // Better-Auth session hook - zastępuje lokalne stany isLoggedIn, userRole, userEmail
  const { data: session, isPending: isSessionLoading } = useSession();
  
  // Pobierz dane z sesji
  const isLoggedIn = !!session?.user;
  const userEmail = session?.user?.email || '';
  const userRole: UserRole = (session?.user as any)?.uprawnienia || 'mieszkaniec';
  const userServiceType = (session?.user as any)?.typ_uprawnien || null;

  // Transform API response to Incident interface
  const transformApiIncident = (apiIncident: any): Incident => {
    return {
      id: apiIncident.id_zgloszenia,
      service: apiIncident.typ_sluzby,
      description: apiIncident.opis_zgloszenia,
      address: apiIncident.adres_zgloszenia,
      email: '', // API doesn't provide email for resolved incidents
      imageUrl: undefined, // API doesn't provide original image for resolved incidents
      resolvedImageUrl: apiIncident.zdjecie_incydentu_rozwiazanego || undefined,
      status: 'resolved', // All incidents from this endpoint are resolved
      checked: true, // Resolved incidents are typically checked
      adminStatus: apiIncident.status_incydentu as 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY',
      createdAt: apiIncident.data_godzina_zgloszenia,
      resolvedAt: apiIncident.data_godzina_rozwiazania,
    };
  };

  // Transform API response from admin endpoint to Incident interface
  const transformApiAllIncidents = (apiIncident: any): Incident => {
    return {
      id: apiIncident.id_zgloszenia,
      service: apiIncident.typ_sluzby,
      description: apiIncident.opis_zgloszenia,
      address: apiIncident.adres_zgloszenia,
      email: apiIncident.mail_zglaszajacego,
      imageUrl: apiIncident.zdjecie_incydentu_zglaszanego || undefined,
      resolvedImageUrl: apiIncident.zdjecie_incydentu_rozwiazanego || undefined,
      status: apiIncident.status_incydentu === 'NAPRAWIONY' ? 'resolved' : 'pending',
      checked: apiIncident.sprawdzenie_incydentu,
      adminStatus: apiIncident.status_incydentu as 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY',
      createdAt: apiIncident.data_godzina_zgloszenia,
      resolvedAt: apiIncident.data_godzina_rozwiazania || undefined,
    };
  };

  // Transform API response from service endpoint to Incident interface
  const transformApiServiceIncidents = (apiIncident: any): Incident => {
    return {
      id: apiIncident.id_zgloszenia,
      service: apiIncident.typ_sluzby,
      description: apiIncident.opis_zgloszenia,
      address: apiIncident.adres_zgloszenia,
      email: apiIncident.mail_zglaszajacego || '',
      imageUrl: apiIncident.zdjecie_incydentu_zglaszanego || undefined,
      resolvedImageUrl: apiIncident.zdjecie_incydentu_rozwiazanego || undefined,
      status: apiIncident.status_incydentu === 'NAPRAWIONY' ? 'resolved' : 'pending',
      checked: apiIncident.sprawdzenie_incydentu,
      adminStatus: apiIncident.status_incydentu as 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY',
      createdAt: apiIncident.data_godzina_zgloszenia,
      resolvedAt: apiIncident.data_godzina_rozwiazania || undefined,
    };
  };

  // Fetch resolved incidents on component mount
  useEffect(() => {
    const loadIncidents = async () => {
      try {
        setIsLoadingIncidents(true);
        setIncidentsError(null);
        const apiIncidents = await fetchResolvedIncidents();
        const transformedIncidents = apiIncidents.map(transformApiIncident);
        setIncidents(transformedIncidents);
      } catch (error) {
        console.error('Failed to load incidents:', error);
        setIncidentsError('Nie udało się załadować zgłoszeń. Spróbuj odświeżyć stronę.');
        // Leave incidents empty if API fails
        setIncidents([]);
      } finally {
        setIsLoadingIncidents(false);
      }
    };

    loadIncidents();
  }, []);

  // Fetch all incidents for admin panel when admin logs in
  useEffect(() => {
    const loadAllIncidents = async () => {
      if (userRole === 'admin' && isLoggedIn) {
        try {
          const apiIncidents = await fetchAllIncidents();
          const transformedIncidents = apiIncidents.map(transformApiAllIncidents);
          setAllIncidents(transformedIncidents);
        } catch (error) {
          console.error('Failed to load all incidents:', error);
          setAllIncidents([]);
        }
      }
    };

    loadAllIncidents();
  }, [userRole, isLoggedIn]);

  // Fetch service incidents for service panel when service user logs in
  useEffect(() => {
    const loadServiceIncidents = async () => {
      if (userRole === 'sluzby' && isLoggedIn) {
        try {
          const apiIncidents = await fetchServiceIncidents();
          const transformedIncidents = apiIncidents.map(transformApiServiceIncidents);
          setServiceIncidents(transformedIncidents);
        } catch (error) {
          console.error('Failed to load service incidents:', error);
          setServiceIncidents([]);
        }
      }
    };

    loadServiceIncidents();
  }, [userRole, isLoggedIn]);

  // Wyświetl loading screen podczas ładowania sesji
  if (isSessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Ładowanie...</p>
        </div>
      </div>
    );
  }

  const handleSubmitIncident = async (incident: Omit<Incident, 'id' | 'status' | 'createdAt'>) => {
    // Incident is already saved by IncidentForm, just update local state
    const newIncident: Incident = {
      ...incident,
      id: Date.now().toString(),
      status: 'pending',
      adminStatus: 'ZGŁOSZONY',
      createdAt: new Date().toISOString(),
    };

    setIncidents([newIncident, ...incidents]);
    setIsDialogOpen(false);
  };

  const showMoreIncidents = () => {
    setVisibleIncidents(15); // Pokazuje wszystkie 15 zgłoszeń (5 początkowych + 10 dodatkowych)
  };

  const handleLoginSuccess = (_role: UserRole, _email: string) => {
    // Sesja jest teraz zarządzana przez Better-Auth hook useSession()
    // Po pomyślnym logowaniu, useSession automatycznie zaktualizuje stan
    setCurrentView('dashboard');
  };

  const handleHomeClick = () => {
    setCurrentView('home');
  };

  const handleDashboardClick = () => {
    setCurrentView('dashboard');
  };

  const handleLoginClick = () => {
    setCurrentView('login');
  };

  const handleLogoutClick = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          setCurrentView('home');
        }
      }
    });
  };

  const handleIncidentClick = (incident: Incident) => {
    setSelectedIncident(incident);
    setIsDetailsDialogOpen(true);
  };

  const handleUpdateIncident = async (incidentId: string, checked: boolean, adminStatus: 'ZGŁOSZONY' | 'W TRAKCIE NAPRAWY' | 'NAPRAWIONY', resolvedImageBase64?: string) => {
    try {
      if (userRole === 'sluzby') {
        // Dla służb używamy API służb
        await updateIncidentStatusService(incidentId, adminStatus);
        await updateIncidentVerificationService(incidentId, checked);

        if (resolvedImageBase64) {
          await uploadResolvedImageService(incidentId, resolvedImageBase64);
        }

        // Aktualizuj lokalny stan dla służb
        setServiceIncidents(prevIncidents =>
          prevIncidents.map(inc =>
            inc.id === incidentId
              ? { ...inc, checked, adminStatus, resolvedImageUrl: resolvedImageBase64 || inc.resolvedImageUrl }
              : inc
          )
        );
      } else {
        // Dla innych ról (np. admin) używamy istniejącej logiki lub API admina
        setIncidents(prevIncidents =>
          prevIncidents.map(inc =>
            inc.id === incidentId
              ? { ...inc, checked, adminStatus, resolvedImageUrl: resolvedImageBase64 || inc.resolvedImageUrl }
              : inc
          )
        );
      }
    } catch (error) {
      console.error('Error updating incident:', error);
      throw error;
    }
  };
  


  const resolvedIncidents = incidents
    .filter(inc => inc.status === 'resolved')
    .sort((a, b) => {
      // Sortuj najpierw po dacie rozwiązania, potem po dacie utworzenia (malejąco)
      const dateA = new Date(a.resolvedAt || a.createdAt);
      const dateB = new Date(b.resolvedAt || b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });

  // Dashboard view
  if (currentView === 'dashboard') {
    // Panel mieszkańca - wyświetlanie zgłoszeń mieszkańca
    if (userRole === 'mieszkaniec') {
      const userIncidents = incidents.filter(inc => inc.email === userEmail);

      return (
        <div className="min-h-screen flex flex-col bg-gray-50">
          <Header 
            onLoginClick={handleLoginClick}
            onHomeClick={handleHomeClick}
            onDashboardClick={handleDashboardClick}
            onLogoutClick={handleLogoutClick}
            isLoggedIn={isLoggedIn}
            userRole={userRole}
          />
          <main className="flex-1 container mx-auto px-4 py-12">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-gray-900 mb-2">Panel Mieszkańca</h2>
              <p className="text-gray-600 mb-8">Zalogowano jako: {userEmail}</p>

              <div className="mb-8">
                <h3 className="text-gray-900 mb-6">Twoje zgłoszenia</h3>
                
                {userIncidents.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-lg border">
                    <p className="text-gray-500">Nie masz jeszcze żadnych zgłoszeń</p>
                    <Button 
                      className="mt-4 bg-blue-600 hover:bg-blue-700"
                      onClick={handleHomeClick}
                    >
                      Zgłoś pierwszy incydent
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {userIncidents.map((incident) => (
                      <IncidentCard 
                        key={incident.id} 
                        incident={incident} 
                        onClick={() => handleIncidentClick(incident)} 
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
          <Footer />
          
          {/* Incident Details Dialog */}
          <IncidentDetailsDialog 
            incident={selectedIncident}
            open={isDetailsDialogOpen}
            onOpenChange={setIsDetailsDialogOpen}
          />
        </div>
      );
    }

    // Panel służby - wyświetlanie zgłoszeń przypisanych do danej służby
    if (userRole === 'sluzby') {
      // Filtrowanie zgłoszeń według statusu - API już filtruje po służbie
      const filteredServiceIncidents = serviceStatusFilter === 'ALL'
        ? serviceIncidents.filter(inc => inc.adminStatus === 'ZGŁOSZONY' || inc.adminStatus === 'W TRAKCIE NAPRAWY')
        : serviceIncidents.filter(inc => inc.adminStatus === serviceStatusFilter);

      return (
        <div className="min-h-screen flex flex-col bg-gray-50">
          <Header 
            onLoginClick={handleLoginClick}
            onHomeClick={handleHomeClick}
            onDashboardClick={handleDashboardClick}
            onLogoutClick={handleLogoutClick}
            isLoggedIn={isLoggedIn}
            userRole={userRole}
          />
          <main className="flex-1 container mx-auto px-4 py-12">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-gray-900 mb-2">Panel Służby</h2>
              <p className="text-gray-600 mb-2">Zalogowano jako: {userEmail}</p>
              <p className="text-gray-600 mb-8">Służba: <span className="font-semibold">{userServiceType || 'Nieprzypisana'}</span></p>

              <div className="mb-8">
                <h3 className="text-gray-900 mb-6">Zgłoszenia dla Twojej służby</h3>

                {serviceIncidents.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-lg border">
                    <p className="text-gray-500">Brak zgłoszeń dla tej służby</p>
                  </div>
                ) : (
                  <>
                    {/* Filtry statusów */}
                    <div className="mb-6 flex items-center gap-3 flex-wrap">
                      <span className="text-gray-700">Filtruj po statusie:</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`border-2 ${
                          serviceStatusFilter === 'ALL'
                            ? 'bg-gray-200 border-gray-500'
                            : 'border-gray-300 hover:bg-gray-50'
                        }`}
                        onClick={() => setServiceStatusFilter('ALL')}
                      >
                        Wszystkie ({filteredServiceIncidents.length})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`border-2 ${
                          serviceStatusFilter === 'ZGŁOSZONY'
                            ? 'bg-gray-200 border-gray-500'
                            : 'border-gray-300 hover:bg-gray-50'
                        }`}
                        onClick={() => setServiceStatusFilter('ZGŁOSZONY')}
                      >
                        ZGŁOSZONY ({serviceIncidents.filter(inc => inc.adminStatus === 'ZGŁOSZONY').length})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`border-2 ${
                          serviceStatusFilter === 'W TRAKCIE NAPRAWY'
                            ? 'bg-orange-200 border-orange-500'
                            : 'border-orange-300 hover:bg-orange-50'
                        }`}
                        onClick={() => setServiceStatusFilter('W TRAKCIE NAPRAWY')}
                      >
                        W TRAKCIE NAPRAWY ({serviceIncidents.filter(inc => inc.adminStatus === 'W TRAKCIE NAPRAWY').length})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`border-2 ${
                          serviceStatusFilter === 'NAPRAWIONY'
                            ? 'bg-green-200 border-green-500'
                            : 'border-green-300 hover:bg-green-50'
                        }`}
                        onClick={() => setServiceStatusFilter('NAPRAWIONY')}
                      >
                        NAPRAWIONY ({serviceIncidents.filter(inc => inc.adminStatus === 'NAPRAWIONY').length})
                      </Button>
                    </div>
                    
                    <div className="space-y-4 mb-6">
                      {filteredServiceIncidents.slice(0, visibleServiceIncidents).map((incident) => (
                        <IncidentCard
                          key={incident.id}
                          incident={incident}
                          onClick={() => handleIncidentClick(incident)}
                        />
                      ))}
                    </div>

                    {visibleServiceIncidents < filteredServiceIncidents.length && (
                      <div className="text-center">
                        <Button 
                          variant="outline" 
                          onClick={() => setVisibleServiceIncidents(prev => prev + 10)}
                        >
                          Wczytaj więcej
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </main>
          <Footer />
          
          {/* Service Incident Dialog */}
          <ServiceIncidentDialog 
            incident={selectedIncident}
            open={isDetailsDialogOpen}
            onOpenChange={setIsDetailsDialogOpen}
            onUpdate={handleUpdateIncident}
          />
        </div>
      );
    }

    // Panel dla admina (placeholder)
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header 
          onLoginClick={handleLoginClick}
          onHomeClick={handleHomeClick}
          onDashboardClick={handleDashboardClick}
          onLogoutClick={handleLogoutClick}
          isLoggedIn={isLoggedIn}
          userRole={userRole}
        />
        <main className="flex-1 container mx-auto px-4">
          <AdminPanel
            incidents={allIncidents}
            onIncidentsChange={setAllIncidents}
          />
        </main>
        <Footer />
      </div>
    );
  }

  // Login view
  if (currentView === 'login') {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header 
          onLoginClick={handleLoginClick}
          onHomeClick={handleHomeClick}
          onDashboardClick={handleDashboardClick}
          onLogoutClick={handleLogoutClick}
          isLoggedIn={isLoggedIn}
          userRole={userRole}
        />
        <LoginForm 
          onRegisterClick={() => setCurrentView('register')}
          onLoginSuccess={handleLoginSuccess}
        />
        <Footer />
      </div>
    );
  }

  // Register view
  if (currentView === 'register') {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header 
          onLoginClick={handleLoginClick}
          onHomeClick={handleHomeClick}
          onDashboardClick={handleDashboardClick}
          onLogoutClick={handleLogoutClick}
          isLoggedIn={isLoggedIn}
          userRole={userRole}
        />
        <RegisterForm 
          onLoginClick={() => setCurrentView('login')} 
          onRegisterSuccess={handleLoginSuccess}
        />
        <Footer />
      </div>
    );
  }

  // Home view
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <Header 
        onLoginClick={handleLoginClick}
        onHomeClick={handleHomeClick}
        onDashboardClick={handleDashboardClick}
        onLogoutClick={handleLogoutClick}
        isLoggedIn={isLoggedIn}
        userRole={userRole}
      />

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h2 className="text-gray-900 mb-4">
              Zgłoś problem w Twoim mieście
            </h2>
            <p className="text-gray-600 mb-8">
              Pomóż nam utrzymać miasto w lepszym stanie. Zgłaszaj incydenty bezpośrednio do odpowiednich służb miejskich.
            </p>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                  ZGŁOŚ INCYDENT
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Zgłoś nowy incydent</DialogTitle>
                  <DialogDescription>
                    Wypełnij formularz, aby zgłosić problem do odpowiedniej służby miejskiej
                  </DialogDescription>
                </DialogHeader>
                <IncidentForm onSubmit={handleSubmitIncident} />
              </DialogContent>
            </Dialog>
          </div>

          {/* Resolved Incidents Section */}
          <div className="mt-16">
            <h3 className="text-gray-900 mb-6">
              Ostatnio rozwiązane zgłoszenia
            </h3>

            {isLoadingIncidents ? (
              <div className="text-center py-12 bg-white rounded-lg border">
                <p className="text-gray-500">Ładowanie zgłoszeń...</p>
              </div>
            ) : incidentsError ? (
              <div className="text-center py-12 bg-white rounded-lg border border-red-200">
                <p className="text-red-500 mb-4">{incidentsError}</p>
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  Odśwież stronę
                </Button>
              </div>
            ) : resolvedIncidents.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border">
                <p className="text-gray-500">Brak rozwiązanych zgłoszeń</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {resolvedIncidents.slice(0, visibleIncidents).map((incident) => (
                    <IncidentCard key={incident.id} incident={incident} onClick={() => handleIncidentClick(incident)} />
                  ))}
                </div>

                {visibleIncidents < resolvedIncidents.length && visibleIncidents < 15 && (
                  <div className="text-center">
                    <Button
                      variant="outline"
                      onClick={showMoreIncidents}
                    >
                      Pokaż więcej
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
      <Toaster />
      
      {/* Incident Details Dialog */}
      <IncidentDetailsDialog 
        incident={selectedIncident}
        open={isDetailsDialogOpen}
        onOpenChange={setIsDetailsDialogOpen}
      />
    </div>
  );
}